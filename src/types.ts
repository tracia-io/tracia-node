export interface TraciaOptions {
  apiKey: string
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
  UNKNOWN = 'UNKNOWN',
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