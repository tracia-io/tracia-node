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

export interface LLMProviderAdapter {
  readonly provider: LLMProvider
  isAvailable(): boolean
  supportsModel(modelId: string): boolean
  complete(options: ProviderCompletionOptions): Promise<ProviderCompletionResult>
}
