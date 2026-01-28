export interface TraciaOptions {
  apiKey: string
  /** Called when background trace creation fails */
  onTraceError?: (error: Error, traceId: string) => void
}

export interface RunVariables {
  [key: string]: string
}

export interface RunOptions {
  model?: string
  tags?: string[]
  userId?: string
  sessionId?: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface RunResult {
  text: string
  traceId: string
  promptVersion: number
  latencyMs: number
  usage: TokenUsage
  cost: number
}

export enum TraciaErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  MISSING_PROVIDER_KEY = 'MISSING_PROVIDER_KEY',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  MISSING_VARIABLES = 'MISSING_VARIABLES',
  INVALID_REQUEST = 'INVALID_REQUEST',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  ABORTED = 'ABORTED',
  UNKNOWN = 'UNKNOWN',
  MISSING_PROVIDER_SDK = 'MISSING_PROVIDER_SDK',
  MISSING_PROVIDER_API_KEY = 'MISSING_PROVIDER_API_KEY',
  UNSUPPORTED_MODEL = 'UNSUPPORTED_MODEL',
}

export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
}

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
  }
}

export interface ApiSuccessResponse {
  text: string
  traceId: string
  promptVersion: number
  latencyMs: number
  usage: TokenUsage
  cost: number
}

export type MessageRole = 'system' | 'user' | 'assistant'

export interface PromptMessage {
  id: string
  role: MessageRole
  content: string
}

export interface Prompt {
  id: string
  slug: string
  name: string
  description: string | null
  model: string | null
  currentVersion: number
  content: PromptMessage[]
  variables: string[]
  createdAt: string
  updatedAt: string
}

export interface PromptListItem {
  id: string
  slug: string
  name: string
  description: string | null
  model: string | null
  currentVersion: number
  variables: string[]
  createdAt: string
  updatedAt: string
}

export interface CreatePromptOptions {
  name: string
  slug?: string
  description?: string
  content: PromptMessage[]
}

export interface UpdatePromptOptions {
  name?: string
  slug?: string
  description?: string
  content?: PromptMessage[]
}

export interface ListPromptsResponse {
  prompts: PromptListItem[]
}

export interface DeletePromptResponse {
  success: boolean
}

export type TraceStatus = 'SUCCESS' | 'ERROR'

export interface TraceListItem {
  id: string
  traceId: string
  promptSlug: string
  model: string
  status: TraceStatus
  latencyMs: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number | null
  createdAt: string
}

export interface Trace {
  id: string
  traceId: string
  promptSlug: string
  promptVersion: number
  model: string
  provider: string
  input: { messages: PromptMessage[] }
  variables: Record<string, string> | null
  output: string | null
  status: TraceStatus
  error: string | null
  latencyMs: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number | null
  tags: string[]
  userId: string | null
  sessionId: string | null
  createdAt: string
}

export interface ListTracesOptions {
  promptSlug?: string
  status?: TraceStatus
  startDate?: Date
  endDate?: Date
  userId?: string
  sessionId?: string
  tags?: string[]
  limit?: number
  cursor?: string
}

export interface ListTracesResult {
  traces: TraceListItem[]
  nextCursor?: string
}

export interface EvaluateOptions {
  evaluator: string
  value: number
  note?: string
}

export interface EvaluateResult {
  id: string
  evaluatorKey: string
  evaluatorName: string
  value: number
  source: string
  note: string | null
  createdAt: string
}

// runLocal types

export interface LocalPromptMessage {
  role: MessageRole
  content: string
}

export interface RunLocalInput {
  messages: LocalPromptMessage[]
  model: string

  /** Explicitly specify the provider. Use for new/custom models not in the built-in list. */
  provider?: LLMProvider

  temperature?: number
  maxOutputTokens?: number
  topP?: number
  stopSequences?: string[]
  /** Timeout in milliseconds for the LLM call */
  timeoutMs?: number

  /** Provider-specific options passed directly to the SDK */
  customOptions?: Record<string, unknown>

  variables?: Record<string, string>

  providerApiKey?: string

  tags?: string[]
  userId?: string
  sessionId?: string
  sendTrace?: boolean
  /** Custom trace ID. Must match format: tr_ + 16 hex characters */
  traceId?: string
}

export interface RunLocalResult {
  text: string
  traceId: string
  latencyMs: number
  usage: TokenUsage
  cost: number | null
  provider: LLMProvider
  model: string
}

export interface CreateTracePayload {
  traceId: string
  model: string
  provider: LLMProvider
  input: { messages: LocalPromptMessage[] }
  variables: Record<string, string> | null
  output: string | null
  status: TraceStatus
  error: string | null
  latencyMs: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  tags?: string[]
  userId?: string
  sessionId?: string
  temperature?: number
  maxOutputTokens?: number
  topP?: number
}

export interface CreateTraceResult {
  traceId: string
  cost: number | null
}

// Streaming types for runLocalStream

/**
 * Input options for streaming LLM calls via runLocalStream().
 */
export interface RunLocalStreamInput extends RunLocalInput {
  /** AbortSignal to cancel the stream */
  signal?: AbortSignal
}

/**
 * Final result returned after a stream completes.
 * Includes all fields from RunLocalResult plus abort status.
 */
export interface StreamResult extends RunLocalResult {
  /** Whether the stream was aborted before completion */
  aborted: boolean
}

/**
 * A streaming response from runLocalStream().
 *
 * @example
 * ```typescript
 * const stream = tracia.runLocalStream({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Write a haiku' }],
 * })
 *
 * // traceId is available immediately
 * console.log('Trace:', stream.traceId)
 *
 * // Iterate over text chunks as they arrive
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk)
 * }
 *
 * // Get final result with usage stats after iteration completes
 * const result = await stream.result
 * console.log(result.usage)
 * ```
 *
 * @remarks
 * - You must iterate over the stream for the result promise to resolve
 * - Calling abort() will stop the stream and resolve result with aborted: true
 * - The stream can only be iterated once
 */
export interface LocalStream {
  /** Trace ID for this request, available immediately */
  readonly traceId: string

  /** Async iterator yielding text chunks */
  [Symbol.asyncIterator](): AsyncIterator<string>

  /**
   * Promise that resolves to the final result after stream completes.
   * Only resolves after the stream has been fully iterated or aborted.
   */
  readonly result: Promise<StreamResult>

  /** Abort the stream. The result promise will resolve with aborted: true */
  abort(): void
}
