import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Tracia, TraciaError, TraciaErrorCode } from '../src/index'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('prompts', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const validApiKey = 'tr_test_api_key'

  const mockSuccessResponse = {
    text: 'Hello, Alice! Welcome to Tracia.',
    traceId: 'trace_abc123',
    promptVersion: 1,
    latencyMs: 250,
    usage: {
      inputTokens: 10,
      outputTokens: 15,
      totalTokens: 25,
    },
    cost: 0.00025,
  }

  const mockPrompt = {
    id: 'prompt_123',
    slug: 'welcome-email',
    name: 'Welcome Email',
    description: 'A welcome email template',
    model: 'gpt-4',
    currentVersion: 1,
    content: [
      { id: 'msg_1', role: 'system', content: 'You are a helpful assistant.' },
      { id: 'msg_2', role: 'user', content: 'Hello {{name}}!' },
    ],
    variables: ['name'],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }

  const mockPromptListItem = {
    id: 'prompt_123',
    slug: 'welcome-email',
    name: 'Welcome Email',
    description: 'A welcome email template',
    model: 'gpt-4',
    currentVersion: 1,
    variables: ['name'],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }

  describe('run', () => {
    it('successfully runs a prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const result = await tracia.prompts.run('welcome-email', { name: 'Alice' })

      expect(result).toEqual(mockSuccessResponse)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/prompts/welcome-email/run')
      expect(options.method).toBe('POST')
      expect(options.headers['Authorization']).toBe(`Bearer ${validApiKey}`)
      expect(options.headers['Content-Type']).toBe('application/json')
      expect(options.headers['User-Agent']).toMatch(/^tracia-sdk\//)

      const body = JSON.parse(options.body)
      expect(body.variables).toEqual({ name: 'Alice' })
    })

    it('runs a prompt without variables', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.prompts.run('simple-prompt')

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/prompts/simple-prompt/run')
    })

    it('passes optional parameters correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.prompts.run('welcome-email', { name: 'Alice' }, {
        model: 'gpt-4',
        tags: ['production', 'onboarding'],
        userId: 'user_123',
        sessionId: 'session_456',
      })

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.model).toBe('gpt-4')
      expect(body.tags).toEqual(['production', 'onboarding'])
      expect(body.userId).toBe('user_123')
      expect(body.sessionId).toBe('session_456')
    })
  })

  describe('list', () => {
    it('successfully lists prompts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompts: [mockPromptListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const prompts = await tracia.prompts.list()

      expect(prompts).toEqual([mockPromptListItem])
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/prompts')
      expect(options.method).toBe('GET')
      expect(options.headers['Authorization']).toBe(`Bearer ${validApiKey}`)
    })

    it('returns empty array when no prompts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompts: [] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const prompts = await tracia.prompts.list()

      expect(prompts).toEqual([])
    })
  })

  describe('get', () => {
    it('successfully gets a prompt by slug', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrompt,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const prompt = await tracia.prompts.get('welcome-email')

      expect(prompt).toEqual(mockPrompt)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/prompts/welcome-email')
      expect(options.method).toBe('GET')
    })

    it('throws NOT_FOUND error when prompt does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: {
            code: 'NOT_FOUND',
            message: 'Prompt not found: unknown-prompt',
          },
        }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.prompts.get('unknown-prompt')
        expect.fail('Expected TraciaError to be thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.NOT_FOUND)
        expect(traciaError.statusCode).toBe(404)
      }
    })

    it('encodes slug with special characters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrompt,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.prompts.get('my-prompt/test')

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/prompts/my-prompt%2Ftest')
    })
  })

  describe('create', () => {
    it('successfully creates a prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPrompt,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const prompt = await tracia.prompts.create({
        name: 'Welcome Email',
        slug: 'welcome-email',
        description: 'A welcome email template',
        content: [
          { id: 'msg_1', role: 'system', content: 'You are a helpful assistant.' },
          { id: 'msg_2', role: 'user', content: 'Hello {{name}}!' },
        ],
      })

      expect(prompt).toEqual(mockPrompt)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/prompts')
      expect(options.method).toBe('POST')

      const body = JSON.parse(options.body)
      expect(body.name).toBe('Welcome Email')
      expect(body.slug).toBe('welcome-email')
      expect(body.content).toHaveLength(2)
    })

    it('throws CONFLICT error when slug already exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        json: async () => ({
          error: {
            code: 'CONFLICT',
            message: 'A prompt with this slug already exists',
          },
        }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.prompts.create({
          name: 'Welcome Email',
          content: [{ id: 'msg_1', role: 'user', content: 'Hello' }],
        })
        expect.fail('Expected TraciaError to be thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.CONFLICT)
        expect(traciaError.statusCode).toBe(409)
      }
    })
  })

  describe('update', () => {
    it('successfully updates a prompt', async () => {
      const updatedPrompt = { ...mockPrompt, name: 'Updated Email' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedPrompt,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const prompt = await tracia.prompts.update('welcome-email', {
        name: 'Updated Email',
      })

      expect(prompt.name).toBe('Updated Email')

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/prompts/welcome-email')
      expect(options.method).toBe('PUT')

      const body = JSON.parse(options.body)
      expect(body.name).toBe('Updated Email')
    })

    it('creates new version when content changes', async () => {
      const updatedPrompt = { ...mockPrompt, currentVersion: 2 }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedPrompt,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const prompt = await tracia.prompts.update('welcome-email', {
        content: [{ id: 'msg_1', role: 'user', content: 'New content' }],
      })

      expect(prompt.currentVersion).toBe(2)
    })
  })

  describe('delete', () => {
    it('successfully deletes a prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.prompts.delete('welcome-email')

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/prompts/welcome-email')
      expect(options.method).toBe('DELETE')
    })

    it('throws NOT_FOUND error when prompt does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: {
            code: 'NOT_FOUND',
            message: 'Prompt not found: unknown-prompt',
          },
        }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.prompts.delete('unknown-prompt')
        expect.fail('Expected TraciaError to be thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.NOT_FOUND)
        expect(traciaError.statusCode).toBe(404)
      }
    })
  })

  describe('error handling', () => {
    it('throws TraciaError for invalid API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid API key',
          },
        }),
      })

      const tracia = new Tracia({ apiKey: 'invalid_key' })

      try {
        await tracia.prompts.run('test-prompt')
        expect.fail('Expected TraciaError to be thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.UNAUTHORIZED)
        expect(traciaError.message).toBe('Invalid API key')
        expect(traciaError.statusCode).toBe(401)
      }
    })

    it('throws TraciaError for prompt not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: {
            code: 'NOT_FOUND',
            message: 'Prompt not found: unknown-prompt',
          },
        }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.prompts.run('unknown-prompt')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.NOT_FOUND)
        expect(traciaError.statusCode).toBe(404)
      }
    })

    it('throws TraciaError for missing variables', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: {
            code: 'MISSING_VARIABLES',
            message: 'Missing required variables: name, email',
          },
        }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.prompts.run('email-template')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.MISSING_VARIABLES)
        expect(traciaError.statusCode).toBe(400)
      }
    })

    it('throws TraciaError for provider errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({
          error: {
            code: 'PROVIDER_ERROR',
            message: 'OpenAI error: Rate limit exceeded',
          },
        }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.prompts.run('test-prompt')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.PROVIDER_ERROR)
      }
    })

    it('throws TraciaError for network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.prompts.run('test-prompt')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.NETWORK_ERROR)
        expect(traciaError.message).toContain('Network error')
      }
    })

    it('throws TraciaError for timeout', async () => {
      mockFetch.mockImplementationOnce(() => {
        const error = new Error('Aborted')
        error.name = 'AbortError'
        throw error
      })

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.prompts.run('test-prompt')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.TIMEOUT)
        expect(traciaError.message).toContain('timed out')
      }
    })

    it('handles non-JSON error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => {
          throw new Error('Invalid JSON')
        },
      })

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.prompts.run('test-prompt')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.UNKNOWN)
        expect(traciaError.statusCode).toBe(503)
      }
    })
  })
})