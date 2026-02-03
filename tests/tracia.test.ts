import { describe, it, expect } from 'vitest'
import { Tracia, TraciaError, TraciaErrorCode, TraciaSession } from '../src/index'

describe('Tracia', () => {
  describe('constructor', () => {
    it('throws error when apiKey is not provided', () => {
      expect(() => new Tracia({ apiKey: '' })).toThrow('apiKey is required')
    })

    it('creates instance with valid apiKey', () => {
      const tracia = new Tracia({ apiKey: 'tr_test_key' })
      expect(tracia).toBeInstanceOf(Tracia)
    })
  })

  describe('createSession', () => {
    it('creates session with no initial values', () => {
      const tracia = new Tracia({ apiKey: 'tr_test_key' })
      const session = tracia.createSession()
      expect(session).toBeInstanceOf(TraciaSession)
      expect(session.getTraceId()).toBeNull()
      expect(session.getLastSpanId()).toBeNull()
    })

    it('accepts initial traceId and parentSpanId', () => {
      const tracia = new Tracia({ apiKey: 'tr_test_key' })
      const session = tracia.createSession({
        traceId: 'tr_abc123def456789',
        parentSpanId: 'sp_def456abc123789',
      })
      expect(session.getTraceId()).toBe('tr_abc123def456789')
      expect(session.getLastSpanId()).toBe('sp_def456abc123789')
    })
  })
})

describe('TraciaError', () => {
  it('has correct name property', () => {
    const error = new TraciaError(TraciaErrorCode.UNAUTHORIZED, 'Test message')
    expect(error.name).toBe('TraciaError')
  })

  it('instanceof check works correctly', () => {
    const error = new TraciaError(TraciaErrorCode.UNAUTHORIZED, 'Test message')
    expect(error instanceof TraciaError).toBe(true)
    expect(error instanceof Error).toBe(true)
  })

  it('preserves all properties', () => {
    const error = new TraciaError(
      TraciaErrorCode.NOT_FOUND,
      'Prompt not found',
      404
    )
    expect(error.code).toBe(TraciaErrorCode.NOT_FOUND)
    expect(error.message).toBe('Prompt not found')
    expect(error.statusCode).toBe(404)
  })
})
