import { HttpClient } from './client'
import {
  RunVariables,
  RunOptions,
  RunResult,
  ApiSuccessResponse,
  Prompt,
  PromptListItem,
  CreatePromptOptions,
  UpdatePromptOptions,
  ListPromptsResponse,
  DeletePromptResponse,
  LocalPromptMessage,
} from './types'

interface RunRequestBody {
  variables?: RunVariables
  messages?: LocalPromptMessage[]
  model?: string
  version?: number
  tags?: string[]
  userId?: string
  sessionId?: string
  traceId?: string
  parentSpanId?: string
}

export class Prompts {
  constructor(private readonly client: HttpClient) {}

  async list(): Promise<PromptListItem[]> {
    const response = await this.client.get<ListPromptsResponse>('/api/v1/prompts')
    return response.prompts
  }

  async get(slug: string): Promise<Prompt> {
    return this.client.get<Prompt>(`/api/v1/prompts/${encodeURIComponent(slug)}`)
  }

  async create(options: CreatePromptOptions): Promise<Prompt> {
    return this.client.post<Prompt>('/api/v1/prompts', options)
  }

  async update(slug: string, options: UpdatePromptOptions): Promise<Prompt> {
    return this.client.put<Prompt>(
      `/api/v1/prompts/${encodeURIComponent(slug)}`,
      options
    )
  }

  async delete(slug: string): Promise<void> {
    await this.client.delete<DeletePromptResponse>(
      `/api/v1/prompts/${encodeURIComponent(slug)}`
    )
  }

  async run(
    slug: string,
    variables?: RunVariables,
    options?: RunOptions
  ): Promise<RunResult> {
    const requestBody: RunRequestBody = {}

    if (variables && Object.keys(variables).length > 0) {
      requestBody.variables = variables
    }

    if (options?.model) {
      requestBody.model = options.model
    }

    if (options?.version != null) {
      requestBody.version = options.version
    }

    if (options?.tags && options.tags.length > 0) {
      requestBody.tags = options.tags
    }

    if (options?.userId) {
      requestBody.userId = options.userId
    }

    if (options?.sessionId) {
      requestBody.sessionId = options.sessionId
    }

    if (options?.traceId) {
      requestBody.traceId = options.traceId
    }

    if (options?.parentSpanId) {
      requestBody.parentSpanId = options.parentSpanId
    }

    if (options?.messages && options.messages.length > 0) {
      requestBody.messages = options.messages
    }

    const response = await this.client.post<ApiSuccessResponse>(
      `/api/v1/prompts/${encodeURIComponent(slug)}/run`,
      requestBody
    )

    return {
      text: response.text,
      spanId: response.spanId,
      traceId: response.traceId,
      promptVersion: response.promptVersion,
      latencyMs: response.latencyMs,
      usage: response.usage,
      cost: response.cost,
      finishReason: response.finishReason,
      toolCalls: response.toolCalls,
      structuredOutput: response.structuredOutput,
      messages: response.messages,
    }
  }
}
