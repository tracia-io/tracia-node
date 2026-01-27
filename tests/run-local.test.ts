import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Tracia, TraciaError, TraciaErrorCode, LLMProvider } from '../src/index'

const mockFetch = vi.fn()
global.fetch = mockFetch

const validApiKey = 'tr_test_api_key'

describe('runLocal', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('GOOGLE_API_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  describe('input validation', () => {
    it('throws error when model is empty', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      await expect(
        tracia.runLocal({
          model: '',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow(TraciaError)

      try {
        await tracia.runLocal({
          model: '',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        expect((error as TraciaError).code).toBe(TraciaErrorCode.INVALID_REQUEST)
        expect((error as TraciaError).message).toContain('model is required')
      }
    })

    it('throws error when model is whitespace only', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      await expect(
        tracia.runLocal({
          model: '   ',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow(TraciaError)
    })

    it('throws error when messages array is empty', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      await expect(
        tracia.runLocal({
          model: 'gpt-4',
          messages: [],
        })
      ).rejects.toThrow(TraciaError)

      try {
        await tracia.runLocal({
          model: 'gpt-4',
          messages: [],
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        expect((error as TraciaError).code).toBe(TraciaErrorCode.INVALID_REQUEST)
        expect((error as TraciaError).message).toContain('messages array is required')
      }
    })

    it('throws error when messages is undefined', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      await expect(
        tracia.runLocal({
          model: 'gpt-4',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: undefined as any,
        })
      ).rejects.toThrow(TraciaError)
    })
  })

  describe('trace ID validation', () => {
    it('throws error for invalid trace ID format', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      await expect(
        tracia.runLocal({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          traceId: 'invalid-trace-id',
        })
      ).rejects.toThrow(TraciaError)

      try {
        await tracia.runLocal({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          traceId: 'invalid-trace-id',
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        expect((error as TraciaError).code).toBe(TraciaErrorCode.INVALID_REQUEST)
        expect((error as TraciaError).message).toContain('Invalid trace ID format')
      }
    })

    it('accepts valid trace ID format (lowercase)', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      // Will fail later due to missing SDK, but should pass trace ID validation
      await expect(
        tracia.runLocal({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          traceId: 'tr_1234567890abcdef',
        })
      ).rejects.toThrow() // Will throw MISSING_PROVIDER_SDK, not INVALID_REQUEST

      try {
        await tracia.runLocal({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          traceId: 'tr_1234567890abcdef',
        })
      } catch (error) {
        expect((error as TraciaError).code).not.toBe(TraciaErrorCode.INVALID_REQUEST)
      }
    })

    it('accepts valid trace ID format (uppercase)', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.runLocal({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          traceId: 'tr_1234567890ABCDEF',
        })
      } catch (error) {
        // Should not be INVALID_REQUEST (trace ID is valid)
        expect((error as TraciaError).code).not.toBe(TraciaErrorCode.INVALID_REQUEST)
      }
    })

    it('skips trace ID validation when sendTrace is false', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.runLocal({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          traceId: 'invalid-trace-id',
          sendTrace: false,
        })
      } catch (error) {
        // Should not throw INVALID_REQUEST for trace ID when sendTrace is false
        expect((error as TraciaError).code).not.toBe(TraciaErrorCode.INVALID_REQUEST)
      }
    })
  })

  describe('provider detection', () => {
    it('throws UNSUPPORTED_MODEL for unknown model without explicit provider', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      await expect(
        tracia.runLocal({
          model: 'unknown-model-xyz',
          messages: [{ role: 'user', content: 'Hello' }],
          sendTrace: false,
        })
      ).rejects.toThrow(TraciaError)

      try {
        await tracia.runLocal({
          model: 'unknown-model-xyz',
          messages: [{ role: 'user', content: 'Hello' }],
          sendTrace: false,
        })
      } catch (error) {
        expect((error as TraciaError).code).toBe(TraciaErrorCode.UNSUPPORTED_MODEL)
      }
    })

    it('uses explicit provider when specified', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      // With explicit provider, should try to use OpenAI adapter even for unknown model
      try {
        await tracia.runLocal({
          model: 'my-custom-model',
          provider: LLMProvider.OPENAI,
          messages: [{ role: 'user', content: 'Hello' }],
          sendTrace: false,
        })
      } catch (error) {
        // Should fail with MISSING_PROVIDER_API_KEY (SDK is available), not UNSUPPORTED_MODEL
        expect((error as TraciaError).code).toBe(TraciaErrorCode.MISSING_PROVIDER_API_KEY)
      }
    })

    it('detects OpenAI models by prefix', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.runLocal({
          model: 'gpt-4-new-version',
          messages: [{ role: 'user', content: 'Hello' }],
          sendTrace: false,
        })
      } catch (error) {
        // SDK is installed, so we get MISSING_PROVIDER_API_KEY instead
        expect((error as TraciaError).code).toBe(TraciaErrorCode.MISSING_PROVIDER_API_KEY)
        expect((error as TraciaError).message).toContain('OPENAI_API_KEY')
      }
    })

    it('detects Anthropic models by prefix', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.runLocal({
          model: 'claude-4-new-version',
          messages: [{ role: 'user', content: 'Hello' }],
          sendTrace: false,
        })
      } catch (error) {
        // SDK is installed, so we get MISSING_PROVIDER_API_KEY instead
        expect((error as TraciaError).code).toBe(TraciaErrorCode.MISSING_PROVIDER_API_KEY)
        expect((error as TraciaError).message).toContain('ANTHROPIC_API_KEY')
      }
    })

    it('detects Google models by prefix', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.runLocal({
          model: 'gemini-3-new-version',
          messages: [{ role: 'user', content: 'Hello' }],
          sendTrace: false,
        })
      } catch (error) {
        // SDK is installed, so we get MISSING_PROVIDER_API_KEY instead
        expect((error as TraciaError).code).toBe(TraciaErrorCode.MISSING_PROVIDER_API_KEY)
        expect((error as TraciaError).message).toContain('GOOGLE_API_KEY')
      }
    })
  })

  describe('flush', () => {
    it('resolves immediately when no pending traces', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      await expect(tracia.flush()).resolves.toBeUndefined()
    })
  })
})

