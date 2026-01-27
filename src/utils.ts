import crypto from 'crypto'

const TRACE_ID_REGEX = /^tr_[a-f0-9]{16}$/i

export function generateTraceId(): string {
  const randomPart = crypto.randomBytes(8).toString('hex')
  return `tr_${randomPart}`
}

export function isValidTraceIdFormat(traceId: string): boolean {
  return TRACE_ID_REGEX.test(traceId)
}
