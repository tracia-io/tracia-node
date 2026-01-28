import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Tracia, TraciaError, TraciaErrorCode, LLMProvider } from '../src/index'

const mockFetch = vi.fn()
global.fetch = mockFetch

const validApiKey = 'tr_test_api_key'

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => ({ model })),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (model: string) => ({ model })),
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => (model: string) => ({ model })),
}))

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

    it('throws error when tool message is missing toolCallId', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      await expect(
        tracia.runLocal({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Hello' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { role: 'tool', content: '{"result": "ok"}' } as any,
          ],
        })
      ).rejects.toThrow(TraciaError)

      try {
        await tracia.runLocal({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Hello' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { role: 'tool', content: '{"result": "ok"}' } as any,
          ],
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        expect((error as TraciaError).code).toBe(TraciaErrorCode.INVALID_REQUEST)
        expect((error as TraciaError).message).toContain('toolCallId')
      }
    })

    it('throws error when tool message content is not a string', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      await expect(
        tracia.runLocal({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Hello' },
            {
              role: 'tool',
              toolCallId: 'call_123',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content: [{ type: 'text', text: 'result' }] as any,
            },
          ],
        })
      ).rejects.toThrow(TraciaError)

      try {
        await tracia.runLocal({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Hello' },
            {
              role: 'tool',
              toolCallId: 'call_123',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content: [{ type: 'text', text: 'result' }] as any,
            },
          ],
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        expect((error as TraciaError).code).toBe(TraciaErrorCode.INVALID_REQUEST)
        expect((error as TraciaError).message).toContain('string')
      }
    })

    it('accepts valid tool message with toolCallId and string content', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      // Will fail at later stage (missing SDK/key), but should pass validation
      try {
        await tracia.runLocal({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Hello' },
            {
              role: 'tool',
              toolCallId: 'call_123',
              content: '{"temp": 22}',
            },
          ],
        })
      } catch (error) {
        // Should not be INVALID_REQUEST for tool message validation
        expect((error as TraciaError).code).not.toBe(TraciaErrorCode.INVALID_REQUEST)
      }
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
      ).rejects.toThrow() // Will throw MISSING_PROVIDER_API_KEY, not INVALID_REQUEST

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

      // With explicit provider, should try to use OpenAI even for unknown model
      try {
        await tracia.runLocal({
          model: 'my-custom-model',
          provider: LLMProvider.OPENAI,
          messages: [{ role: 'user', content: 'Hello' }],
          sendTrace: false,
        })
      } catch (error) {
        // Should fail with MISSING_PROVIDER_API_KEY, not UNSUPPORTED_MODEL
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
        expect((error as TraciaError).code).toBe(TraciaErrorCode.MISSING_PROVIDER_API_KEY)
        expect((error as TraciaError).message).toContain('GOOGLE_API_KEY')
      }
    })
  })

  describe('successful completion flow', () => {
    it('returns correct result structure on success', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: 'Hello world!',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        toolCalls: [],
        finishReason: 'stop',
      } as never)

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

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: 'Response',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        toolCalls: [],
        finishReason: 'stop',
      } as never)

      await tracia.runLocal({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        providerApiKey: 'my-custom-api-key',
        sendTrace: false,
      })

      // The test passes if no MISSING_PROVIDER_API_KEY error is thrown
      expect(generateText).toHaveBeenCalled()
    })

    it('generates trace ID when sendTrace is true (default)', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: 'Response',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        toolCalls: [],
        finishReason: 'stop',
      } as never)

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

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: 'Response',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        toolCalls: [],
        finishReason: 'stop',
      } as never)

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

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: 'Response',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        toolCalls: [],
        finishReason: 'stop',
      } as never)

      const result = await tracia.runLocal({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        sendTrace: false,
      })

      expect(result.traceId).toBe('')
    })

    it('throws PROVIDER_ERROR when AI SDK fails', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockRejectedValue(new Error('API rate limit exceeded'))

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
  })

  describe('tool calling', () => {
    it('returns toolCalls in result', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: '',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        toolCalls: [
          { toolCallId: 'call_abc', toolName: 'get_weather', input: { location: 'Paris' } },
          { toolCallId: 'call_def', toolName: 'get_time', input: { timezone: 'UTC' } },
        ],
        finishReason: 'tool-calls',
      } as never)

      const result = await tracia.runLocal({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Weather and time?' }],
        sendTrace: false,
      })

      expect(result.toolCalls).toHaveLength(2)
      expect(result.toolCalls[0]).toEqual({
        id: 'call_abc',
        name: 'get_weather',
        arguments: { location: 'Paris' },
      })
      expect(result.toolCalls[1]).toEqual({
        id: 'call_def',
        name: 'get_time',
        arguments: { timezone: 'UTC' },
      })
    })

    it('returns finishReason in result', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: '',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        toolCalls: [{ toolCallId: 'call_123', toolName: 'get_weather', input: {} }],
        finishReason: 'tool-calls',
      } as never)

      const result = await tracia.runLocal({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Weather?' }],
        sendTrace: false,
      })

      expect(result.finishReason).toBe('tool_calls')
    })

    it('returns message with tool calls for round-tripping', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: 'Let me check the weather.',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        toolCalls: [{ toolCallId: 'call_123', toolName: 'get_weather', input: { location: 'Paris' } }],
        finishReason: 'tool-calls',
      } as never)

      const result = await tracia.runLocal({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Weather in Paris?' }],
        sendTrace: false,
      })

      expect(result.message.role).toBe('assistant')
      expect(Array.isArray(result.message.content)).toBe(true)

      // Tracia format: tool_call parts with id, name, arguments
      const content = result.message.content as Array<{ type: string; text?: string; id?: string; name?: string; arguments?: unknown }>
      expect(content).toHaveLength(2)
      expect(content[0]).toEqual({ type: 'text', text: 'Let me check the weather.' })
      expect(content[1]).toEqual({
        type: 'tool_call',
        id: 'call_123',
        name: 'get_weather',
        arguments: { location: 'Paris' },
      })
    })

    it('returns message with string content when no tool calls', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: 'Hello there!',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        toolCalls: [],
        finishReason: 'stop',
      } as never)

      const result = await tracia.runLocal({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        sendTrace: false,
      })

      expect(result.message.role).toBe('assistant')
      expect(result.message.content).toBe('Hello there!')
    })

    it('returns empty toolCalls array when none', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: 'Hello!',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        toolCalls: [],
        finishReason: 'stop',
      } as never)

      const result = await tracia.runLocal({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        sendTrace: false,
      })

      expect(result.toolCalls).toEqual([])
      expect(result.finishReason).toBe('stop')
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

