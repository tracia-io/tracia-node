import { HttpClient } from './client'
import { TraciaError } from './errors'
import { Prompts } from './prompts'
import {
  complete,
  stream,
  responsesStream,
  resolveProvider,
  CompletionResult,
} from './providers'
import { TraciaSession } from './session'
import { Spans, INTERNAL_SET_PENDING_SPANS } from './spans'
import {
  TraciaOptions,
  TraciaErrorCode,
  LLMProvider,
  LocalPromptMessage,
  RunLocalInput,
  RunLocalResult,
  StreamResult,
  LocalStream,
  SpanStatus,
  ToolCall,
  ContentPart,
  RunResponsesInput,
  RunResponsesResult,
  ResponsesStream,
  ResponsesEvent,
  ResponsesInputItem,
} from './types'
import { generateSpanId, generateTraceId, isValidSpanIdFormat } from './utils'

export { TraciaError } from './errors'
export { TraciaSession } from './session'
export type { SessionRunLocalInput, SessionRunResponsesInput } from './session'
export type {
  TraciaOptions,
  RunVariables,
  RunOptions,
  RunResult,
  TokenUsage,
  Prompt,
  PromptListItem,
  PromptMessage,
  MessageRole,
  CreatePromptOptions,
  UpdatePromptOptions,
  // New span types
  Span,
  SpanListItem,
  SpanStatus,
  ListSpansOptions,
  ListSpansResult,
  CreateSpanPayload,
  CreateSpanResult,
  // Legacy aliases (deprecated)
  Trace,
  TraceListItem,
  TraceStatus,
  ListTracesOptions,
  ListTracesResult,
  CreateTracePayload,
  CreateTraceResult,
  // Other types
  EvaluateOptions,
  EvaluateResult,
  LocalPromptMessage,
  RunLocalInput,
  RunLocalResult,
  StreamResult,
  LocalStream,
  ToolDefinition,
  ToolParameters,
  JsonSchemaProperty,
  ToolCall,
  ToolChoice,
  FinishReason,
  // Message content parts
  TextPart,
  ToolCallPart,
  ContentPart,
  // Responses API types
  ResponsesInputItem,
  ResponsesOutputItem,
  ResponsesEvent,
  RunResponsesInput,
  RunResponsesResult,
  ResponsesStream,
} from './types'
export { TraciaErrorCode, LLMProvider } from './types'

export const Eval = {
  POSITIVE: 1,
  NEGATIVE: 0,
} as const

const DEFAULT_BASE_URL = 'https://app.tracia.io'
const MAX_PENDING_SPANS = 1000
const SPAN_RETRY_ATTEMPTS = 2
const SPAN_RETRY_DELAY_MS = 500

const SPAN_STATUS_SUCCESS: SpanStatus = 'SUCCESS'
const SPAN_STATUS_ERROR: SpanStatus = 'ERROR'

const ENV_VAR_MAP: Record<LLMProvider, string> = {
  [LLMProvider.OPENAI]: 'OPENAI_API_KEY',
  [LLMProvider.ANTHROPIC]: 'ANTHROPIC_API_KEY',
  [LLMProvider.GOOGLE]: 'GOOGLE_API_KEY',
}

function convertResponsesItemToMessage(item: ResponsesInputItem): LocalPromptMessage {
  if ('role' in item && (item.role === 'developer' || item.role === 'user')) {
    const messageItem = item as { role: 'developer' | 'user'; content: string }
    return {
      role: messageItem.role === 'developer' ? 'system' : 'user',
      content: messageItem.content,
    }
  }

  if ('type' in item && item.type === 'function_call_output') {
    // Convert Responses API function_call_output to Tracia tool message format
    const outputItem = item as { type: 'function_call_output'; call_id: string; output: string }
    return {
      role: 'tool',
      toolCallId: outputItem.call_id,
      content: outputItem.output,
    }
  }

  if ('type' in item) {
    return {
      role: 'assistant',
      content: JSON.stringify(item),
    }
  }

  return {
    role: 'user',
    content: JSON.stringify(item),
  }
}

