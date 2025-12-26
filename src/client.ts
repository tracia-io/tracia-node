import { TraciaError } from './errors'
import {
  TraciaErrorCode,
  ApiErrorResponse,
  ApiSuccessResponse,
} from './types'

const SDK_VERSION = process.env.SDK_VERSION || '0.0.0'
const DEFAULT_TIMEOUT_MS = 30000

interface HttpClientOptions {
  apiKey: string
  baseUrl: string
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
}

function mapApiErrorCodeToTraciaErrorCode(apiCode: string): TraciaErrorCode {
  const codeMap: Record<string, TraciaErrorCode> = {
    UNAUTHORIZED: TraciaErrorCode.UNAUTHORIZED,
    NOT_FOUND: TraciaErrorCode.NOT_FOUND,
    CONFLICT: TraciaErrorCode.CONFLICT,
    MISSING_PROVIDER_KEY: TraciaErrorCode.MISSING_PROVIDER_KEY,
    PROVIDER_ERROR: TraciaErrorCode.PROVIDER_ERROR,
    MISSING_VARIABLES: TraciaErrorCode.MISSING_VARIABLES,
    INVALID_REQUEST: TraciaErrorCode.INVALID_REQUEST,
  }
  return codeMap[apiCode] ?? TraciaErrorCode.UNKNOWN
}

export class HttpClient {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(options: HttpClientOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>({ method: 'GET', path })
  }

  async post<T = ApiSuccessResponse>(path: string, body: unknown): Promise<T> {
    return this.request<T>({ method: 'POST', path, body })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>({ method: 'PUT', path, body })
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>({ method: 'DELETE', path })
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${options.path}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': `tracia-sdk/${SDK_VERSION}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorData: ApiErrorResponse | undefined
        try {
          errorData = (await response.json()) as ApiErrorResponse
        } catch {
          throw new TraciaError(
            TraciaErrorCode.UNKNOWN,
            `HTTP ${response.status}: ${response.statusText}`,
            response.status
          )
        }

        if (errorData?.error) {
          const errorCode = mapApiErrorCodeToTraciaErrorCode(errorData.error.code)
          throw new TraciaError(errorCode, errorData.error.message, response.status)
        }

        throw new TraciaError(
          TraciaErrorCode.UNKNOWN,
          `HTTP ${response.status}: ${response.statusText}`,
          response.status
        )
      }

      return (await response.json()) as T
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof TraciaError) {
        throw error
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new TraciaError(
            TraciaErrorCode.TIMEOUT,
            `Request timed out after ${DEFAULT_TIMEOUT_MS}ms`
          )
        }

        throw new TraciaError(
          TraciaErrorCode.NETWORK_ERROR,
          `Network error: ${error.message}`
        )
      }

      throw new TraciaError(TraciaErrorCode.UNKNOWN, 'An unknown error occurred')
    }
  }
}