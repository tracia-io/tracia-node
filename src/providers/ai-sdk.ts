import { TraciaError } from '../errors'
import { getProviderForModel } from '../models'
import {
  LLMProvider,
  TraciaErrorCode,
  LocalPromptMessage,
  ToolDefinition,
  ToolChoice,
  ToolCall,
  FinishReason,
  TokenUsage,
  ResponsesInputItem,
  ResponsesOutputItem,
  ResponsesEvent,
} from '../types'

export interface CompletionOptions {
  model: string
  messages: LocalPromptMessage[]
  apiKey: string
  provider?: LLMProvider
  temperature?: number
  maxOutputTokens?: number
  topP?: number
  stopSequences?: string[]
  tools?: ToolDefinition[]
  toolChoice?: ToolChoice
  timeoutMs?: number
  providerOptions?: Partial<Record<LLMProvider, Record<string, unknown>>>
  responseFormat?: { type: 'json' } | { type: 'json'; schema: Record<string, unknown>; name?: string; description?: string }
}

export interface CompletionResult {
  text: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  toolCalls: ToolCall[]
  finishReason: FinishReason
  provider: LLMProvider
}

export interface StreamOptions extends CompletionOptions {
  signal?: AbortSignal
}

export interface StreamResult {
  chunks: AsyncIterable<string>
  result: Promise<CompletionResult>
}

export interface ResponsesOptions {
  model: string
  input: ResponsesInputItem[]
  apiKey: string
  tools?: ToolDefinition[]
  maxOutputTokens?: number
  timeoutMs?: number
  signal?: AbortSignal
  providerOptions?: Partial<Record<LLMProvider, Record<string, unknown>>>
}

export interface ResponsesResult {
  text: string
  usage: TokenUsage
  outputItems: ResponsesOutputItem[]
  toolCalls: Array<{ id: string; callId: string; name: string; arguments: Record<string, unknown> }>
  aborted: boolean
}

export interface ResponsesStreamResult {
  events: AsyncIterable<ResponsesEvent>
  result: Promise<ResponsesResult>
}

type AISDKModule = typeof import('ai')
type OpenAIProviderModule = typeof import('@ai-sdk/openai')
type AnthropicProviderModule = typeof import('@ai-sdk/anthropic')
type GoogleProviderModule = typeof import('@ai-sdk/google')

let aiSdk: AISDKModule | null = null
let openaiProvider: OpenAIProviderModule | null = null
let anthropicProvider: AnthropicProviderModule | null = null
let googleProvider: GoogleProviderModule | null = null

async function loadAISdk(): Promise<AISDKModule> {
  if (aiSdk) return aiSdk
  try {
    aiSdk = await import('ai')
    return aiSdk
  } catch {
    throw new TraciaError(
      TraciaErrorCode.MISSING_PROVIDER_SDK,
      'Vercel AI SDK not installed. Run: npm install ai'
    )
  }
}

async function loadOpenAIProvider(): Promise<OpenAIProviderModule> {
  if (openaiProvider) return openaiProvider
  try {
    openaiProvider = await import('@ai-sdk/openai')
    return openaiProvider
  } catch {
    throw new TraciaError(
      TraciaErrorCode.MISSING_PROVIDER_SDK,
      'OpenAI provider not installed. Run: npm install @ai-sdk/openai'
    )
  }
}

async function loadAnthropicProvider(): Promise<AnthropicProviderModule> {
  if (anthropicProvider) return anthropicProvider
  try {
    anthropicProvider = await import('@ai-sdk/anthropic')
    return anthropicProvider
  } catch {
    throw new TraciaError(
      TraciaErrorCode.MISSING_PROVIDER_SDK,
      'Anthropic provider not installed. Run: npm install @ai-sdk/anthropic'
    )
  }
}

