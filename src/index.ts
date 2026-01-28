import { HttpClient } from './client'
import { TraciaError } from './errors'
import { Prompts } from './prompts'
import { ProviderRegistry } from './providers'
import { LLMProviderAdapter, ProviderCompletionResult } from './providers/types'
import { Traces, INTERNAL_SET_PENDING_TRACES } from './traces'
import {
  TraciaOptions,
  TraciaErrorCode,
  LLMProvider,
  LocalPromptMessage,
  RunLocalInput,
  RunLocalResult,
  RunLocalStreamInput,
  StreamResult,
  LocalStream,
  TraceStatus,
} from './types'
import { generateTraceId, isValidTraceIdFormat } from './utils'

export { TraciaError } from './errors'
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
  Trace,
  TraceListItem,
  TraceStatus,
  ListTracesOptions,
  ListTracesResult,
  EvaluateOptions,
  EvaluateResult,
  LocalPromptMessage,
  RunLocalInput,
  RunLocalResult,
  RunLocalStreamInput,
  StreamResult,
  LocalStream,
  CreateTracePayload,
  CreateTraceResult,
} from './types'
export { TraciaErrorCode, LLMProvider } from './types'

export const Eval = {
  POSITIVE: 1,
  NEGATIVE: 0,
} as const

const DEFAULT_BASE_URL = 'https://app.tracia.io'
const MAX_PENDING_TRACES = 1000
const TRACE_RETRY_ATTEMPTS = 2
const TRACE_RETRY_DELAY_MS = 500

const TRACE_STATUS_SUCCESS: TraceStatus = 'SUCCESS'
const TRACE_STATUS_ERROR: TraceStatus = 'ERROR'

const ENV_VAR_MAP: Record<LLMProvider, string> = {
  [LLMProvider.OPENAI]: 'OPENAI_API_KEY',
  [LLMProvider.ANTHROPIC]: 'ANTHROPIC_API_KEY',
  [LLMProvider.GOOGLE]: 'GOOGLE_API_KEY',
}

export class Tracia {
  private readonly client: HttpClient
  private readonly registry: ProviderRegistry
  private readonly pendingTraces = new Map<string, Promise<void>>()
  private readonly onTraceError?: (error: Error, traceId: string) => void
  readonly prompts: Prompts
  readonly traces: Traces

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

