import { TraciaErrorCode } from './types'

export class TraciaError extends Error {
  readonly code: TraciaErrorCode
  readonly statusCode?: number

  constructor(code: TraciaErrorCode, message: string, statusCode?: number) {
    super(message)
    this.name = 'TraciaError'
    this.code = code
    this.statusCode = statusCode

    Object.setPrototypeOf(this, TraciaError.prototype)
  }
}