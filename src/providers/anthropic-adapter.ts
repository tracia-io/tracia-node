import { TraciaError } from '../errors'
import { LLMProvider, LocalPromptMessage, TraciaErrorCode } from '../types'
import {
  LLMProviderAdapter,
  ProviderCompletionOptions,
  ProviderCompletionResult,
  ProviderStreamOptions,
  ProviderStreamResult,
} from './types'

const SUPPORTED_MODEL_PREFIXES = ['claude-']
const DEFAULT_MAX_TOKENS = 4096

export class AnthropicAdapter implements LLMProviderAdapter {
  readonly provider = LLMProvider.ANTHROPIC
  private sdkModule: typeof import('@anthropic-ai/sdk') | null = null

  isAvailable(): boolean {
    try {
      require.resolve('@anthropic-ai/sdk')
      return true
    } catch {
      return false
    }
  }

  supportsModel(modelId: string): boolean {
    return SUPPORTED_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix))
  }

  async complete(options: ProviderCompletionOptions): Promise<ProviderCompletionResult> {
    const Anthropic = await this.loadSdk()
    const client = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
    })

    const { systemPrompt, messages } = this.separateSystemMessage(options.messages)

    if (messages.length === 0) {
      throw new TraciaError(
        TraciaErrorCode.INVALID_REQUEST,
        'Anthropic requires at least one user or assistant message'
      )
    }

    const safeCustomOptions = this.filterCustomOptions(options.config.customOptions)

    try {
      const response = await client.messages.create({
        ...safeCustomOptions,
        model: options.model,
        system: systemPrompt,
        messages: messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        temperature: options.config.temperature,
        max_tokens: options.config.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
        top_p: options.config.topP,
        stop_sequences: options.config.stopSequences,
      })

      const textBlock = response.content.find(block => block.type === 'text')
      const text = textBlock && 'text' in textBlock ? textBlock.text : ''

      return {
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      }
    } catch (error) {
      throw new TraciaError(
        TraciaErrorCode.PROVIDER_ERROR,
        `Anthropic error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  stream(options: ProviderStreamOptions): ProviderStreamResult {
    const { systemPrompt, messages } = this.separateSystemMessage(options.messages)

    if (messages.length === 0) {
      throw new TraciaError(
        TraciaErrorCode.INVALID_REQUEST,
        'Anthropic requires at least one user or assistant message'
      )
    }

    const safeCustomOptions = this.filterCustomOptions(options.config.customOptions)

    let resolveResult: (result: ProviderCompletionResult) => void
    let rejectResult: (error: Error) => void
    const resultPromise = new Promise<ProviderCompletionResult>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })

    const loadSdk = this.loadSdk.bind(this)
    async function* generateChunks(): AsyncGenerator<string> {
      let fullText = ''

      try {
        const Anthropic = await loadSdk()
        const client = new Anthropic({
          apiKey: options.apiKey,
          timeout: options.timeoutMs,
        })

        const stream = client.messages.stream(
          {
            ...safeCustomOptions,
            model: options.model,
            system: systemPrompt,
            messages: messages.map(msg => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            })),
            temperature: options.config.temperature,
            max_tokens: options.config.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
            top_p: options.config.topP,
            stop_sequences: options.config.stopSequences,
          },
          options.signal ? { signal: options.signal } : undefined
        )

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const text = event.delta.text
            if (text) {
              fullText += text
              yield text
            }
          }
        }

        const finalMessage = await stream.finalMessage()
        resolveResult!({
          text: fullText,
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
          totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          const traciaError = new TraciaError(
            TraciaErrorCode.ABORTED,
            'Stream aborted'
          )
          rejectResult!(traciaError)
          throw traciaError
        }
        const traciaError = new TraciaError(
          TraciaErrorCode.PROVIDER_ERROR,
          `Anthropic error: ${error instanceof Error ? error.message : String(error)}`
        )
        rejectResult!(traciaError)
        throw traciaError
      }
    }

    return {
      chunks: generateChunks(),
      result: resultPromise,
    }
  }

  private separateSystemMessage(messages: LocalPromptMessage[]): {
    systemPrompt: string | undefined
    messages: LocalPromptMessage[]
  } {
    const systemMessages = messages.filter(msg => msg.role === 'system')
    const nonSystemMessages = messages.filter(msg => msg.role !== 'system')

    const systemPrompt = systemMessages.length > 0
      ? systemMessages.map(msg => msg.content).join('\n\n')
      : undefined

    return { systemPrompt, messages: nonSystemMessages }
  }

  private filterCustomOptions(
    customOptions?: Record<string, unknown>
  ): Record<string, unknown> {
    if (!customOptions) return {}

    const reservedKeys = ['model', 'system', 'messages', 'temperature', 'max_tokens', 'top_p', 'stop_sequences']
    const filtered: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(customOptions)) {
      if (!reservedKeys.includes(key)) {
        filtered[key] = value
      }
    }

    return filtered
  }

  private async loadSdk(): Promise<typeof import('@anthropic-ai/sdk').default> {
    if (this.sdkModule) {
      return this.sdkModule.default
    }

    try {
      this.sdkModule = await import('@anthropic-ai/sdk')
      return this.sdkModule.default
    } catch {
      throw new TraciaError(
        TraciaErrorCode.MISSING_PROVIDER_SDK,
        'Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk'
      )
    }
  }
}
