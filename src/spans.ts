import { HttpClient } from './client'
import { TraciaError } from './errors'
import {
  Span,
  ListSpansOptions,
  ListSpansResult,
  EvaluateOptions,
  EvaluateResult,
  TraciaErrorCode,
  CreateSpanPayload,
  CreateSpanResult,
} from './types'

/** @internal Symbol for setting pending spans map - not part of public API */
export const INTERNAL_SET_PENDING_SPANS = Symbol('setPendingSpansMap')

export class Spans {
  private pendingSpans: Map<string, Promise<void>> | null = null

  constructor(private readonly client: HttpClient) {}

  /** @internal */
  [INTERNAL_SET_PENDING_SPANS](map: Map<string, Promise<void>>): void {
    this.pendingSpans = map
  }

  async create(payload: CreateSpanPayload): Promise<CreateSpanResult> {
    return this.client.post<CreateSpanResult>('/api/v1/spans', payload)
  }

  async get(spanId: string): Promise<Span> {
    return this.client.get<Span>(`/api/v1/spans/${encodeURIComponent(spanId)}`)
  }

  async list(options?: ListSpansOptions): Promise<ListSpansResult> {
    const params = new URLSearchParams()

    if (options?.promptSlug) {
      params.set('promptSlug', options.promptSlug)
    }

    if (options?.status) {
      params.set('status', options.status)
    }

    if (options?.startDate) {
      params.set('startDate', options.startDate.toISOString())
    }

    if (options?.endDate) {
      params.set('endDate', options.endDate.toISOString())
    }

    if (options?.userId) {
      params.set('userId', options.userId)
    }

    if (options?.sessionId) {
      params.set('sessionId', options.sessionId)
    }

    if (options?.tags && options.tags.length > 0) {
      params.set('tags', options.tags.join(','))
    }

    if (options?.limit) {
      params.set('limit', String(options.limit))
    }

    if (options?.cursor) {
      params.set('cursor', options.cursor)
    }

    const query = params.toString()
    const path = query ? `/api/v1/spans?${query}` : '/api/v1/spans'

    return this.client.get<ListSpansResult>(path)
  }

  async evaluate(spanId: string, options: EvaluateOptions): Promise<EvaluateResult> {
    if (this.pendingSpans) {
      const pendingSpan = this.pendingSpans.get(spanId)
      if (pendingSpan) {
        await pendingSpan
      }
    }

    if (typeof options.value !== 'number') {
      throw new TraciaError(
        TraciaErrorCode.INVALID_REQUEST,
        `Invalid evaluation value. Must be a number.`
      )
    }

    const body: { evaluatorKey: string; value: number; note?: string } = {
      evaluatorKey: options.evaluator,
      value: options.value,
    }

    if (options.note !== undefined) {
      body.note = options.note
    }

    return this.client.post<EvaluateResult>(
      `/api/v1/spans/${encodeURIComponent(spanId)}/evaluations`,
      body
    )
  }
}

/** @deprecated Use Spans instead */
export const Traces = Spans
/** @deprecated Use INTERNAL_SET_PENDING_SPANS instead */
export const INTERNAL_SET_PENDING_TRACES = INTERNAL_SET_PENDING_SPANS
