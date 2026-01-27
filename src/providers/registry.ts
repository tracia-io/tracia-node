import { TraciaError } from '../errors'
import { getProviderForModel } from '../models'
import { LLMProvider, TraciaErrorCode } from '../types'
import { LLMProviderAdapter } from './types'
import { OpenAIAdapter } from './openai-adapter'
import { AnthropicAdapter } from './anthropic-adapter'
import { GoogleAdapter } from './google-adapter'

export class ProviderRegistry {
  private adapters: Map<LLMProvider, LLMProviderAdapter>
  private adapterList: LLMProviderAdapter[]

  constructor() {
    const openai = new OpenAIAdapter()
    const anthropic = new AnthropicAdapter()
    const google = new GoogleAdapter()

    this.adapters = new Map<LLMProvider, LLMProviderAdapter>([
      [LLMProvider.OPENAI, openai],
      [LLMProvider.ANTHROPIC, anthropic],
      [LLMProvider.GOOGLE, google],
    ])

    this.adapterList = [openai, anthropic, google]
  }

  getAdapterForProvider(provider: LLMProvider): LLMProviderAdapter {
    const adapter = this.adapters.get(provider)
    if (!adapter) {
      throw new TraciaError(
        TraciaErrorCode.UNSUPPORTED_MODEL,
        `No adapter found for provider: ${provider}`
      )
    }
    return adapter
  }

  getAdapterForModel(modelId: string): LLMProviderAdapter {
    // First, try exact match from model definitions
    const provider = getProviderForModel(modelId)
    if (provider) {
      const adapter = this.adapters.get(provider)
      if (adapter) {
        return adapter
      }
    }

    // Fallback to prefix-based matching
    const adapter = this.adapterList.find(a => a.supportsModel(modelId))

    if (!adapter) {
      throw new TraciaError(
        TraciaErrorCode.UNSUPPORTED_MODEL,
        `No provider found for model: ${modelId}`
      )
    }

    return adapter
  }
}

