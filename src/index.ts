import { HttpClient } from './client'
import { TraciaError } from './errors'
import { Prompts } from './prompts'
import { ProviderRegistry } from './providers'
import { ProviderCompletionResult } from './providers/types'
import { Traces, INTERNAL_SET_PENDING_TRACES } from './traces'
import {
  TraciaOptions,
  TraciaErrorCode,
  LLMProvider,
  LocalPromptMessage,
  RunLocalInput,
  RunLocalResult,
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
