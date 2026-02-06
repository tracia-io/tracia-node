export interface TraciaOptions {
  apiKey: string
  /** Called when background span creation fails */
  onSpanError?: (error: Error, spanId: string) => void
}

export interface RunVariables {
  [key: string]: string
}

export interface RunOptions {
  model?: string
  tags?: string[]
  userId?: string
  sessionId?: string
  /** Trace ID to group related spans together */
  traceId?: string
  /** Parent span ID for chaining spans in a sequence */
  parentSpanId?: string
  /** Full conversation messages for multi-turn (skips template rendering) */
  messages?: LocalPromptMessage[]
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface RunResult {
  text: string
  /** Unique ID for this span (individual LLM call) */
  spanId: string
  /** Trace ID grouping related spans in a session */
  traceId: string
  promptVersion: number
  latencyMs: number
  usage: TokenUsage
  cost: number
  /** Reason the model stopped generating */
  finishReason?: FinishReason
  /** Tool calls made by the model */
  toolCalls?: ToolCall[]
  /** Parsed JSON when the prompt has an output schema configured */
  structuredOutput?: Record<string, unknown>
  /** Full conversation messages for multi-turn continuation */
  messages?: LocalPromptMessage[]
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
  spanId: string
  traceId: string
  promptVersion: number
  latencyMs: number
  usage: TokenUsage
  cost: number
  finishReason?: FinishReason
  toolCalls?: ToolCall[]
  structuredOutput?: Record<string, unknown>
  messages?: LocalPromptMessage[]
}

export type MessageRole = 'system' | 'developer' | 'user' | 'assistant' | 'tool'

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

export type SpanStatus = 'SUCCESS' | 'ERROR'

export interface SpanListItem {
  id: string
  spanId: string
  traceId: string
  parentSpanId: string | null
  promptSlug: string
  model: string
  status: SpanStatus
  latencyMs: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number | null
  createdAt: string
}

export interface Span {
  id: string
  spanId: string
  traceId: string
  parentSpanId: string | null
  promptSlug: string
  promptVersion: number
  model: string
  provider: string
  input: { messages: PromptMessage[] }
  variables: Record<string, string> | null
  output: string | null
  status: SpanStatus
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

export interface ListSpansOptions {
  promptSlug?: string
  status?: SpanStatus
  startDate?: Date
  endDate?: Date
  userId?: string
  sessionId?: string
  tags?: string[]
  limit?: number
  cursor?: string
}

export interface ListSpansResult {
  spans: SpanListItem[]
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

// Tool types

export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolParameters
}

export interface ToolParameters {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: (string | number)[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

/**
 * Tool call returned in results - user-friendly format.
 */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type ToolChoice = 'auto' | 'none' | 'required' | { tool: string }

export type FinishReason = 'stop' | 'tool_calls' | 'max_tokens'

// ============================================================================
// Message content parts
// ============================================================================

/**
 * Text content part for messages.
 */
export interface TextPart {
  type: 'text'
  text: string
}

/**
 * Tool call part in assistant messages.
 */
export interface ToolCallPart {
  type: 'tool_call'
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type ContentPart = TextPart | ToolCallPart

// ============================================================================
// Messages
// ============================================================================

/**
 * Message format for LLM conversations.
 *
 * @example System message
 * ```typescript
 * { role: 'system', content: 'You are a helpful assistant.' }
 * ```
 *
 * @example User message
 * ```typescript
 * { role: 'user', content: 'What is the weather?' }
 * ```
 *
 * @example Assistant message with tool calls
 * ```typescript
 * {
 *   role: 'assistant',
 *   content: [
 *     { type: 'text', text: 'Let me check the weather.' },
 *     { type: 'tool_call', id: 'call_123', name: 'get_weather', arguments: { location: 'Paris' } }
 *   ]
 * }
 * ```
 *
 * @example Tool result message (simple format)
 * ```typescript
 * { role: 'tool', toolCallId: 'call_123', toolName: 'get_weather', content: '{"temp": 22, "unit": "celsius"}' }
 * ```
 */
export interface LocalPromptMessage {
  role: MessageRole
  content: string | ContentPart[]
  /** Required when role is 'tool' - the ID of the tool call this is responding to */
  toolCallId?: string
  /** Required when role is 'tool' - the name of the tool that was called */
  toolName?: string
}

export interface RunLocalInput {
  messages: LocalPromptMessage[]
  model: string

  /** Enable streaming. When true, returns LocalStream. When false/undefined, returns Promise<RunLocalResult>. */
  stream?: boolean

  /** Explicitly specify the provider. Use for new/custom models not in the built-in list. */
  provider?: LLMProvider

  temperature?: number
  maxOutputTokens?: number
  topP?: number
  stopSequences?: string[]
  /** Timeout in milliseconds for the LLM call */
  timeoutMs?: number

  /** Provider-specific options passed directly to the AI SDK (e.g., { [LLMProvider.OPENAI]: { strictJsonSchema: true } }) */
  customOptions?: Partial<Record<LLMProvider, Record<string, unknown>>>

  variables?: Record<string, string>

  providerApiKey?: string

  tags?: string[]
  userId?: string
  sessionId?: string
  sendTrace?: boolean
  /** Custom span ID. Must match format: sp_ + 16 hex characters (or legacy tr_ format) */
  spanId?: string

  /** Tool definitions for function calling */
  tools?: ToolDefinition[]
  /** Control which tools the model can use */
  toolChoice?: ToolChoice

  /** Response format for structured outputs (e.g., JSON mode) */
  responseFormat?: { type: 'json' } | { type: 'json'; schema: Record<string, unknown>; name?: string; description?: string }

  /** AbortSignal to cancel the request (only used when stream: true) */
  signal?: AbortSignal

  /** Trace ID to group related spans together (uses first span's ID if not specified in session) */
  traceId?: string
  /** Parent span ID for chaining spans in a sequence */
  parentSpanId?: string
}

export interface RunLocalResult {
  text: string
  /** Unique ID for this span (individual LLM call) */
  spanId: string
  /** Trace ID grouping related spans in a session */
  traceId: string
  latencyMs: number
  usage: TokenUsage
  cost: number | null
  provider: LLMProvider
  model: string
  /** Tool calls made by the model, empty array if none */
  toolCalls: ToolCall[]
  /** Reason the model stopped generating */
  finishReason: FinishReason
  /** Full assistant message for round-tripping in multi-turn conversations */
  message: LocalPromptMessage
}

export interface CreateSpanPayload {
  spanId: string
  model: string
  provider: LLMProvider
  input: { messages: LocalPromptMessage[] }
  variables: Record<string, string> | null
  output: string | null
  status: SpanStatus
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
  tools?: ToolDefinition[]
  toolCalls?: ToolCall[]
  /** Trace ID to group related spans together */
  traceId?: string
  /** Parent span ID for chaining spans in a sequence */
  parentSpanId?: string
}

export interface CreateSpanResult {
  spanId: string
  cost: number | null
}

// Streaming types

/**
 * Final result returned after a stream completes.
 * Includes all fields from RunLocalResult plus abort status.
 */
export interface StreamResult extends RunLocalResult {
  /** Whether the stream was aborted before completion */
  aborted: boolean
}

/**
 * A streaming response from runLocal({ stream: true }).
 *
 * @example
 * ```typescript
 * const stream = tracia.runLocal({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Write a haiku' }],
 *   stream: true,
 * })
 *
 * // spanId is available immediately
 * console.log('Span:', stream.spanId)
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
  /** Span ID for this request, available immediately */
  readonly spanId: string

  /** Trace ID grouping related spans, available immediately */
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

// ============================================================================
// Responses API types (OpenAI-specific)
// ============================================================================

/**
 * Input item for the Responses API.
 * Can be a message (developer/user) or a function call output.
 */
export type ResponsesInputItem =
  | { role: 'developer' | 'user'; content: string }
  | { type: 'function_call_output'; call_id: string; output: string }
  | ResponsesOutputItem

/**
 * Output item from a Responses API call.
 * These can be added back to input for multi-turn conversations.
 */
export interface ResponsesOutputItem {
  type: 'message' | 'function_call' | 'reasoning'
  [key: string]: unknown
}

/**
 * Event yielded during Responses API streaming.
 */
export type ResponsesEvent =
  | { type: 'text_delta'; data: string }
  | { type: 'text'; data: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_call'; id: string; callId: string; name: string; arguments: Record<string, unknown> }
  | { type: 'done'; usage: TokenUsage }

/**
 * Input options for runResponses().
 */
export interface RunResponsesInput {
  /** Model to use (e.g., 'gpt-4o', 'o1', 'o3-mini') */
  model: string

  /** Input items for the conversation */
  input: ResponsesInputItem[]

  /** Enable streaming. When true, returns ResponsesStream. When false/undefined, returns Promise<RunResponsesResult>. */
  stream?: boolean

  /** Tool definitions for function calling */
  tools?: ToolDefinition[]

  /** Maximum output tokens */
  maxOutputTokens?: number

  /** Provider API key override */
  providerApiKey?: string

  /** AbortSignal to cancel the request (only used when stream: true) */
  signal?: AbortSignal

  /** Timeout in milliseconds */
  timeoutMs?: number

  /** Whether to send span to Tracia (default: true) */
  sendTrace?: boolean

  /** Custom span ID */
  spanId?: string

  /** Tags for the span */
  tags?: string[]

  /** User ID for the span */
  userId?: string

  /** Session ID for the span */
  sessionId?: string

  /** Trace ID to group related spans together (uses first span's ID if not specified in session) */
  traceId?: string
  /** Parent span ID for chaining spans in a sequence */
  parentSpanId?: string

  /** Provider-specific options passed directly to the AI SDK (e.g., { [LLMProvider.OPENAI]: { strictJsonSchema: true } }) */
  customOptions?: Partial<Record<LLMProvider, Record<string, unknown>>>
}

/**
 * Final result from a Responses API call.
 */
export interface RunResponsesResult {
  /** Final text output */
  text: string

  /** Span ID for this request */
  spanId: string

  /** Trace ID grouping related spans in a session */
  traceId: string

  /** Latency in milliseconds */
  latencyMs: number

  /** Token usage */
  usage: TokenUsage

  /** Output items that can be added back to input for multi-turn */
  outputItems: ResponsesOutputItem[]

  /** Tool calls made by the model */
  toolCalls: Array<{ id: string; callId: string; name: string; arguments: Record<string, unknown> }>

  /** Whether the stream was aborted */
  aborted: boolean
}

/**
 * A streaming response from runResponses({ stream: true }).
 *
 * @example
 * ```typescript
 * const stream = tracia.runResponses({
 *   model: 'o3-mini',
 *   input: [
 *     { role: 'developer', content: 'You are a helpful assistant.' },
 *     { role: 'user', content: 'What is 2+2?' },
 *   ],
 *   stream: true,
 * })
 *
 * for await (const event of stream) {
 *   if (event.type === 'text_delta') process.stdout.write(event.data)
 *   if (event.type === 'reasoning') console.log('Thinking:', event.content)
 *   if (event.type === 'tool_call') console.log('Tool:', event.name)
 * }
 *
 * const result = await stream.result
 * console.log('Output items:', result.outputItems)
 * ```
 */
export interface ResponsesStream {
  /** Span ID for this request, available immediately */
  readonly spanId: string

  /** Trace ID grouping related spans, available immediately */
  readonly traceId: string

  /** Async iterator yielding events */
  [Symbol.asyncIterator](): AsyncIterator<ResponsesEvent>

  /** Promise that resolves to the final result after stream completes */
  readonly result: Promise<RunResponsesResult>

  /** Abort the stream */
  abort(): void
}

// ============================================================================
// Legacy type aliases for backwards compatibility
// ============================================================================

/** @deprecated Use SpanStatus instead */
export type TraceStatus = SpanStatus

/** @deprecated Use SpanListItem instead */
export type TraceListItem = SpanListItem

/** @deprecated Use Span instead */
export type Trace = Span

/** @deprecated Use ListSpansOptions instead */
export type ListTracesOptions = ListSpansOptions

/** @deprecated Use ListSpansResult instead */
export type ListTracesResult = ListSpansResult

/** @deprecated Use CreateSpanPayload instead */
export type CreateTracePayload = CreateSpanPayload

/** @deprecated Use CreateSpanResult instead */
export type CreateTraceResult = CreateSpanResult