describe('getProviderForModel', () => {
  // Test the model mapping
  it('returns correct provider for known models', async () => {
    const { getProviderForModel } = await import('../src/models')

    expect(getProviderForModel('gpt-4')).toBe(LLMProvider.OPENAI)
    expect(getProviderForModel('gpt-4o')).toBe(LLMProvider.OPENAI)
    expect(getProviderForModel('o1')).toBe(LLMProvider.OPENAI)
    expect(getProviderForModel('o3-mini')).toBe(LLMProvider.OPENAI)
    expect(getProviderForModel('claude-3-opus-20240229')).toBe(LLMProvider.ANTHROPIC)
    expect(getProviderForModel('claude-sonnet-4-5')).toBe(LLMProvider.ANTHROPIC)
    expect(getProviderForModel('gemini-2.0-flash')).toBe(LLMProvider.GOOGLE)
    expect(getProviderForModel('gemini-2.5-pro')).toBe(LLMProvider.GOOGLE)
  })

  it('returns undefined for unknown models', async () => {
    const { getProviderForModel } = await import('../src/models')

    expect(getProviderForModel('unknown-model')).toBeUndefined()
    expect(getProviderForModel('gpt-999')).toBeUndefined()
    expect(getProviderForModel('')).toBeUndefined()
  })
})

