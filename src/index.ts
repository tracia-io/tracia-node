import { HttpClient } from './client'
import { Prompts } from './prompts'
import { Traces } from './traces'
import { TraciaOptions } from './types'

export { TraciaError } from './errors'
export type {
  TraciaOptions,
  RunVariables,
  RunOptions,
  RunResult,
  TokenUsage,
  Prompt,
  PromptListItem,
  PromptMessage,
  MessageRole,
  CreatePromptOptions,
  UpdatePromptOptions,
  Trace,
  TraceListItem,
  TraceStatus,
  ListTracesOptions,
  ListTracesResult,
} from './types'
export { TraciaErrorCode } from './types'

const DEFAULT_BASE_URL = 'https://app.tracia.io'

export class Tracia {
  private readonly client: HttpClient
  readonly prompts: Prompts
  readonly traces: Traces

  constructor(options: TraciaOptions) {
    if (!options.apiKey) {
      throw new Error('apiKey is required')
    }

    this.client = new HttpClient({
      apiKey: options.apiKey,
      baseUrl: DEFAULT_BASE_URL,
    })

    this.prompts = new Prompts(this.client)
    this.traces = new Traces(this.client)
  }
}
