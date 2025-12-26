import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Tracia, TraciaError, TraciaErrorCode } from '../src/index'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('traces', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const validApiKey = 'tr_test_api_key'

  const mockTrace = {
    id: 'trace_123',
    traceId: 'trace_abc123',
    promptSlug: 'welcome-email',
    promptVersion: 1,
    model: 'gpt-4',
    provider: 'openai',
    input: {
      messages: [
        { id: 'msg_1', role: 'system', content: 'You are a helpful assistant.' },
        { id: 'msg_2', role: 'user', content: 'Hello Alice!' },
      ],
    },
    variables: { name: 'Alice' },
    output: 'Hello! How can I help you today?',
    status: 'SUCCESS',
    error: null,
    latencyMs: 250,
    inputTokens: 20,
    outputTokens: 10,
    totalTokens: 30,
    cost: 0.00025,
    tags: ['production'],
    userId: 'user_123',
    sessionId: 'session_456',
    createdAt: '2024-01-01T00:00:00.000Z',
  }

  const mockTraceListItem = {
    id: 'trace_123',
    traceId: 'trace_abc123',
    promptSlug: 'welcome-email',
    model: 'gpt-4',
    status: 'SUCCESS',
    latencyMs: 250,
    inputTokens: 20,
    outputTokens: 10,
    totalTokens: 30,
    cost: 0.00025,
    createdAt: '2024-01-01T00:00:00.000Z',
  }

  describe('get', () => {
    it('successfully gets a trace by id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrace,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const trace = await tracia.traces.get('trace_abc123')

      expect(trace).toEqual(mockTrace)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/traces/trace_abc123')
      expect(options.method).toBe('GET')
      expect(options.headers['Authorization']).toBe(`Bearer ${validApiKey}`)
    })

    it('throws NOT_FOUND error when trace does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: {
            code: 'NOT_FOUND',
            message: 'Trace not found: unknown-trace',
          },
        }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.traces.get('unknown-trace')
        expect.fail('Expected TraciaError to be thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.NOT_FOUND)
        expect(traciaError.statusCode).toBe(404)
      }
    })

    it('encodes traceId with special characters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrace,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.traces.get('trace/special')

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/traces/trace%2Fspecial')
    })
  })

  describe('list', () => {
    it('successfully lists traces', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [mockTraceListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const result = await tracia.traces.list()

      expect(result.traces).toEqual([mockTraceListItem])
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/traces')
      expect(url).not.toContain('?')
      expect(options.method).toBe('GET')
      expect(options.headers['Authorization']).toBe(`Bearer ${validApiKey}`)
    })

    it('returns empty array when no traces', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const result = await tracia.traces.list()

      expect(result.traces).toEqual([])
    })

    it('returns nextCursor for pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          traces: [mockTraceListItem],
          nextCursor: 'cursor_abc123',
        }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const result = await tracia.traces.list()

      expect(result.traces).toEqual([mockTraceListItem])
      expect(result.nextCursor).toBe('cursor_abc123')
    })

    it('filters by promptSlug', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [mockTraceListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.traces.list({ promptSlug: 'welcome-email' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('promptSlug=welcome-email')
    })

    it('filters by status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [mockTraceListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.traces.list({ status: 'SUCCESS' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('status=SUCCESS')
    })

    it('filters by date range', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [mockTraceListItem] }),
      })

      const startDate = new Date('2024-01-01T00:00:00.000Z')
      const endDate = new Date('2024-01-31T23:59:59.999Z')

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.traces.list({ startDate, endDate })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('startDate=2024-01-01T00%3A00%3A00.000Z')
      expect(url).toContain('endDate=2024-01-31T23%3A59%3A59.999Z')
    })

    it('filters by userId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [mockTraceListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.traces.list({ userId: 'user_123' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('userId=user_123')
    })

    it('filters by sessionId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [mockTraceListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.traces.list({ sessionId: 'session_456' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('sessionId=session_456')
    })

    it('filters by tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [mockTraceListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.traces.list({ tags: ['production', 'onboarding'] })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('tags=production%2Conboarding')
    })

    it('uses limit for pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [mockTraceListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.traces.list({ limit: 50 })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('limit=50')
    })

    it('uses cursor for pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [mockTraceListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.traces.list({ cursor: 'cursor_abc123' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('cursor=cursor_abc123')
    })

    it('combines multiple filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [mockTraceListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.traces.list({
        promptSlug: 'welcome-email',
        status: 'SUCCESS',
        userId: 'user_123',
        limit: 25,
      })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('promptSlug=welcome-email')
      expect(url).toContain('status=SUCCESS')
      expect(url).toContain('userId=user_123')
      expect(url).toContain('limit=25')
    })
  })
})