describe('ProviderRegistry', () => {
  it('returns adapter for valid provider', async () => {
    const { ProviderRegistry } = await import('../src/providers/registry')

    const registry = new ProviderRegistry()

    const openaiAdapter = registry.getAdapterForProvider(LLMProvider.OPENAI)
    expect(openaiAdapter.provider).toBe(LLMProvider.OPENAI)

    const anthropicAdapter = registry.getAdapterForProvider(LLMProvider.ANTHROPIC)
    expect(anthropicAdapter.provider).toBe(LLMProvider.ANTHROPIC)

    const googleAdapter = registry.getAdapterForProvider(LLMProvider.GOOGLE)
    expect(googleAdapter.provider).toBe(LLMProvider.GOOGLE)
  })

  it('returns adapter for known model', async () => {
    const { ProviderRegistry } = await import('../src/providers/registry')

    const registry = new ProviderRegistry()

    expect(registry.getAdapterForModel('gpt-4o').provider).toBe(LLMProvider.OPENAI)
    expect(registry.getAdapterForModel('claude-3-opus-20240229').provider).toBe(LLMProvider.ANTHROPIC)
    expect(registry.getAdapterForModel('gemini-2.0-flash').provider).toBe(LLMProvider.GOOGLE)
  })

  it('falls back to prefix matching for unknown models', async () => {
    const { ProviderRegistry } = await import('../src/providers/registry')

    const registry = new ProviderRegistry()

    // Not in the explicit list, but matches prefix
    expect(registry.getAdapterForModel('gpt-99-turbo').provider).toBe(LLMProvider.OPENAI)
    expect(registry.getAdapterForModel('claude-99-opus').provider).toBe(LLMProvider.ANTHROPIC)
    expect(registry.getAdapterForModel('gemini-99-flash').provider).toBe(LLMProvider.GOOGLE)
  })

  it('throws for completely unknown model', async () => {
    const { ProviderRegistry } = await import('../src/providers/registry')

    const registry = new ProviderRegistry()

    expect(() => registry.getAdapterForModel('totally-unknown')).toThrow(TraciaError)
  })
})

describe('variable interpolation', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('GOOGLE_API_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('interpolates variables in message content', async () => {
    const tracia = new Tracia({ apiKey: validApiKey })

    // Set API key so we get past that check
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

    // Mock the OpenAI adapter's complete method
    const { OpenAIAdapter } = await import('../src/providers/openai-adapter')
    const completeSpy = vi.spyOn(OpenAIAdapter.prototype, 'complete').mockResolvedValue({
      text: 'Hello Alice!',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })

    const result = await tracia.runLocal({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello {{name}}!' }],
      variables: { name: 'Alice' },
      sendTrace: false,
    })

    expect(result.text).toBe('Hello Alice!')
    // Verify the interpolated message was passed to the adapter
    expect(completeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Hello Alice!' }],
      })
    )

    completeSpy.mockRestore()
  })

  it('leaves unknown variables unchanged', async () => {
    const tracia = new Tracia({ apiKey: validApiKey })

    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

    const { OpenAIAdapter } = await import('../src/providers/openai-adapter')
    const completeSpy = vi.spyOn(OpenAIAdapter.prototype, 'complete').mockResolvedValue({
      text: 'Response',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })

    await tracia.runLocal({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello {{unknown}}!' }],
      variables: { name: 'Alice' },
      sendTrace: false,
    })

    // Unknown variable should remain as-is
    expect(completeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Hello {{unknown}}!' }],
      })
    )

    completeSpy.mockRestore()
  })
})

