import { TraciaError } from '../errors'
import { LLMProvider, LocalPromptMessage, TraciaErrorCode } from '../types'
import {
  LLMProviderAdapter,
  ProviderCompletionOptions,
  ProviderCompletionResult,
} from './types'

const SUPPORTED_MODEL_PREFIXES = ['gemini-']

export class GoogleAdapter implements LLMProviderAdapter {
  readonly provider = LLMProvider.GOOGLE
  private sdkModule: typeof import('@google/generative-ai') | null = null

  isAvailable(): boolean {
    try {
      require.resolve('@google/generative-ai')
      return true
    } catch {
      return false
    }
  }

  supportsModel(modelId: string): boolean {
    return SUPPORTED_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix))
  }

  async complete(options: ProviderCompletionOptions): Promise<ProviderCompletionResult> {
    const { GoogleGenerativeAI } = await this.loadSdk()
    const genAI = new GoogleGenerativeAI(options.apiKey)

    const { systemInstruction, contents } = this.convertMessages(options.messages)

    if (contents.length === 0) {
      throw new TraciaError(
        TraciaErrorCode.INVALID_REQUEST,
        'Google AI requires at least one user or assistant message'
      )
    }

    const safeCustomOptions = this.filterCustomOptions(options.config.customOptions)

    const model = genAI.getGenerativeModel({
      model: options.model,
      systemInstruction,
      generationConfig: {
        ...safeCustomOptions,
        temperature: options.config.temperature,
        maxOutputTokens: options.config.maxOutputTokens,
        topP: options.config.topP,
        stopSequences: options.config.stopSequences,
      },
    })

    const abortController = options.timeoutMs ? new AbortController() : null
    const timeoutId = abortController
      ? setTimeout(() => abortController.abort(), options.timeoutMs)
      : null

    try {
      const result = await model.generateContent(
        { contents },
        abortController ? { signal: abortController.signal } : undefined
      )
      const response = result.response

      const text = response.text()
      const usageMetadata = response.usageMetadata

      return {
        text,
        inputTokens: usageMetadata?.promptTokenCount ?? 0,
        outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: usageMetadata?.totalTokenCount ?? 0,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TraciaError(
          TraciaErrorCode.TIMEOUT,
          `Google AI request timed out after ${options.timeoutMs}ms`
        )
      }
      throw new TraciaError(
        TraciaErrorCode.PROVIDER_ERROR,
        `Google AI error: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  private convertMessages(messages: LocalPromptMessage[]): {
    systemInstruction: string | undefined
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
  } {
    const systemMessages = messages.filter(msg => msg.role === 'system')
    const nonSystemMessages = messages.filter(msg => msg.role !== 'system')

    const systemInstruction = systemMessages.length > 0
      ? systemMessages.map(msg => msg.content).join('\n\n')
      : undefined

    const contents = nonSystemMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: msg.content }],
    }))

    return { systemInstruction, contents }
  }

  private filterCustomOptions(
    customOptions?: Record<string, unknown>
  ): Record<string, unknown> {
    if (!customOptions) return {}

    const reservedKeys = ['temperature', 'maxOutputTokens', 'topP', 'stopSequences']
    const filtered: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(customOptions)) {
      if (!reservedKeys.includes(key)) {
        filtered[key] = value
      }
    }

    return filtered
  }

  private async loadSdk(): Promise<typeof import('@google/generative-ai')> {
    if (this.sdkModule) {
      return this.sdkModule
    }

    try {
      this.sdkModule = await import('@google/generative-ai')
      return this.sdkModule
    } catch {
      throw new TraciaError(
        TraciaErrorCode.MISSING_PROVIDER_SDK,
        'Google AI SDK not installed. Run: npm install @google/generative-ai'
      )
    }
  }
}