describe('runLocal with stream: true', () => {
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
    it('throws error when model is empty', () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      expect(() =>
        tracia.runLocal({
          model: '',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
        })
      ).toThrow(TraciaError)
    })

    it('throws error when messages array is empty', () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      expect(() =>
        tracia.runLocal({
          model: 'gpt-4',
          messages: [],
          stream: true,
        })
      ).toThrow(TraciaError)
    })

    it('throws error for invalid trace ID format', () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      expect(() =>
        tracia.runLocal({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
          traceId: 'invalid-trace-id',
        })
      ).toThrow(TraciaError)
    })

    it('throws error when tool message has string content instead of array', () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      expect(() =>
        tracia.runLocal({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Hello' },
            // Missing toolCallId - should fail
            { role: 'tool', content: '{"result": "ok"}' } as never,
          ],
          stream: true,
        })
      ).toThrow(TraciaError)

      try {
        tracia.runLocal({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'tool', content: '{"result": "ok"}' } as never,
          ],
          stream: true,
        })
      } catch (error) {
        expect((error as TraciaError).code).toBe(TraciaErrorCode.INVALID_REQUEST)
        expect((error as TraciaError).message).toContain('toolCallId')
      }
    })

    it('throws error when tool message content is not a string', () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      expect(() =>
        tracia.runLocal({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Hello' },
            {
              role: 'tool',
              toolCallId: 'call_123',
              // Content should be a string, not an array
              content: [{ type: 'text', text: 'result' }] as never,
            },
          ],
          stream: true,
        })
      ).toThrow(TraciaError)
    })
  })

  describe('stream behavior', () => {
    it('returns stream with traceId immediately available', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { streamText } = await import('ai')
      const mockTextStream = (async function* () {
        yield 'Hello'
        yield ' world'
      })()

      vi.mocked(streamText).mockReturnValue({
        textStream: mockTextStream,
        text: Promise.resolve('Hello world'),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
        toolCalls: Promise.resolve([]),
        finishReason: Promise.resolve('stop'),
      } as never)

      const stream = tracia.runLocal({
        stream: true,
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        sendTrace: false,
      })

      // traceId should be empty when sendTrace is false
      expect(stream.traceId).toBe('')
    })

    it('generates trace ID when sendTrace is true', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { streamText } = await import('ai')
      const mockTextStream = (async function* () {
        yield 'Hello'
      })()

      vi.mocked(streamText).mockReturnValue({
        textStream: mockTextStream,
        text: Promise.resolve('Hello'),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
        toolCalls: Promise.resolve([]),
        finishReason: Promise.resolve('stop'),
      } as never)

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const stream = tracia.runLocal({
        stream: true,
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      })

      expect(stream.traceId).toMatch(/^tr_[a-f0-9]{16}$/)
    })

    it('yields chunks correctly', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { streamText } = await import('ai')
      const mockTextStream = (async function* () {
        yield 'Hello'
        yield ' '
        yield 'world'
        yield '!'
      })()

      vi.mocked(streamText).mockReturnValue({
        textStream: mockTextStream,
        text: Promise.resolve('Hello world!'),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
        toolCalls: Promise.resolve([]),
        finishReason: Promise.resolve('stop'),
      } as never)

      const stream = tracia.runLocal({
        stream: true,
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        sendTrace: false,
      })

      const chunks: string[] = []
      for await (const chunk of stream) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['Hello', ' ', 'world', '!'])
    })

    it('resolves result with correct data after iteration', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { streamText } = await import('ai')
      const mockTextStream = (async function* () {
        yield 'Hello world!'
      })()

      vi.mocked(streamText).mockReturnValue({
        textStream: mockTextStream,
        text: Promise.resolve('Hello world!'),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
        toolCalls: Promise.resolve([]),
        finishReason: Promise.resolve('stop'),
      } as never)

      const stream = tracia.runLocal({
        stream: true,
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        sendTrace: false,
      })

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of stream) {
        // consume stream
      }

      const result = await stream.result

      expect(result.text).toBe('Hello world!')
      expect(result.model).toBe('gpt-4')
      expect(result.provider).toBe(LLMProvider.OPENAI)
      expect(result.usage.inputTokens).toBe(10)
      expect(result.usage.outputTokens).toBe(5)
      expect(result.usage.totalTokens).toBe(15)
      expect(result.aborted).toBe(false)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('uses provided trace ID when specified', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { streamText } = await import('ai')
      const mockTextStream = (async function* () {
        yield 'Hello'
      })()

      vi.mocked(streamText).mockReturnValue({
        textStream: mockTextStream,
        text: Promise.resolve('Hello'),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
        toolCalls: Promise.resolve([]),
        finishReason: Promise.resolve('stop'),
      } as never)

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const stream = tracia.runLocal({
        stream: true,
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        traceId: 'tr_1234567890abcdef',
      })

      expect(stream.traceId).toBe('tr_1234567890abcdef')
    })
  })

  describe('abort behavior', () => {
    it('stream has abort method', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')

      const { streamText } = await import('ai')
      const mockTextStream = (async function* () {
        yield 'Hello'
      })()

      vi.mocked(streamText).mockReturnValue({
        textStream: mockTextStream,
        text: Promise.resolve('Hello'),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
        toolCalls: Promise.resolve([]),
        finishReason: Promise.resolve('stop'),
      } as never)

      const stream = tracia.runLocal({
        stream: true,
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        sendTrace: false,
      })

      expect(typeof stream.abort).toBe('function')

      // Consume to avoid hanging
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of stream) { /* consume */ }
    })
  })

  describe('error handling', () => {
    it('throws UNSUPPORTED_MODEL when model is unknown', () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      expect(() =>
        tracia.runLocal({
          model: 'unknown-model-xyz',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
          sendTrace: false,
        })
      ).toThrow(TraciaError)
    })

    it('throws MISSING_PROVIDER_API_KEY when API key not set', () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      expect(() =>
        tracia.runLocal({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
          sendTrace: false,
        })
      ).toThrow(TraciaError)

      try {
        tracia.runLocal({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
          sendTrace: false,
        })
      } catch (error) {
        expect((error as TraciaError).code).toBe(TraciaErrorCode.MISSING_PROVIDER_API_KEY)
      }
    })
  })
})

