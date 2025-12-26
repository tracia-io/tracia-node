import { HttpClient } from './client'
import { Trace, ListTracesOptions, ListTracesResult } from './types'

export class Traces {
  constructor(private readonly client: HttpClient) {}

  async get(traceId: string): Promise<Trace> {
    return this.client.get<Trace>(`/api/v1/traces/${encodeURIComponent(traceId)}`)
  }

  async list(options?: ListTracesOptions): Promise<ListTracesResult> {
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
    const path = query ? `/api/v1/traces?${query}` : '/api/v1/traces'

    return this.client.get<ListTracesResult>(path)
  }
}