async function loadGoogleProvider(): Promise<GoogleProviderModule> {
  if (googleProvider) return googleProvider
  try {
    googleProvider = await import('@ai-sdk/google')
    return googleProvider
  } catch {
    throw new TraciaError(
      TraciaErrorCode.MISSING_PROVIDER_SDK,
      'Google provider not installed. Run: npm install @ai-sdk/google'
    )
  }
}

/**
 * Combines multiple abort signals into one, with proper cleanup to prevent memory leaks.
 * Returns undefined if no signals need to be combined.
 */
function combineAbortSignals(userSignal?: AbortSignal, timeoutMs?: number): AbortSignal | undefined {
  if (!timeoutMs && !userSignal) return undefined
  if (timeoutMs && !userSignal) return AbortSignal.timeout(timeoutMs)
  if (!timeoutMs && userSignal) return userSignal

  const timeoutSignal = AbortSignal.timeout(timeoutMs!)
  const controller = new AbortController()

  const cleanup = () => {
    userSignal!.removeEventListener('abort', onAbort)
    timeoutSignal.removeEventListener('abort', onAbort)
  }

  const onAbort = () => {
    cleanup()
    controller.abort()
  }

  userSignal!.addEventListener('abort', onAbort, { once: true })
  timeoutSignal.addEventListener('abort', onAbort, { once: true })

  return controller.signal
}

/**
 * Sanitizes error messages to prevent leaking sensitive information like API keys.
 * Removes common patterns that might contain credentials.
 */
function sanitizeErrorMessage(message: string): string {
  return message
    // Remove potential API keys (sk-xxx, tr_xxx, key-xxx patterns)
    .replace(/\b(sk-|tr_|key-|api[_-]?key[=:\s]+)[a-zA-Z0-9_-]{10,}\b/gi, '[REDACTED]')
    // Remove Bearer tokens
    .replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, 'Bearer [REDACTED]')
    // Remove base64-encoded credentials
    .replace(/Basic\s+[a-zA-Z0-9+/=]{20,}/gi, 'Basic [REDACTED]')
    // Remove authorization headers content
    .replace(/(authorization[=:\s]+)[^\s,}]+/gi, '$1[REDACTED]')
}

/**
 * Extracts detailed error information from AI SDK errors.
 *
 * AI SDK errors (AI_APICallError, etc.) carry properties like responseBody and
 * statusCode that contain the actual provider error details. The top-level
 * error.message is often unhelpful (e.g. "undefined: ...") so we dig into
 * these properties for the real message.
 */
function extractProviderErrorDetails(error: unknown): { message: string; statusCode?: number } {
  if (!(error instanceof Error)) {
    return { message: String(error) }
  }

  const errorRecord = error as unknown as Record<string, unknown>

  const statusCode = typeof errorRecord.statusCode === 'number'
    ? errorRecord.statusCode
    : typeof errorRecord.status === 'number'
      ? errorRecord.status
      : undefined

  // AI SDK's AI_APICallError stores the raw provider response in responseBody
  if (typeof errorRecord.responseBody === 'string' && errorRecord.responseBody.length > 0) {
    try {
      const parsed = JSON.parse(errorRecord.responseBody)
      const bodyMessage = parsed.message ?? parsed.error?.message ?? parsed.error
      if (typeof bodyMessage === 'string' && bodyMessage.length > 0) {
        return { message: bodyMessage, statusCode }
      }
    } catch {
      if (errorRecord.responseBody.length < 500) {
        return { message: errorRecord.responseBody as string, statusCode }
      }
    }
  }

  // Check data property for structured error info
  if (errorRecord.data && typeof errorRecord.data === 'object') {
    const data = errorRecord.data as Record<string, unknown>
    if (typeof data.message === 'string' && data.message.length > 0) {
      return { message: data.message, statusCode }
    }
  }

  // Clean up AI SDK's "undefined: " prefix that appears when the error code is undefined
  let message = error.message
  if (message.startsWith('undefined: ')) {
    message = message.slice('undefined: '.length)
  }

  // Walk the cause chain for more details
  const cause = (error as unknown as { cause?: unknown }).cause
  if (cause instanceof Error) {
    const causeDetails = extractProviderErrorDetails(cause)
    if (causeDetails.message !== message) {
      return {
        message: causeDetails.message,
        statusCode: statusCode ?? causeDetails.statusCode,
      }
    }
  }

  return { message, statusCode }
}

