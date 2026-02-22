import type { Tracia } from './index'
import type {
  RunLocalInput,
  RunLocalResult,
  LocalStream,
  RunResponsesInput,
  RunResponsesResult,
  ResponsesStream,
  RunEmbeddingInput,
  RunEmbeddingResult,
} from './types'

/**
 * Input for session.runLocal() - same as RunLocalInput but without traceId/parentSpanId
 * as those are managed by the session.
 */
export type SessionRunLocalInput = Omit<RunLocalInput, 'traceId' | 'parentSpanId'>

/**
 * Input for session.runResponses() - same as RunResponsesInput but without traceId/parentSpanId
 * as those are managed by the session.
 */
export type SessionRunResponsesInput = Omit<RunResponsesInput, 'traceId' | 'parentSpanId'>

/**
 * Input for session.runEmbedding() - same as RunEmbeddingInput but without traceId/parentSpanId
 * as those are managed by the session.
 */
export type SessionRunEmbeddingInput = Omit<RunEmbeddingInput, 'traceId' | 'parentSpanId'>

/**
 * A session for grouping related spans together under a single trace.
 *
 * Sessions automatically chain spans by setting traceId and parentSpanId,
 * creating a linked sequence of spans that can be viewed together in the Tracia dashboard.
 *
 * @example
 * ```typescript
 * const session = tracia.createSession()
 *
 * // First call - creates the trace group
 * const result1 = await session.runLocal({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'What is the weather?' }],
 * })
 *
 * // Second call - automatically linked to the first
 * const result2 = await session.runLocal({
 *   model: 'gpt-4o',
 *   messages: [
 *     { role: 'user', content: 'What is the weather?' },
 *     result1.message,
 *     { role: 'user', content: 'What about tomorrow?' },
 *   ],
 * })
 *
 * // All spans are grouped under the same trace in the dashboard
 * ```
 */
export class TraciaSession {
  private readonly tracia: Tracia
  private traceId: string | null = null
  private lastSpanId: string | null = null

  /**
   * @internal
   * @param tracia - The Tracia client instance
   * @param initialTraceId - Optional trace ID to continue an existing trace
   * @param initialParentSpanId - Optional parent span ID to chain from
   */
  constructor(tracia: Tracia, initialTraceId?: string, initialParentSpanId?: string) {
    this.tracia = tracia
    this.traceId = initialTraceId ?? null
    this.lastSpanId = initialParentSpanId ?? null
  }

  /**
   * Get the current session's trace ID (the ID that groups all spans together).
   * Returns null if no spans have been made yet.
   */
  getTraceId(): string | null {
    return this.traceId
  }

  /**
   * Get the spanId of the last completed span in the session.
   * Returns null if no spans have been made yet.
   */
  getLastSpanId(): string | null {
    return this.lastSpanId
  }

  /**
   * Reset the session, clearing the trace and parent span IDs.
   * The next call will start a new trace group.
   */
  reset(): void {
    this.traceId = null
    this.lastSpanId = null
  }

  /**
   * Execute an LLM call locally, automatically linking it to this session.
   * See Tracia.runLocal() for full documentation.
   */
  runLocal(input: SessionRunLocalInput & { stream: true }): LocalStream
  runLocal(input: SessionRunLocalInput & { stream?: false }): Promise<RunLocalResult>
  runLocal(input: SessionRunLocalInput): Promise<RunLocalResult> | LocalStream {
    const inputWithSession: RunLocalInput = {
      ...input,
      traceId: this.traceId ?? undefined,
      parentSpanId: this.lastSpanId ?? undefined,
    }

    if (input.stream === true) {
      return this.runLocalStreaming(inputWithSession)
    }

    return this.runLocalNonStreaming(inputWithSession)
  }

  private async runLocalNonStreaming(input: RunLocalInput): Promise<RunLocalResult> {
    const { stream: _, ...inputWithoutStream } = input
    const result = await this.tracia.runLocal({ ...inputWithoutStream, stream: false })
    this.updateSessionState(result.spanId, result.traceId)
    return result
  }

  private runLocalStreaming(input: RunLocalInput): LocalStream {
    const { stream: _, ...inputWithoutStream } = input
    const streamInput = { ...inputWithoutStream, stream: true as const }
    const localStream = this.tracia.runLocal(streamInput)

    const wrappedResult = localStream.result.then(result => {
      this.updateSessionState(result.spanId, result.traceId)
      return result
    })

    return {
      spanId: localStream.spanId,
      traceId: localStream.traceId,
      [Symbol.asyncIterator]: () => localStream[Symbol.asyncIterator](),
      result: wrappedResult,
      abort: () => localStream.abort(),
    }
  }

  /**
   * Execute an LLM call using OpenAI's Responses API, automatically linking it to this session.
   * See Tracia.runResponses() for full documentation.
   */
  runResponses(input: SessionRunResponsesInput & { stream: true }): ResponsesStream
  runResponses(input: SessionRunResponsesInput & { stream?: false }): Promise<RunResponsesResult>
  runResponses(input: SessionRunResponsesInput): Promise<RunResponsesResult> | ResponsesStream {
    const inputWithSession: RunResponsesInput = {
      ...input,
      traceId: this.traceId ?? undefined,
      parentSpanId: this.lastSpanId ?? undefined,
    }

    if (input.stream === true) {
      return this.runResponsesStreaming(inputWithSession)
    }

    return this.runResponsesNonStreaming(inputWithSession)
  }

  private async runResponsesNonStreaming(input: RunResponsesInput): Promise<RunResponsesResult> {
    const { stream: _, ...inputWithoutStream } = input
    const result = await this.tracia.runResponses({ ...inputWithoutStream, stream: false })
    this.updateSessionState(result.spanId, result.traceId)
    return result
  }

  private runResponsesStreaming(input: RunResponsesInput): ResponsesStream {
    const { stream: _, ...inputWithoutStream } = input
    const streamInput = { ...inputWithoutStream, stream: true as const }
    const responsesStream = this.tracia.runResponses(streamInput)

    const wrappedResult = responsesStream.result.then(result => {
      this.updateSessionState(result.spanId, result.traceId)
      return result
    })

    return {
      spanId: responsesStream.spanId,
      traceId: responsesStream.traceId,
      [Symbol.asyncIterator]: () => responsesStream[Symbol.asyncIterator](),
      result: wrappedResult,
      abort: () => responsesStream.abort(),
    }
  }

  /**
   * Generate embeddings, automatically linking the span to this session.
   * See Tracia.runEmbedding() for full documentation.
   */
  async runEmbedding(input: SessionRunEmbeddingInput): Promise<RunEmbeddingResult> {
    const inputWithSession: RunEmbeddingInput = {
      ...input,
      traceId: this.traceId ?? undefined,
      parentSpanId: this.lastSpanId ?? undefined,
    }

    const result = await this.tracia.runEmbedding(inputWithSession)
    this.updateSessionState(result.spanId, result.traceId)
    return result
  }

  private updateSessionState(spanId: string, traceId: string): void {
    if (!spanId) return

    if (!this.traceId && traceId) {
      this.traceId = traceId
    }
    this.lastSpanId = spanId
  }
}
