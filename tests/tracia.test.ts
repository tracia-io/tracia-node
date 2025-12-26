import { describe, it, expect } from 'vitest'
import { Tracia, TraciaError, TraciaErrorCode } from '../src/index'

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
