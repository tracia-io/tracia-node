import { LLMProvider, LocalPromptMessage } from '../types'

export interface LLMConfig {
  temperature?: number
  maxOutputTokens?: number
  topP?: number
  stopSequences?: string[]
  customOptions?: Record<string, unknown>
}

export interface ProviderCompletionOptions {
  model: string
  messages: LocalPromptMessage[]
  apiKey: string
  config: LLMConfig
  timeoutMs?: number
}

export interface ProviderCompletionResult {
  text: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface ProviderStreamOptions extends ProviderCompletionOptions {
  signal?: AbortSignal
}

export interface ProviderStreamResult {
  chunks: AsyncIterable<string>
  result: Promise<ProviderCompletionResult>
}

export interface LLMProviderAdapter {
  readonly provider: LLMProvider
  isAvailable(): boolean
  supportsModel(modelId: string): boolean
  complete(options: ProviderCompletionOptions): Promise<ProviderCompletionResult>
  stream(options: ProviderStreamOptions): ProviderStreamResult
}