export class Tracia {
  private readonly client: HttpClient
  private readonly pendingSpans = new Map<string, Promise<void>>()
  private readonly onSpanError?: (error: Error, spanId: string) => void
  readonly prompts: Prompts
  readonly spans: Spans

  constructor(options: TraciaOptions) {
    if (!options.apiKey) {
      throw new TraciaError(
        TraciaErrorCode.INVALID_REQUEST,
        'apiKey is required'
      )
    }

    this.client = new HttpClient({
      apiKey: options.apiKey,
      baseUrl: DEFAULT_BASE_URL,
    })

    this.onSpanError = options.onSpanError
    this.prompts = new Prompts(this.client)
    this.spans = new Spans(this.client)
    this.spans[INTERNAL_SET_PENDING_SPANS](this.pendingSpans)
  }

  /**
   * Execute an LLM call locally using the Vercel AI SDK.
   *
   * @example Non-streaming (default)
   * ```typescript
   * const result = await tracia.runLocal({
   *   model: 'gpt-4o',
   *   messages: [{ role: 'user', content: 'Hello' }],
   * })
   * console.log(result.text)
   * ```
   *
   * @example Streaming
   * ```typescript
   * const stream = tracia.runLocal({
   *   model: 'gpt-4o',
   *   messages: [{ role: 'user', content: 'Write a poem' }],
   *   stream: true,
   * })
   *
   * for await (const chunk of stream) {
   *   process.stdout.write(chunk)
   * }
   *
   * const result = await stream.result
   * console.log('Tokens used:', result.usage.totalTokens)
   * ```
   */
  runLocal(input: RunLocalInput & { stream: true }): LocalStream
  runLocal(input: RunLocalInput & { stream?: false }): Promise<RunLocalResult>
  runLocal(input: RunLocalInput): Promise<RunLocalResult> | LocalStream {
    if (input.stream === true) {
      return this.runLocalStreaming(input)
    }
    return this.runLocalNonStreaming(input)
  }

  private async runLocalNonStreaming(input: RunLocalInput): Promise<RunLocalResult> {
    this.validateRunLocalInput(input)

    let spanId = ''
    let traceId = ''
    if (input.sendTrace !== false) {
      if (input.spanId && !isValidSpanIdFormat(input.spanId)) {
        throw new TraciaError(
          TraciaErrorCode.INVALID_REQUEST,
          `Invalid span ID format. Must match: sp_ + 16 hex characters (e.g., sp_1234567890abcdef)`
        )
      }
      spanId = input.spanId || generateSpanId()
      traceId = input.traceId || generateTraceId()
    }

    const interpolatedMessages = this.interpolateMessages(input.messages, input.variables)
    const provider = resolveProvider(input.model, input.provider)
    const apiKey = this.getProviderApiKey(provider, input.providerApiKey)

    const startTime = Date.now()
    let completionResult: CompletionResult | null = null
    let caughtError: TraciaError | null = null

    try {
      completionResult = await complete({
        model: input.model,
        messages: interpolatedMessages,
        apiKey,
        provider: input.provider,
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
        topP: input.topP,
        stopSequences: input.stopSequences,
        tools: input.tools,
        toolChoice: input.toolChoice,
        providerOptions: input.customOptions,
        timeoutMs: input.timeoutMs,
        responseFormat: input.responseFormat,
      })
    } catch (error) {
      if (error instanceof TraciaError) {
        caughtError = error
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error)
        caughtError = new TraciaError(TraciaErrorCode.PROVIDER_ERROR, errorMessage)
      }
    }

    const latencyMs = Date.now() - startTime