describe('runResponses with stream: true', () => {
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
    it('throws error when model is empty', () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      expect(() => {
        tracia.runResponses({
          model: '',
          input: [{ role: 'user', content: 'Hello' }],
          stream: true,
        })
      }).toThrow(TraciaError)

      try {
        tracia.runResponses({
          model: '',
          input: [{ role: 'user', content: 'Hello' }],
          stream: true,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        expect((error as TraciaError).code).toBe(TraciaErrorCode.INVALID_REQUEST)
        expect((error as TraciaError).message).toContain('model is required')
      }
    })

    it('throws error when input array is empty', () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      expect(() => {
        tracia.runResponses({
          model: 'o3-mini',
          input: [],
          stream: true,
        })
      }).toThrow(TraciaError)

      try {
        tracia.runResponses({
          model: 'o3-mini',
          input: [],
          stream: true,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        expect((error as TraciaError).code).toBe(TraciaErrorCode.INVALID_REQUEST)
        expect((error as TraciaError).message).toContain('input array is required')
      }
    })

    it('throws error when invalid traceId format is provided', () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test')

      expect(() => {
        tracia.runResponses({
          model: 'o3-mini',
          input: [{ role: 'user', content: 'Hello' }],
          stream: true,
          traceId: 'invalid-trace-id',
        })
      }).toThrow(TraciaError)

      try {
        tracia.runResponses({
          model: 'o3-mini',
          input: [{ role: 'user', content: 'Hello' }],
          stream: true,
          traceId: 'invalid-trace-id',
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        expect((error as TraciaError).code).toBe(TraciaErrorCode.INVALID_REQUEST)
        expect((error as TraciaError).message).toContain('Invalid trace ID format')
      }
    })
  })

  describe('provider handling', () => {
    it('throws error when OpenAI API key is missing', () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      expect(() => {
        tracia.runResponses({
          model: 'o3-mini',
          input: [{ role: 'user', content: 'Hello' }],
          stream: true,
        })
      }).toThrow(TraciaError)

      try {
        tracia.runResponses({
          model: 'o3-mini',
          input: [{ role: 'user', content: 'Hello' }],
          stream: true,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        expect((error as TraciaError).code).toBe(TraciaErrorCode.MISSING_PROVIDER_API_KEY)
        expect((error as TraciaError).message).toContain('OPENAI_API_KEY')
      }
    })

    it('uses providerApiKey when provided', () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      expect(() => {
        tracia.runResponses({
          model: 'o3-mini',
          input: [{ role: 'user', content: 'Hello' }],
          stream: true,
          providerApiKey: 'sk-test-key',
          sendTrace: false,
        })
      }).not.toThrow(TraciaError)
    })

    it('returns a stream with traceId available immediately', () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test')
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ traceId: 'tr_mock', cost: 0.001 }),
      })

      const stream = tracia.runResponses({
        model: 'o3-mini',
        input: [{ role: 'user', content: 'Hello' }],
        stream: true,
      })

      expect(stream.traceId).toBeDefined()
      expect(stream.traceId).toMatch(/^tr_[0-9a-f]{16}$/)
      expect(typeof stream.abort).toBe('function')
      expect(stream.result).toBeInstanceOf(Promise)
      expect(typeof stream[Symbol.asyncIterator]).toBe('function')
    })

    it('uses custom traceId when provided', () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test')
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ traceId: 'tr_mock', cost: 0.001 }),
      })

      const customTraceId = 'tr_1234567890abcdef'
      const stream = tracia.runResponses({
        model: 'o3-mini',
        input: [{ role: 'user', content: 'Hello' }],
        stream: true,
        traceId: customTraceId,
      })

      expect(stream.traceId).toBe(customTraceId)
    })

    it('generates no traceId when sendTrace is false without custom traceId', () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test')

      const stream = tracia.runResponses({
        model: 'o3-mini',
        input: [{ role: 'user', content: 'Hello' }],
        stream: true,
        sendTrace: false,
      })

      expect(stream.traceId).toBe('')
    })
  })

  describe('input format handling', () => {
    it('accepts developer role messages', () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test')

      const stream = tracia.runResponses({
        model: 'o3-mini',
        input: [
          { role: 'developer', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
        stream: true,
        sendTrace: false,
      })

      expect(stream.traceId).toBe('')
    })

    it('accepts function_call_output items', () => {
      const tracia = new Tracia({ apiKey: validApiKey })
      vi.stubEnv('OPENAI_API_KEY', 'sk-test')

      const stream = tracia.runResponses({
        model: 'o3-mini',
        input: [
          { role: 'user', content: 'What is the weather?' },
          { type: 'function_call_output', call_id: 'call_123', output: '{"temp": 22}' },
        ],
        stream: true,
        sendTrace: false,
      })

      expect(stream).toBeDefined()
    })
  })
})