    this.onTraceError = options.onTraceError
    this.registry = new ProviderRegistry()
    this.prompts = new Prompts(this.client)
    this.traces = new Traces(this.client)
    this.traces[INTERNAL_SET_PENDING_TRACES](this.pendingTraces)
  }

  async runLocal(input: RunLocalInput): Promise<RunLocalResult> {
    this.validateRunLocalInput(input)

    let traceId = ''
    if (input.sendTrace !== false) {
      if (input.traceId && !isValidTraceIdFormat(input.traceId)) {
        throw new TraciaError(
          TraciaErrorCode.INVALID_REQUEST,
          `Invalid trace ID format. Must match: tr_ + 16 hex characters (e.g., tr_1234567890abcdef)`
        )
      }
      traceId = input.traceId || generateTraceId()
    }

    const interpolatedMessages = this.interpolateMessages(input.messages, input.variables)
    const adapter = input.provider
      ? this.registry.getAdapterForProvider(input.provider)
      : this.registry.getAdapterForModel(input.model)

    if (!adapter.isAvailable()) {
      throw new TraciaError(
        TraciaErrorCode.MISSING_PROVIDER_SDK,
        `Provider SDK for ${adapter.provider} is not installed. Please install the required SDK.`
      )
    }

    const apiKey = this.getProviderApiKey(adapter.provider, input.providerApiKey)

    const startTime = Date.now()
    let completionResult: ProviderCompletionResult | null = null
    let errorMessage: string | null = null
    try {
      completionResult = await adapter.complete({
        model: input.model,
        messages: interpolatedMessages,
        apiKey,
        config: {
          temperature: input.temperature,
          maxOutputTokens: input.maxOutputTokens,
          topP: input.topP,
          stopSequences: input.stopSequences,
          customOptions: input.customOptions,
        },
        timeoutMs: input.timeoutMs,
      })
    } catch (error) {
      if (error instanceof TraciaError) {
        errorMessage = error.message
      } else {
        errorMessage = error instanceof Error ? error.message : String(error)
      }
    }

    const latencyMs = Date.now() - startTime

    if (traceId) {
      this.scheduleTraceCreation(traceId, {
        traceId,
        model: input.model,
        provider: adapter.provider,
        input: { messages: interpolatedMessages },
        variables: input.variables ?? null,
        output: completionResult?.text ?? null,
        status: errorMessage ? TRACE_STATUS_ERROR : TRACE_STATUS_SUCCESS,
        error: errorMessage,
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
      })
    }

    if (errorMessage) {
      throw new TraciaError(TraciaErrorCode.PROVIDER_ERROR, errorMessage)
    }

    return {
      text: completionResult!.text,
      traceId,
      latencyMs,
      usage: {
        inputTokens: completionResult!.inputTokens,
        outputTokens: completionResult!.outputTokens,
        totalTokens: completionResult!.totalTokens,
      },
      cost: null,
      provider: adapter.provider,
      model: input.model,
    }
  }

  /**
   * Execute an LLM call with streaming response.
   *
   * Returns a LocalStream object that can be iterated to receive text chunks
   * as they arrive. The trace ID is available immediately, and the final
   * result (with usage stats) is available after iteration completes.
   *
   * @example
   * ```typescript
   * const stream = tracia.runLocalStream({
   *   model: 'gpt-4o',
   *   messages: [{ role: 'user', content: 'Write a poem' }],
   * })
   *
   * for await (const chunk of stream) {
   *   process.stdout.write(chunk)
   * }
   *
   * const result = await stream.result
   * console.log('Tokens used:', result.usage.totalTokens)
   * ```
   *
   * @param input - The input options including model, messages, and optional settings
   * @returns A LocalStream object for iterating chunks and accessing the final result
   * @throws {TraciaError} If validation fails (missing model, empty messages, invalid traceId format)
   */
  runLocalStream(input: RunLocalStreamInput): LocalStream {
    this.validateRunLocalInput(input)

    let traceId = ''
    if (input.sendTrace !== false) {
      if (input.traceId && !isValidTraceIdFormat(input.traceId)) {
        throw new TraciaError(
          TraciaErrorCode.INVALID_REQUEST,
          `Invalid trace ID format. Must match: tr_ + 16 hex characters (e.g., tr_1234567890abcdef)`
        )
      }
      traceId = input.traceId || generateTraceId()
    }

    const interpolatedMessages = this.interpolateMessages(input.messages, input.variables)
    const adapter = input.provider
      ? this.registry.getAdapterForProvider(input.provider)
      : this.registry.getAdapterForModel(input.model)

    if (!adapter.isAvailable()) {
      throw new TraciaError(
        TraciaErrorCode.MISSING_PROVIDER_SDK,
        `Provider SDK for ${adapter.provider} is not installed. Please install the required SDK.`
      )
    }

    const apiKey = this.getProviderApiKey(adapter.provider, input.providerApiKey)

    const abortController = new AbortController()
    const combinedSignal = input.signal
      ? this.combineAbortSignals(input.signal, abortController.signal)
      : abortController.signal

    return this.createLocalStream(
      input,
      interpolatedMessages,
      adapter,
      apiKey,
      traceId,
      combinedSignal,
      abortController
    )
  }

  private createLocalStream(
    input: RunLocalStreamInput,
    interpolatedMessages: LocalPromptMessage[],
    adapter: LLMProviderAdapter,
    apiKey: string,
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

    const providerStream = adapter.stream({
      model: input.model,
      messages: interpolatedMessages,
      apiKey,
      config: {
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
        topP: input.topP,
        stopSequences: input.stopSequences,
        customOptions: input.customOptions,
      },
      timeoutMs: input.timeoutMs,
      signal,
    })

    let collectedText = ''
    const scheduleTrace = this.scheduleTraceCreation.bind(this)

    async function* wrappedChunks(): AsyncGenerator<string> {
      try {
        for await (const chunk of providerStream.chunks) {
          collectedText += chunk
          yield chunk
        }

        const completionResult = await providerStream.result
        const latencyMs = Date.now() - startTime

        if (traceId) {
          scheduleTrace(traceId, {
            traceId,
            model: input.model,
            provider: adapter.provider,
            input: { messages: interpolatedMessages },
            variables: input.variables ?? null,
            output: completionResult.text,
            status: TRACE_STATUS_SUCCESS,
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
          })
        }

        resolveResult!({
          text: completionResult.text,
          traceId,
          latencyMs,
          usage: {
            inputTokens: completionResult.inputTokens,
            outputTokens: completionResult.outputTokens,
            totalTokens: completionResult.totalTokens,
          },
          cost: null,
          provider: adapter.provider,
          model: input.model,
          aborted: false,
        })
      } catch (error) {
        const latencyMs = Date.now() - startTime
        const isAborted = aborted || signal.aborted
        const errorMessage = isAborted
          ? 'Stream aborted'
          : error instanceof Error
            ? error.message
            : String(error)

        if (traceId) {
          scheduleTrace(traceId, {
            traceId,
            model: input.model,
            provider: adapter.provider,
            input: { messages: interpolatedMessages },
            variables: input.variables ?? null,
            output: collectedText || null,
            status: TRACE_STATUS_ERROR,
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
          })
        }

        if (isAborted) {
          resolveResult!({
            text: collectedText,
            traceId,
            latencyMs,
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
            },
            cost: null,
            provider: adapter.provider,
            model: input.model,
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

    const asyncIterator = wrappedChunks()

    return {
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

    const cleanup = () => {
      signal1.removeEventListener('abort', onAbort)
      signal2.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      cleanup()
      controller.abort()
    }

    signal1.addEventListener('abort', onAbort)
    signal2.addEventListener('abort', onAbort)

    return controller.signal
  }

  async flush(): Promise<void> {
    await Promise.all(this.pendingTraces.values())
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
  }

  private scheduleTraceCreation(
    traceId: string,
    payload: Parameters<Traces['create']>[0]
  ): void {
    if (this.pendingTraces.size >= MAX_PENDING_TRACES) {
      const oldestTraceId = this.pendingTraces.keys().next().value
      if (oldestTraceId) {
        this.pendingTraces.delete(oldestTraceId)
      }
    }

    const tracePromise = this.createTraceWithRetry(traceId, payload)
    this.pendingTraces.set(traceId, tracePromise)
    tracePromise.finally(() => this.pendingTraces.delete(traceId))
  }

  private async createTraceWithRetry(
    traceId: string,
    payload: Parameters<Traces['create']>[0]
  ): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= TRACE_RETRY_ATTEMPTS; attempt++) {
      try {
        await this.traces.create(payload)
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < TRACE_RETRY_ATTEMPTS) {
          await this.delay(TRACE_RETRY_DELAY_MS * (attempt + 1))
        }
      }
    }

    if (this.onTraceError && lastError) {
      this.onTraceError(lastError, traceId)
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

    return messages.map(message => ({
      ...message,
      content: message.content.replace(
        /\{\{(\w+)\}\}/g,
        (match, key) => variables[key] ?? match
      ),
    }))
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