    if (spanId) {
      this.scheduleSpanCreation(spanId, {
        spanId,
        model: input.model,
        provider: completionResult?.provider ?? provider,
        input: { messages: interpolatedMessages },
        variables: input.variables ?? null,
        output: completionResult?.text ?? null,
        status: caughtError ? SPAN_STATUS_ERROR : SPAN_STATUS_SUCCESS,
        error: caughtError?.message ?? null,
        latencyMs,
        inputTokens: completionResult?.inputTokens ?? 0,
        outputTokens: completionResult?.outputTokens ?? 0,
        totalTokens: completionResult?.totalTokens ?? 0,
        tags: input.tags,
        userId: input.userId,
        sessionId: input.sessionId,
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
        topP: input.topP,
        tools: input.tools,
        toolCalls: completionResult?.toolCalls,
        traceId,
        parentSpanId: input.parentSpanId,
      })
    }

    if (caughtError) {
      throw caughtError
    }

    const toolCalls = completionResult!.toolCalls
    const finishReason = completionResult!.finishReason
    const message = this.buildAssistantMessage(completionResult!.text, toolCalls)

    return {
      text: completionResult!.text,
      spanId,
      traceId,
      latencyMs,
      usage: {
        inputTokens: completionResult!.inputTokens,
        outputTokens: completionResult!.outputTokens,
        totalTokens: completionResult!.totalTokens,
      },
      cost: null,
      provider: completionResult!.provider,
      model: input.model,
      toolCalls,
      finishReason,
      message,
    }
  }

  private runLocalStreaming(input: RunLocalInput): LocalStream {
    this.validateRunLocalInput(input)

    let spanId = ''
    let traceId = ''
    if (input.sendTrace !== false) {
      if (input.spanId && !isValidSpanIdFormat(input.spanId)) {
        throw new TraciaError(
          TraciaErrorCode.INVALID_REQUEST,
          `Invalid span ID format. Must match: sp_ + 16 hex characters (e.g., sp_1234567890abcdef)`
        )
      }
      spanId = input.spanId || generateSpanId()
      traceId = input.traceId || generateTraceId()
    }

    const interpolatedMessages = this.interpolateMessages(input.messages, input.variables)
    const provider = resolveProvider(input.model, input.provider)
    const apiKey = this.getProviderApiKey(provider, input.providerApiKey)

    const abortController = new AbortController()
    const combinedSignal = input.signal
      ? this.combineAbortSignals(input.signal, abortController.signal)
      : abortController.signal

    return this.createLocalStream(
      input,
      interpolatedMessages,
      provider,
      apiKey,
      spanId,
      traceId,
      combinedSignal,
      abortController
    )
  }

  /**
   * Execute an LLM call using OpenAI's Responses API.
   *
   * The Responses API is OpenAI-specific and supports:
   * - Reasoning models (o1, o3-mini) with reasoning summaries
   * - Multi-turn conversations with output items
   * - Different input format (developer/user roles, function_call_output)
   *
   * @example Non-streaming (default)
   * ```typescript
   * const result = await tracia.runResponses({
   *   model: 'o3-mini',
   *   input: [
   *     { role: 'developer', content: 'You are helpful.' },
   *     { role: 'user', content: 'What is 2+2?' },
   *   ],
   * })
   * console.log(result.text)
   * ```
   *
   * @example Streaming
   * ```typescript
   * const stream = tracia.runResponses({
   *   model: 'o3-mini',
   *   input: [
   *     { role: 'developer', content: 'You are helpful.' },
   *     { role: 'user', content: 'What is 2+2?' },
   *   ],
   *   stream: true,
   * })
   *
   * for await (const event of stream) {
   *   if (event.type === 'text_delta') process.stdout.write(event.data)
   *   if (event.type === 'reasoning') console.log('Reasoning:', event.content)
   *   if (event.type === 'tool_call') console.log('Tool:', event.name, event.arguments)
   * }
   *
   * const result = await stream.result
   * console.log('Output items:', result.outputItems)
   * ```
   */
  runResponses(input: RunResponsesInput & { stream: true }): ResponsesStream
  runResponses(input: RunResponsesInput & { stream?: false }): Promise<RunResponsesResult>
  runResponses(input: RunResponsesInput): Promise<RunResponsesResult> | ResponsesStream {
    if (input.stream === true) {
      return this.runResponsesStreaming(input)
    }
    return this.runResponsesNonStreaming(input)
  }

  private async runResponsesNonStreaming(input: RunResponsesInput): Promise<RunResponsesResult> {
    const stream = this.runResponsesStreaming(input)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of stream) {
      // Consume events
    }

    return stream.result
  }

  private runResponsesStreaming(input: RunResponsesInput): ResponsesStream {
    this.validateResponsesInput(input)

    let spanId = ''
    let traceId = ''
    if (input.sendTrace !== false) {
      if (input.spanId && !isValidSpanIdFormat(input.spanId)) {
        throw new TraciaError(
          TraciaErrorCode.INVALID_REQUEST,
          `Invalid span ID format. Must match: sp_ + 16 hex characters (e.g., sp_1234567890abcdef)`
        )
      }
      spanId = input.spanId || generateSpanId()
      traceId = input.traceId || generateTraceId()
    }

    const apiKey = this.getProviderApiKey(LLMProvider.OPENAI, input.providerApiKey)

    const abortController = new AbortController()
    const combinedSignal = input.signal
      ? this.combineAbortSignals(input.signal, abortController.signal)
      : abortController.signal

    return this.createResponsesStream(
      input,
      apiKey,
      spanId,
      traceId,
      combinedSignal,
      abortController
    )
  }

  private validateResponsesInput(input: RunResponsesInput): void {
    if (!input.model || input.model.trim() === '') {
      throw new TraciaError(
        TraciaErrorCode.INVALID_REQUEST,
        'model is required and cannot be empty'
      )
    }

    if (!input.input || input.input.length === 0) {
      throw new TraciaError(
        TraciaErrorCode.INVALID_REQUEST,
        'input array is required and cannot be empty'
      )
    }
  }

  private createResponsesStream(
    input: RunResponsesInput,
    apiKey: string,
    spanId: string,
    traceId: string,
    signal: AbortSignal,
    abortController: AbortController
  ): ResponsesStream {
    const startTime = Date.now()
    let aborted = false
    let resolveResult: (result: RunResponsesResult) => void
    let rejectResult: (error: Error) => void

    const resultPromise = new Promise<RunResponsesResult>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })

    const providerStream = responsesStream({
      model: input.model,
      input: input.input,
      apiKey,
      tools: input.tools,
      maxOutputTokens: input.maxOutputTokens,
      timeoutMs: input.timeoutMs,
      signal,
      providerOptions: input.customOptions,
    })

    let collectedText = ''
    const scheduleSpan = this.scheduleSpanCreation.bind(this)

    async function* wrappedEvents(): AsyncGenerator<ResponsesEvent> {
      try {
        for await (const event of providerStream.events) {
          if (event.type === 'text_delta') {
            collectedText += event.data
          }
          yield event
        }

        const providerResult = await providerStream.result
        const latencyMs = Date.now() - startTime

        if (spanId) {
          scheduleSpan(spanId, {
            spanId,
            model: input.model,
            provider: LLMProvider.OPENAI,
            input: { messages: input.input.map(item => convertResponsesItemToMessage(item)) },
            variables: null,
            output: providerResult.text,
            status: providerResult.aborted ? SPAN_STATUS_ERROR : SPAN_STATUS_SUCCESS,
            error: providerResult.aborted ? 'Stream aborted' : null,
            latencyMs,
            inputTokens: providerResult.usage.inputTokens,
            outputTokens: providerResult.usage.outputTokens,
            totalTokens: providerResult.usage.totalTokens,
            tags: input.tags,
            userId: input.userId,
            sessionId: input.sessionId,
            tools: input.tools,
            toolCalls: providerResult.toolCalls.map(tc => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
            })),
            traceId,
            parentSpanId: input.parentSpanId,
          })
        }

        resolveResult!({
          text: providerResult.text,
          spanId,
          traceId,
          latencyMs,
          usage: providerResult.usage,
          outputItems: providerResult.outputItems,
          toolCalls: providerResult.toolCalls,
          aborted: providerResult.aborted,
        })
      } catch (error) {
        const latencyMs = Date.now() - startTime
        const isAborted = aborted || signal.aborted
        const errorMessage = isAborted
          ? 'Stream aborted'
          : error instanceof Error
            ? error.message
            : String(error)

        if (spanId) {
          scheduleSpan(spanId, {
            spanId,
            model: input.model,
            provider: LLMProvider.OPENAI,
            input: { messages: input.input.map(item => convertResponsesItemToMessage(item)) },
            variables: null,
            output: collectedText || null,
            status: SPAN_STATUS_ERROR,
            error: errorMessage,
            latencyMs,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            tags: input.tags,
            userId: input.userId,
            sessionId: input.sessionId,
            tools: input.tools,
            traceId,
            parentSpanId: input.parentSpanId,
          })
        }

        if (isAborted) {
          resolveResult!({
            text: collectedText,
            spanId,
            traceId,
            latencyMs,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            outputItems: [],
            toolCalls: [],
            aborted: true,
          })
        } else {
          const traciaError =
            error instanceof TraciaError
              ? error
              : new TraciaError(TraciaErrorCode.PROVIDER_ERROR, errorMessage)
          rejectResult!(traciaError)
          throw traciaError
        }
      }
    }

    const asyncIterator = wrappedEvents()

    return {
      spanId,
      traceId,
      [Symbol.asyncIterator]() {
        return asyncIterator
      },
      result: resultPromise,
      abort() {
        aborted = true
        abortController.abort()
      },
    }
  }

  private createLocalStream(
    input: RunLocalInput,
    interpolatedMessages: LocalPromptMessage[],
    provider: LLMProvider,
    apiKey: string,
    spanId: string,
    traceId: string,
    signal: AbortSignal,
    abortController: AbortController
  ): LocalStream {
    const startTime = Date.now()
    let aborted = false
    let resolveResult: (result: StreamResult) => void
    let rejectResult: (error: Error) => void

    const resultPromise = new Promise<StreamResult>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })

    const providerStream = stream({
      model: input.model,
      messages: interpolatedMessages,
      apiKey,
      provider: input.provider,
      temperature: input.temperature,
      maxOutputTokens: input.maxOutputTokens,
      topP: input.topP,
      stopSequences: input.stopSequences,
      tools: input.tools,
      toolChoice: input.toolChoice,
      timeoutMs: input.timeoutMs,
      signal,
      providerOptions: input.customOptions,
      responseFormat: input.responseFormat,
    })

    let collectedText = ''
    const scheduleSpan = this.scheduleSpanCreation.bind(this)
    const buildAssistantMessage = this.buildAssistantMessage.bind(this)

    async function* wrappedChunks(): AsyncGenerator<string> {
      try {
        for await (const chunk of providerStream.chunks) {
          collectedText += chunk
          yield chunk
        }

        const completionResult = await providerStream.result
        const latencyMs = Date.now() - startTime

        if (spanId) {
          scheduleSpan(spanId, {
            spanId,
            model: input.model,
            provider: completionResult.provider,
            input: { messages: interpolatedMessages },
            variables: input.variables ?? null,
            output: completionResult.text,
            status: SPAN_STATUS_SUCCESS,
            error: null,
            latencyMs,
            inputTokens: completionResult.inputTokens,
            outputTokens: completionResult.outputTokens,
            totalTokens: completionResult.totalTokens,
            tags: input.tags,
            userId: input.userId,
            sessionId: input.sessionId,
            temperature: input.temperature,
            maxOutputTokens: input.maxOutputTokens,
            topP: input.topP,
            tools: input.tools,
            toolCalls: completionResult.toolCalls,
            traceId,
            parentSpanId: input.parentSpanId,
          })
        }

        const toolCalls = completionResult.toolCalls
        const finishReason = completionResult.finishReason
        const message = buildAssistantMessage(completionResult.text, toolCalls)

        resolveResult!({
          text: completionResult.text,
          spanId,
          traceId,
          latencyMs,
          usage: {
            inputTokens: completionResult.inputTokens,
            outputTokens: completionResult.outputTokens,
            totalTokens: completionResult.totalTokens,
          },
          cost: null,
          provider: completionResult.provider,
          model: input.model,
          aborted: false,
          toolCalls,
          finishReason,
          message,
        })
      } catch (error) {
        // Suppress the inner provider result promise rejection — it carries
        // the same error we already handle here.
        providerStream.result.catch(() => {})

        const latencyMs = Date.now() - startTime
        const isAborted = aborted || signal.aborted
        const errorMessage = isAborted
          ? 'Stream aborted'
          : error instanceof Error
            ? error.message
            : String(error)

        if (spanId) {
          scheduleSpan(spanId, {
            spanId,
            model: input.model,
            provider,
            input: { messages: interpolatedMessages },
            variables: input.variables ?? null,
            output: collectedText || null,
            status: SPAN_STATUS_ERROR,
            error: errorMessage,
            latencyMs,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            tags: input.tags,
            userId: input.userId,
            sessionId: input.sessionId,
            temperature: input.temperature,
            maxOutputTokens: input.maxOutputTokens,
            topP: input.topP,
            traceId,
            parentSpanId: input.parentSpanId,
          })
        }

        if (isAborted) {
          const abortedMessage = buildAssistantMessage(collectedText, [])
          resolveResult!({
            text: collectedText,
            spanId,
            traceId,
            latencyMs,
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
            },
            cost: null,
            provider,
            model: input.model,
            aborted: true,
            toolCalls: [],
            finishReason: 'stop',
            message: abortedMessage,
          })
        } else {
          const traciaError =
            error instanceof TraciaError
              ? error
              : new TraciaError(TraciaErrorCode.PROVIDER_ERROR, errorMessage)
          rejectResult!(traciaError)
          throw traciaError
        }
      }
    }

    const asyncIterator = wrappedChunks()

    return {
      spanId,
      traceId,
      [Symbol.asyncIterator]() {
        return asyncIterator
      },
      result: resultPromise,
      abort() {
        aborted = true
        abortController.abort()
      },
    }
  }

  private combineAbortSignals(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
    const controller = new AbortController()

    if (signal1.aborted || signal2.aborted) {
      controller.abort()
      return controller.signal
    }

    const onAbort = () => {
      signal1.removeEventListener('abort', onAbort)
      signal2.removeEventListener('abort', onAbort)
      controller.abort()
    }

    signal1.addEventListener('abort', onAbort, { once: true })
    signal2.addEventListener('abort', onAbort, { once: true })

    return controller.signal
  }

  async flush(): Promise<void> {
    await Promise.all(this.pendingSpans.values())
  }

  /**
   * Create a new session for grouping related spans together under a single trace.
   *
   * Sessions automatically chain spans by setting traceId and parentSpanId,
   * creating a linked sequence of spans that can be viewed together in the Tracia dashboard.
   *
   * @param options - Optional configuration for the session
   * @param options.traceId - Continue an existing trace instead of starting a new one
   * @param options.parentSpanId - Chain from an existing span
   *
   * @example
   * ```typescript
   * // Start a new trace
   * const session = tracia.createSession()
   *
   * // Or continue an existing trace (e.g., across HTTP requests)
   * const session = tracia.createSession({ traceId: previousTraceId })
   *
   * // First call - creates or continues the trace group
   * const result1 = await session.runLocal({
   *   model: 'gpt-4o',
   *   messages: [{ role: 'user', content: 'What is the weather?' }],
   * })
   *
   * // Second call - automatically linked to the first
   * const result2 = await session.runLocal({
   *   model: 'gpt-4o',
   *   messages: [...messages, result1.message, { role: 'user', content: 'What about tomorrow?' }],
   * })
   * ```
   */
  createSession(options?: { traceId?: string; parentSpanId?: string }): TraciaSession {
    return new TraciaSession(this, options?.traceId, options?.parentSpanId)
  }

  private validateRunLocalInput(input: RunLocalInput): void {
    if (!input.model || input.model.trim() === '') {
      throw new TraciaError(
        TraciaErrorCode.INVALID_REQUEST,
        'model is required and cannot be empty'
      )
    }

    if (!input.messages || input.messages.length === 0) {
      throw new TraciaError(
        TraciaErrorCode.INVALID_REQUEST,
        'messages array is required and cannot be empty'
      )
    }

    for (const message of input.messages) {
      if (message.role === 'tool') {
        // Tool messages must have toolCallId and string content
        if (!message.toolCallId) {
          throw new TraciaError(
            TraciaErrorCode.INVALID_REQUEST,
            'Tool messages must include toolCallId. ' +
              'Example: { role: "tool", toolCallId: "call_123", content: \'{"result": "data"}\' }'
          )
        }
        if (typeof message.content !== 'string') {
          throw new TraciaError(
            TraciaErrorCode.INVALID_REQUEST,
            'Tool message content must be a string (the tool result). ' +
              'Example: { role: "tool", toolCallId: "call_123", content: \'{"result": "data"}\' }'
          )
        }
      }
    }
  }

  private scheduleSpanCreation(
    spanId: string,
    payload: Parameters<Spans['create']>[0]
  ): void {
    if (this.pendingSpans.size >= MAX_PENDING_SPANS) {
      const oldestSpanId = this.pendingSpans.keys().next().value
      if (oldestSpanId) {
        this.pendingSpans.delete(oldestSpanId)
      }
    }

    const spanPromise = this.createSpanWithRetry(spanId, payload)
    this.pendingSpans.set(spanId, spanPromise)
    spanPromise.finally(() => this.pendingSpans.delete(spanId))
  }

  private async createSpanWithRetry(
    spanId: string,
    payload: Parameters<Spans['create']>[0]
  ): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= SPAN_RETRY_ATTEMPTS; attempt++) {
      try {
        await this.spans.create(payload)
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < SPAN_RETRY_ATTEMPTS) {
          await this.delay(SPAN_RETRY_DELAY_MS * (attempt + 1))
        }
      }
    }

    if (this.onSpanError && lastError) {
      this.onSpanError(lastError, spanId)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private interpolateMessages(
    messages: LocalPromptMessage[],
    variables?: Record<string, string>
  ): LocalPromptMessage[] {
    if (!variables) return messages

    return messages.map(message => {
      if (typeof message.content === 'string') {
        return {
          ...message,
          content: message.content.replace(
            /\{\{(\w+)\}\}/g,
            (match, key) => variables[key] ?? match
          ),
        }
      }

      if (message.role === 'tool') {
        return message
      }

      return {
        ...message,
        content: message.content.map(block => {
          if (block.type === 'text') {
            return {
              ...block,
              text: block.text.replace(
                /\{\{(\w+)\}\}/g,
                (match, key) => variables[key] ?? match
              ),
            }
          }
          return block
        }),
      }
    })
  }

  private buildAssistantMessage(text: string, toolCalls: ToolCall[]): LocalPromptMessage {
    if (toolCalls.length === 0) {
      return { role: 'assistant', content: text }
    }

    const contentParts: ContentPart[] = []

    if (text) {
      contentParts.push({ type: 'text', text })
    }

    for (const toolCall of toolCalls) {
      contentParts.push({
        type: 'tool_call',
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      })
    }

    return { role: 'assistant', content: contentParts }
  }

  private getProviderApiKey(provider: LLMProvider, override?: string): string {
    if (override) return override

    const envVar = ENV_VAR_MAP[provider]
    const key = process.env[envVar]

    if (!key) {
      throw new TraciaError(
        TraciaErrorCode.MISSING_PROVIDER_API_KEY,
        `Missing API key for ${provider}. Set the ${envVar} environment variable or provide providerApiKey in options.`
      )
    }

    return key
  }
}