describe('successful completion flow', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('GOOGLE_API_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('returns correct result structure on success', async () => {
    const tracia = new Tracia({ apiKey: validApiKey })

    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

    const { OpenAIAdapter } = await import('../src/providers/openai-adapter')
    vi.spyOn(OpenAIAdapter.prototype, 'complete').mockResolvedValue({
      text: 'Hello world!',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })

    const result = await tracia.runLocal({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      sendTrace: false,
    })

    expect(result.text).toBe('Hello world!')
    expect(result.model).toBe('gpt-4')
    expect(result.provider).toBe(LLMProvider.OPENAI)
    expect(result.usage.inputTokens).toBe(10)
    expect(result.usage.outputTokens).toBe(5)
    expect(result.usage.totalTokens).toBe(15)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.cost).toBeNull()
  })

  it('uses providerApiKey when provided instead of env var', async () => {
    const tracia = new Tracia({ apiKey: validApiKey })

    // Don't set env var - should use providerApiKey instead

    const { OpenAIAdapter } = await import('../src/providers/openai-adapter')
    const completeSpy = vi.spyOn(OpenAIAdapter.prototype, 'complete').mockResolvedValue({
      text: 'Response',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })

    await tracia.runLocal({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      providerApiKey: 'my-custom-api-key',
      sendTrace: false,
    })

    expect(completeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'my-custom-api-key',
      })
    )

    completeSpy.mockRestore()
  })

  it('generates trace ID when sendTrace is true (default)', async () => {
    const tracia = new Tracia({ apiKey: validApiKey })

    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

    const { OpenAIAdapter } = await import('../src/providers/openai-adapter')
    vi.spyOn(OpenAIAdapter.prototype, 'complete').mockResolvedValue({
      text: 'Response',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })

    // Mock fetch for trace creation
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })

    const result = await tracia.runLocal({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expect(result.traceId).toMatch(/^tr_[a-f0-9]{16}$/)
  })

  it('uses provided trace ID when specified', async () => {
    const tracia = new Tracia({ apiKey: validApiKey })

    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

    const { OpenAIAdapter } = await import('../src/providers/openai-adapter')
    vi.spyOn(OpenAIAdapter.prototype, 'complete').mockResolvedValue({
      text: 'Response',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })

    const result = await tracia.runLocal({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      traceId: 'tr_1234567890abcdef',
    })

    expect(result.traceId).toBe('tr_1234567890abcdef')
  })

  it('returns empty trace ID when sendTrace is false', async () => {
    const tracia = new Tracia({ apiKey: validApiKey })

    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

    const { OpenAIAdapter } = await import('../src/providers/openai-adapter')
    vi.spyOn(OpenAIAdapter.prototype, 'complete').mockResolvedValue({
      text: 'Response',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })

    const result = await tracia.runLocal({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      sendTrace: false,
    })

    expect(result.traceId).toBe('')
  })

  it('throws PROVIDER_ERROR when adapter fails', async () => {
    const tracia = new Tracia({ apiKey: validApiKey })

    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

    const { OpenAIAdapter } = await import('../src/providers/openai-adapter')
    vi.spyOn(OpenAIAdapter.prototype, 'complete').mockRejectedValue(
      new Error('API rate limit exceeded')
    )

    await expect(
      tracia.runLocal({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        sendTrace: false,
      })
    ).rejects.toThrow(TraciaError)

    try {
      await tracia.runLocal({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        sendTrace: false,
      })
    } catch (error) {
      expect((error as TraciaError).code).toBe(TraciaErrorCode.PROVIDER_ERROR)
      expect((error as TraciaError).message).toContain('API rate limit exceeded')
    }
  })

  it('passes config options to adapter', async () => {
    const tracia = new Tracia({ apiKey: validApiKey })

    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

    const { OpenAIAdapter } = await import('../src/providers/openai-adapter')
    const completeSpy = vi.spyOn(OpenAIAdapter.prototype, 'complete').mockResolvedValue({
      text: 'Response',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })

    await tracia.runLocal({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      maxOutputTokens: 1000,
      topP: 0.9,
      stopSequences: ['END'],
      timeoutMs: 30000,
      sendTrace: false,
    })

    expect(completeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          temperature: 0.7,
          maxOutputTokens: 1000,
          topP: 0.9,
          stopSequences: ['END'],
        }),
        timeoutMs: 30000,
      })
    )

    completeSpy.mockRestore()
  })

  it('calls onTraceError callback when trace creation fails after retries', async () => {
    const onTraceError = vi.fn()
    const tracia = new Tracia({ apiKey: validApiKey, onTraceError })

    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

    const { OpenAIAdapter } = await import('../src/providers/openai-adapter')
    vi.spyOn(OpenAIAdapter.prototype, 'complete').mockResolvedValue({
      text: 'Response',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })

    // Mock fetch to always fail for trace creation
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({ error: { code: 'UNKNOWN', message: 'Server error' } }),
    })

    await tracia.runLocal({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      // sendTrace defaults to true
    })

    // Wait for trace creation retries to complete
    await tracia.flush()

    expect(onTraceError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.stringMatching(/^tr_[a-f0-9]{16}$/)
    )
  })
})