/**
 * Builds a user-facing error message with provider, model, HTTP status, and details.
 */
function buildProviderErrorMessage(
  provider: string,
  model: string,
  details: { message: string; statusCode?: number }
): string {
  const statusPart = details.statusCode ? ` (HTTP ${details.statusCode})` : ''
  return `${provider} error for model "${model}"${statusPart}: ${sanitizeErrorMessage(details.message)}`
}

export function resolveProvider(model: string, explicitProvider?: LLMProvider): LLMProvider {
  if (explicitProvider) return explicitProvider

  const fromRegistry = getProviderForModel(model)
  if (fromRegistry) return fromRegistry

  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
    return LLMProvider.OPENAI
  }
  if (model.startsWith('claude-')) {
    return LLMProvider.ANTHROPIC
  }
  if (model.startsWith('gemini-')) {
    return LLMProvider.GOOGLE
  }

  throw new TraciaError(
    TraciaErrorCode.UNSUPPORTED_MODEL,
    `Cannot determine provider for model: ${model}. Specify provider explicitly.`
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLanguageModel(provider: LLMProvider, model: string, apiKey: string): Promise<any> {
  switch (provider) {
    case LLMProvider.OPENAI: {
      const { createOpenAI } = await loadOpenAIProvider()
      const openai = createOpenAI({ apiKey })
      return openai(model)
    }
    case LLMProvider.ANTHROPIC: {
      const { createAnthropic } = await loadAnthropicProvider()
      const anthropic = createAnthropic({ apiKey })
      return anthropic(model)
    }
    case LLMProvider.GOOGLE: {
      const { createGoogleGenerativeAI } = await loadGoogleProvider()
      const google = createGoogleGenerativeAI({ apiKey })
      return google(model)
    }
    default:
      throw new TraciaError(
        TraciaErrorCode.UNSUPPORTED_MODEL,
        `Unsupported provider: ${provider}`
      )
  }
}

/**
 * Converts Tracia messages to AI SDK v6 ModelMessage format.
 */
function convertMessages(messages: LocalPromptMessage[]): Array<{
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown }>
}> {
  return messages.map(msg => {
    // Tool messages: convert from simple format { role: 'tool', toolCallId, toolName, content: string }
    // to AI SDK format { role: 'tool', content: [{ type: 'tool-result', ... }] }
    if (msg.role === 'tool') {
      return {
        role: 'tool' as const,
        content: [{
          type: 'tool-result',
          toolCallId: msg.toolCallId,
          toolName: msg.toolName ?? msg.toolCallId, // Use toolName, fallback to toolCallId
          output: { type: 'text', value: msg.content as string },
        }],
      }
    }

    // Assistant messages with array content: convert tool_call parts to AI SDK tool-call format
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      if (msg.content.length === 0) {
        return { role: 'assistant' as const, content: '' }
      }
      const convertedContent = msg.content.map(part => {
        if (part.type === 'tool_call') {
          const toolCall = part as { type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown> }
          return {
            type: 'tool-call',
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            input: toolCall.arguments,
          }
        }
        return part // TextPart passes through unchanged
      })
      return {
        role: 'assistant' as const,
        content: convertedContent,
      }
    }

    // System/user/assistant messages with string content: pass through
    // Convert 'developer' role to 'system' for AI SDK compatibility
    const role = msg.role === 'developer' ? 'system' : msg.role as 'system' | 'user' | 'assistant'
    return {
      role,
      content: typeof msg.content === 'string'
        ? msg.content
        : msg.content.map(b => b.type === 'text' ? (b as { text: string }).text : '').join(''),
    }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function convertTools(tools?: ToolDefinition[]): Promise<Record<string, any> | undefined> {
  if (!tools || tools.length === 0) return undefined

  const { tool, jsonSchema } = await loadAISdk()

  const result: Record<string, any> = {}
  for (const toolDef of tools) {
    const t = tool({
      description: toolDef.description,
      inputSchema: jsonSchema(toolDef.parameters),
      execute: async (args: any) => args,
    })
    // Set strict: false to match the OpenAI Chat Completions default.
    // The Responses API defaults strict to true, which prevents open-ended
    // object schemas (e.g., { type: "object", properties: {} }) from working.
    ;(t as any).strict = false
    result[toolDef.name] = t
  }

  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertToolChoice(toolChoice?: ToolChoice): any {
  if (!toolChoice) return undefined
  if (toolChoice === 'auto') return 'auto'
  if (toolChoice === 'none') return 'none'
  if (toolChoice === 'required') return 'required'
  return { type: 'tool', toolName: toolChoice.tool }
}

function parseFinishReason(reason?: string): FinishReason {
  if (reason === 'tool-calls') return 'tool_calls'
  if (reason === 'length') return 'max_tokens'
  return 'stop'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractToolCalls(toolCalls?: any[]): ToolCall[] {
  if (!toolCalls) return []
  return toolCalls
    .filter(tc => tc.toolCallId && tc.toolName)
    .map(tc => ({
      id: tc.toolCallId,
      name: tc.toolName,
      arguments: (tc.input as Record<string, unknown>) ?? {},
    }))
}

type ProviderOptions = Record<string, Record<string, JSONValue>>
type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

// Defaults to strict: false to match the OpenAI API default. The @ai-sdk/openai
// provider defaults to strict: true, which rejects tool schemas with open-ended objects.
function mergeProviderOptions(
  userOptions?: Partial<Record<LLMProvider, Record<string, unknown>>>
): ProviderOptions {
  const defaults: ProviderOptions = {
    [LLMProvider.OPENAI]: { strictJsonSchema: false },
  }

  if (!userOptions) return defaults

  const merged = { ...defaults }
  for (const [provider, options] of Object.entries(userOptions)) {
    merged[provider] = { ...merged[provider], ...options } as Record<string, JSONValue>
  }
  return merged
}

export async function complete(options: CompletionOptions): Promise<CompletionResult> {
  const { generateText } = await loadAISdk()
  const provider = resolveProvider(options.model, options.provider)
  const model = await getLanguageModel(provider, options.model, options.apiKey)

  const convertedMessages = convertMessages(options.messages)
  const convertedTools = await convertTools(options.tools)
  const convertedToolChoice = convertToolChoice(options.toolChoice)

  try {
    const result = await generateText({
      model,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: convertedMessages as any,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
      topP: options.topP,
      stopSequences: options.stopSequences,
      tools: convertedTools,
      toolChoice: convertedToolChoice,
      abortSignal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
      providerOptions: mergeProviderOptions(options.providerOptions),
      ...(options.responseFormat && { responseFormat: options.responseFormat }),
    })

    const toolCalls = extractToolCalls(result.toolCalls)

    return {
      text: result.text,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      totalTokens: result.usage?.totalTokens ?? 0,
      toolCalls,
      finishReason: parseFinishReason(result.finishReason),
      provider,
    }
  } catch (error) {
    if (error instanceof TraciaError) throw error
    const details = extractProviderErrorDetails(error)
    throw new TraciaError(
      TraciaErrorCode.PROVIDER_ERROR,
      buildProviderErrorMessage(provider, options.model, details),
      details.statusCode
    )
  }
}

export function stream(options: StreamOptions): StreamResult {
  const provider = resolveProvider(options.model, options.provider)

  let resolveResult: (result: CompletionResult) => void
  let rejectResult: (error: Error) => void
  const resultPromise = new Promise<CompletionResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  async function* generateChunks(): AsyncGenerator<string> {
    // Captured from fullStream error events — these carry the original provider
    // error (e.g. AI_APICallError) before the AI SDK wraps it into a generic
    // "No output generated" ProviderError.
    let capturedStreamError: unknown = null

    try {
      const { streamText } = await loadAISdk()
      const model = await getLanguageModel(provider, options.model, options.apiKey)

      const convertedMessages = convertMessages(options.messages)
      const convertedTools = await convertTools(options.tools)
      const convertedToolChoice = convertToolChoice(options.toolChoice)
      const abortSignal = combineAbortSignals(options.signal, options.timeoutMs)

      const result = streamText({
        model,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: convertedMessages as any,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        topP: options.topP,
        stopSequences: options.stopSequences,
        tools: convertedTools,
        toolChoice: convertedToolChoice,
        abortSignal,
        providerOptions: mergeProviderOptions(options.providerOptions),
        ...(options.responseFormat && { responseFormat: options.responseFormat }),
      })

      // Use fullStream instead of textStream to capture original provider errors.
      // textStream swallows the original error and re-throws a generic
      // "No output generated. Check the stream for errors." ProviderError.
      for await (const event of result.fullStream) {
        if (event.type === 'text-delta') {
          yield event.text
        } else if (event.type === 'error') {
          capturedStreamError = event.error
        }
      }

      if (capturedStreamError) {
        throw capturedStreamError
      }

      const [text, usageData, toolCallsData, finishReasonData] = await Promise.all([
        result.text,
        result.usage,
        result.toolCalls,
        result.finishReason,
      ])
      const toolCalls = extractToolCalls(toolCallsData)

      resolveResult!({
        text,
        inputTokens: usageData?.inputTokens ?? 0,
        outputTokens: usageData?.outputTokens ?? 0,
        totalTokens: usageData?.totalTokens ?? 0,
        toolCalls,
        finishReason: parseFinishReason(finishReasonData),
        provider,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const traciaError = new TraciaError(TraciaErrorCode.ABORTED, 'Stream aborted')
        rejectResult!(traciaError)
        throw traciaError
      }
      const originalError = capturedStreamError ?? error
      if (originalError instanceof TraciaError) {
        rejectResult!(originalError)
        throw originalError
      }
      const details = extractProviderErrorDetails(originalError)
      const traciaError = new TraciaError(
        TraciaErrorCode.PROVIDER_ERROR,
        buildProviderErrorMessage(provider, options.model, details),
        details.statusCode
      )
      rejectResult!(traciaError)
      throw traciaError
    }
  }

  return {
    chunks: generateChunks(),
    result: resultPromise,
  }
}

export function responsesStream(options: ResponsesOptions): ResponsesStreamResult {
  let resolveResult: (result: ResponsesResult) => void
  let rejectResult: (error: Error) => void
  const resultPromise = new Promise<ResponsesResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  async function* generateEvents(): AsyncGenerator<ResponsesEvent> {
    let fullText = ''
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    const outputItems: ResponsesOutputItem[] = []
    const toolCalls: Array<{ id: string; callId: string; name: string; arguments: Record<string, unknown> }> = []
    let aborted = false
    let capturedStreamError: unknown = null

    try {
      const { createOpenAI } = await loadOpenAIProvider()
      const openai = createOpenAI({ apiKey: options.apiKey })
      const model = openai.responses(options.model)

      const { streamText } = await loadAISdk()

      // Convert tools for Responses API
      const convertedTools = options.tools ? await convertTools(options.tools) : undefined
      const abortSignal = combineAbortSignals(options.signal, options.timeoutMs)

      // Convert input items to AI SDK format:
      // - 'developer' role → 'system' role
      // - function_call_output → tool result message
      // - function_call (from outputItems) → assistant message with tool-call
      // - message (from outputItems) → assistant message with text content
      const convertedMessages = options.input.map(item => {
        // Convert developer role to system
        if ('role' in item && item.role === 'developer') {
          return { ...item, role: 'system' as const }
        }

        // Convert function_call_output to tool result format
        if ('type' in item && item.type === 'function_call_output') {
          const fcOutput = item as { type: 'function_call_output'; call_id: string; output: string }
          return {
            role: 'tool' as const,
            content: [{
              type: 'tool-result',
              toolCallId: fcOutput.call_id,
              toolName: fcOutput.call_id, // Use call_id as fallback since we don't have the name
              output: { type: 'text', value: fcOutput.output },
            }],
          }
        }

        // Convert function_call items (from outputItems) to assistant message with tool-call
        if ('type' in item && item.type === 'function_call') {
          const fc = item as { type: 'function_call'; call_id: string; name: string; arguments: string }
          return {
            role: 'assistant' as const,
            content: [{
              type: 'tool-call',
              toolCallId: fc.call_id,
              toolName: fc.name,
              input: JSON.parse(fc.arguments),
            }],
          }
        }

        // Convert message items (from outputItems) to assistant message
        if ('type' in item && item.type === 'message') {
          const msg = item as { type: 'message'; content: string }
          return {
            role: 'assistant' as const,
            content: msg.content,
          }
        }

        return item
      })

      const result = streamText({
        model,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: convertedMessages as any,
        maxOutputTokens: options.maxOutputTokens,
        tools: convertedTools,
        abortSignal,
        providerOptions: mergeProviderOptions(options.providerOptions),
      })

      for await (const event of result.fullStream) {
        if (event.type === 'text-delta') {
          fullText += event.text
          yield { type: 'text_delta', data: event.text }
        } else if (event.type === 'error') {
          capturedStreamError = event.error
        }
      }

      if (capturedStreamError) {
        throw capturedStreamError
      }

      const [usageData, toolCallsData] = await Promise.all([
        result.usage,
        result.toolCalls,
      ])

      usage = {
        inputTokens: usageData?.inputTokens ?? 0,
        outputTokens: usageData?.outputTokens ?? 0,
        totalTokens: usageData?.totalTokens ?? 0,
      }

      if (toolCallsData) {
        for (const tc of toolCallsData) {
          // Validate required fields before using
          if (!tc.toolCallId || !tc.toolName) continue
          const toolCall = {
            id: tc.toolCallId,
            callId: tc.toolCallId,
            name: tc.toolName,
            arguments: (tc.input as Record<string, unknown>) ?? {},
          }
          toolCalls.push(toolCall)

          // Add function_call to outputItems for round-tripping in multi-turn conversations
          outputItems.push({
            type: 'function_call',
            call_id: tc.toolCallId,
            name: tc.toolName,
            arguments: JSON.stringify(tc.input ?? {}),
          })

          yield {
            type: 'tool_call',
            id: toolCall.id,
            callId: toolCall.callId,
            name: toolCall.name,
            arguments: toolCall.arguments,
          }
        }
      }

      if (fullText) {
        yield { type: 'text', data: fullText }
        outputItems.push({ type: 'message', content: fullText })
      }

      yield { type: 'done', usage }

      resolveResult!({
        text: fullText,
        usage,
        outputItems,
        toolCalls,
        aborted,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        aborted = true
        resolveResult!({
          text: fullText,
          usage,
          outputItems,
          toolCalls,
          aborted,
        })
        return
      }
      const originalError = capturedStreamError ?? error
      const details = extractProviderErrorDetails(originalError)
      const traciaError = originalError instanceof TraciaError
        ? originalError
        : new TraciaError(
            TraciaErrorCode.PROVIDER_ERROR,
            `OpenAI Responses API error for model "${options.model}"${details.statusCode ? ` (HTTP ${details.statusCode})` : ''}: ${sanitizeErrorMessage(details.message)}`,
            details.statusCode
          )
      rejectResult!(traciaError)
      throw traciaError
    }
  }

  return {
    events: generateEvents(),
    result: resultPromise,
  }
}
