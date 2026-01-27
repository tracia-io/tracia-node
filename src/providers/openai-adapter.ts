import { TraciaError } from '../errors'
import { LLMProvider, TraciaErrorCode } from '../types'
import {
  LLMProviderAdapter,
  ProviderCompletionOptions,
  ProviderCompletionResult,
} from './types'

const SUPPORTED_MODEL_PREFIXES = ['gpt-', 'o1-', 'o3-']

export class OpenAIAdapter implements LLMProviderAdapter {
  readonly provider = LLMProvider.OPENAI
  private sdkModule: typeof import('openai') | null = null

  isAvailable(): boolean {
    try {
      require.resolve('openai')
      return true
    } catch {
      return false
    }
  }

  supportsModel(modelId: string): boolean {
    return SUPPORTED_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix))
  }

  async complete(options: ProviderCompletionOptions): Promise<ProviderCompletionResult> {
    const OpenAI = await this.loadSdk()
    const client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
    })

    const safeCustomOptions = this.filterCustomOptions(options.config.customOptions)

    try {
      const response = await client.chat.completions.create({
        ...safeCustomOptions,
        model: options.model,
        messages: options.messages,
        temperature: options.config.temperature,
        max_completion_tokens: options.config.maxOutputTokens,
        top_p: options.config.topP,
        stop: options.config.stopSequences,
      })

      const choice = response.choices[0]
      const text = choice?.message?.content ?? ''

      return {
        text,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      }
    } catch (error) {
      throw new TraciaError(
        TraciaErrorCode.PROVIDER_ERROR,
        `OpenAI error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private filterCustomOptions(
    customOptions?: Record<string, unknown>
  ): Record<string, unknown> {
    if (!customOptions) return {}

    const reservedKeys = ['model', 'messages', 'temperature', 'max_completion_tokens', 'top_p', 'stop']
    const filtered: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(customOptions)) {
      if (!reservedKeys.includes(key)) {
        filtered[key] = value
      }
    }

    return filtered
  }

  private async loadSdk(): Promise<typeof import('openai').default> {
    if (this.sdkModule) {
      return this.sdkModule.default
    }

    try {
      this.sdkModule = await import('openai')
      return this.sdkModule.default
    } catch {
      throw new TraciaError(
        TraciaErrorCode.MISSING_PROVIDER_SDK,
        'OpenAI SDK not installed. Run: npm install openai'
      )
    }
  }
}
