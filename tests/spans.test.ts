import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Tracia, TraciaError, TraciaErrorCode, Eval } from '../src/index'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('spans', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const validApiKey = 'tr_test_api_key'

  const mockSpan = {
    id: 'span_123',
    spanId: 'sp_abc123def456789',
    traceId: 'tr_abc123def456789',
    parentSpanId: null,
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

  const mockSpanListItem = {
    id: 'span_123',
    spanId: 'sp_abc123def456789',
    traceId: 'tr_abc123def456789',
    parentSpanId: null,
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
    it('successfully gets a span by id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSpan,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const span = await tracia.spans.get('sp_abc123def456789')

      expect(span).toEqual(mockSpan)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/spans/sp_abc123def456789')
      expect(options.method).toBe('GET')
      expect(options.headers['Authorization']).toBe(`Bearer ${validApiKey}`)
    })

    it('throws NOT_FOUND error when span does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: {
            code: 'NOT_FOUND',
            message: 'Span not found: unknown-span',
          },
        }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.spans.get('unknown-span')
        expect.fail('Expected TraciaError to be thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.NOT_FOUND)
        expect(traciaError.statusCode).toBe(404)
      }
    })

    it('encodes spanId with special characters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSpan,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.get('sp_abc/special')

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/spans/sp_abc%2Fspecial')
    })
  })

  describe('list', () => {
    it('successfully lists spans', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [mockSpanListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const result = await tracia.spans.list()

      expect(result.spans).toEqual([mockSpanListItem])
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/spans')
      expect(url).not.toContain('?')
      expect(options.method).toBe('GET')
      expect(options.headers['Authorization']).toBe(`Bearer ${validApiKey}`)
    })

    it('returns empty array when no spans', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const result = await tracia.spans.list()

      expect(result.spans).toEqual([])
    })

    it('returns nextCursor for pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          spans: [mockSpanListItem],
          nextCursor: 'cursor_abc123',
        }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const result = await tracia.spans.list()

      expect(result.spans).toEqual([mockSpanListItem])
      expect(result.nextCursor).toBe('cursor_abc123')
    })

    it('filters by promptSlug', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [mockSpanListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.list({ promptSlug: 'welcome-email' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('promptSlug=welcome-email')
    })

    it('filters by status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [mockSpanListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.list({ status: 'SUCCESS' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('status=SUCCESS')
    })

    it('filters by date range', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [mockSpanListItem] }),
      })

      const startDate = new Date('2024-01-01T00:00:00.000Z')
      const endDate = new Date('2024-01-31T23:59:59.999Z')

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.list({ startDate, endDate })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('startDate=2024-01-01T00%3A00%3A00.000Z')
      expect(url).toContain('endDate=2024-01-31T23%3A59%3A59.999Z')
    })

    it('filters by userId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [mockSpanListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.list({ userId: 'user_123' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('userId=user_123')
    })

    it('filters by sessionId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [mockSpanListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.list({ sessionId: 'session_456' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('sessionId=session_456')
    })

    it('filters by tags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [mockSpanListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.list({ tags: ['production', 'onboarding'] })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('tags=production%2Conboarding')
    })

    it('uses limit for pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [mockSpanListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.list({ limit: 50 })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('limit=50')
    })

    it('uses cursor for pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [mockSpanListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.list({ cursor: 'cursor_abc123' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('cursor=cursor_abc123')
    })

    it('combines multiple filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [mockSpanListItem] }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.list({
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

  describe('evaluate', () => {
    const mockEvaluateResult = {
      id: 'eval_abc123',
      evaluatorKey: 'quality',
      evaluatorName: 'Quality',
      value: 1,
      source: 'sdk',
      note: null,
      createdAt: '2024-01-05T00:00:00.000Z',
    }

    it('successfully submits positive evaluation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvaluateResult,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const result = await tracia.spans.evaluate('sp_abc123def456789', {
        evaluator: 'quality',
        value: Eval.POSITIVE,
      })

      expect(result).toEqual(mockEvaluateResult)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/spans/sp_abc123def456789/evaluations')
      expect(options.method).toBe('POST')
      expect(options.headers['Authorization']).toBe(`Bearer ${validApiKey}`)

      const body = JSON.parse(options.body)
      expect(body.evaluatorKey).toBe('quality')
      expect(body.value).toBe(1)
      expect(body.note).toBeUndefined()
    })

    it('successfully submits negative evaluation', async () => {
      const negativeResult = { ...mockEvaluateResult, value: 0 }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => negativeResult,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const result = await tracia.spans.evaluate('sp_abc123def456789', {
        evaluator: 'quality',
        value: Eval.NEGATIVE,
      })

      expect(result.value).toBe(0)

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.value).toBe(0)
    })

    it('successfully submits numeric score', async () => {
      const numericResult = { ...mockEvaluateResult, value: 8 }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => numericResult,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const result = await tracia.spans.evaluate('sp_abc123def456789', {
        evaluator: 'accuracy',
        value: 8,
      })

      expect(result.value).toBe(8)

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.value).toBe(8)
    })

    it('includes note when provided', async () => {
      const resultWithNote = { ...mockEvaluateResult, note: 'Response was off-topic' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => resultWithNote,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      const result = await tracia.spans.evaluate('sp_abc123def456789', {
        evaluator: 'quality',
        value: Eval.NEGATIVE,
        note: 'Response was off-topic',
      })

      expect(result.note).toBe('Response was off-topic')

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.note).toBe('Response was off-topic')
    })

    it('throws INVALID_REQUEST error for non-number value', async () => {
      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.spans.evaluate('sp_abc123def456789', {
          evaluator: 'quality',
          value: 'invalid' as unknown as number,
        })
        expect.fail('Expected TraciaError to be thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.INVALID_REQUEST)
        expect(traciaError.message).toContain('Must be a number')
      }

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('throws NOT_FOUND error when span does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: {
            code: 'NOT_FOUND',
            message: 'Span not found: unknown-span',
          },
        }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })

      try {
        await tracia.spans.evaluate('unknown-span', {
          evaluator: 'quality',
          value: Eval.POSITIVE,
        })
        expect.fail('Expected TraciaError to be thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TraciaError)
        const traciaError = error as TraciaError
        expect(traciaError.code).toBe(TraciaErrorCode.NOT_FOUND)
        expect(traciaError.statusCode).toBe(404)
      }
    })

    it('encodes spanId with special characters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvaluateResult,
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.evaluate('sp_abc/special', {
        evaluator: 'quality',
        value: Eval.POSITIVE,
      })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/v1/spans/sp_abc%2Fspecial/evaluations')
    })

    it('works with different evaluator keys', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockEvaluateResult, evaluatorKey: 'helpfulness' }),
      })

      const tracia = new Tracia({ apiKey: validApiKey })
      await tracia.spans.evaluate('sp_abc123def456789', {
        evaluator: 'helpfulness',
        value: Eval.POSITIVE,
      })

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.evaluatorKey).toBe('helpfulness')
    })
  })
})
