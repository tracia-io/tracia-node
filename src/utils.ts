import crypto from 'crypto'

const SPAN_ID_REGEX = /^sp_[a-f0-9]{16}$/i
const TRACE_ID_REGEX = /^tr_[a-f0-9]{16}$/i

export function generateSpanId(): string {
  const randomPart = crypto.randomBytes(8).toString('hex')
  return `sp_${randomPart}`
}

export function generateTraceId(): string {
  const randomPart = crypto.randomBytes(8).toString('hex')
  return `tr_${randomPart}`
}

export function isValidSpanIdFormat(spanId: string): boolean {
  return SPAN_ID_REGEX.test(spanId) || TRACE_ID_REGEX.test(spanId)
}

export function isValidTraceIdFormat(traceId: string): boolean {
  return TRACE_ID_REGEX.test(traceId)
}
