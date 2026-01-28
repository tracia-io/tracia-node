 Plan: Local Prompt Execution with runLocal()

 Add the ability to run local prompts directly against LLM providers (OpenAI, Anthropic, Gemini) while sending traces to Tracia for observability.

 Summary

 - New tracia.runLocal() method for executing inline prompts locally
 - Provider SDKs as optional peer dependencies (users install only what they need)
 - API keys read from environment variables
 - New POST /api/v1/traces endpoint for trace creation
 - LLM configuration support (temperature, maxTokens, topP, etc.)

 ---
 Public API

 // Inline prompt - no Tracia fetch needed
 const result = await tracia.runLocal({
   messages: [
     { role: 'system', content: 'You are a helpful assistant.' },
     { role: 'user', content: 'Hello {{name}}!' },
   ],
   model: 'gpt-4o',
   // LLM configuration
   temperature: 0.7,
   maxTokens: 1000,
   topP: 0.9,
   // Variables for interpolation
   variables: { name: 'Alice' },
   // Tracing options
   slug: 'welcome-email',  // Optional: identifies the prompt in traces
   tags: ['production'],
   userId: 'user_123',
   sendTrace: true,  // default: true
 })

 Note: This is a top-level tracia.runLocal() method, not on the prompts manager, since we're not fetching prompts from Tracia.

 ---
 New Types

 src/types.ts

 export enum LLMProvider {
   OPENAI = 'openai',
   ANTHROPIC = 'anthropic',
   GOOGLE = 'google',
 }

 // Input for runLocal
 export interface RunLocalInput {
   // Required
   messages: PromptMessage[]
   model: string

   // LLM configuration
   temperature?: number      // 0-2 for OpenAI, 0-1 for Anthropic/Google
   maxTokens?: number        // Maximum tokens to generate
   topP?: number             // Nucleus sampling
   stopSequences?: string[]  // Stop generation at these sequences

   // Variables for {{interpolation}}
   variables?: Record<string, string>

   // Provider config
   providerApiKey?: string   // Override env var

   // Tracing options
   slug?: string             // Identifies prompt in traces (optional)
   tags?: string[]
   userId?: string
   sessionId?: string
   sendTrace?: boolean       // Default: true
 }

 export interface RunLocalResult {
   text: string
   traceId: string           // Empty if sendTrace: false
   latencyMs: number
   usage: TokenUsage
   cost: number | null
   provider: LLMProvider
   model: string
 }

 export interface CreateTracePayload {
   slug?: string             // Optional prompt identifier
   model: string
   provider: LLMProvider
   input: { messages: PromptMessage[] }
   variables: Record<string, string> | null
   output: string | null
   status: TraceStatus
   error: string | null
   latencyMs: number
   inputTokens: number
   outputTokens: number
   totalTokens: number
   cost: number | null
   tags?: string[]
   userId?: string
   sessionId?: string
 }

 New Error Codes

 export enum TraciaErrorCode {
   // ... existing ...
   MISSING_PROVIDER_SDK = 'missing_provider_sdk',
   MISSING_PROVIDER_API_KEY = 'missing_provider_api_key',
   UNSUPPORTED_MODEL = 'unsupported_model',
 }

 ---
 File Structure

 src/
 ├── providers/
 │   ├── index.ts              # Exports
 │   ├── types.ts              # Provider interfaces
 │   ├── registry.ts           # Model → adapter resolution
 │   ├── openai-adapter.ts
 │   ├── anthropic-adapter.ts
 │   └── google-adapter.ts
 tests/
 ├── providers/
 │   ├── openai-adapter.test.ts
 │   ├── anthropic-adapter.test.ts
 │   └── google-adapter.test.ts
 └── prompts-run-local.test.ts

 ---
 Provider Adapter Interface

 // src/providers/types.ts
 export interface ProviderCompletionOptions {
   model: string
   messages: ProviderMessage[]
   apiKey: string
   config: LLMConfig
 }

 export interface LLMProviderAdapter {
   readonly provider: LLMProvider
   readonly supportedModels: string[]

   isAvailable(): boolean
   supportsModel(modelId: string): boolean
   complete(options: ProviderCompletionOptions): Promise<ProviderCompletionResult>
 }

 ---
 Implementation Steps

 1. Types & Error Codes

 File: src/types.ts
 - Add LLMProvider enum
 - Add RunLocalInput, RunLocalResult, CreateTracePayload
 - Add new error codes (MISSING_PROVIDER_SDK, MISSING_PROVIDER_API_KEY, UNSUPPORTED_MODEL)

 2. Provider Infrastructure

 New file: src/providers/types.ts
 - ProviderMessage, ProviderCompletionOptions, ProviderCompletionResult
 - LLMProviderAdapter interface

 New file: src/providers/registry.ts
 - ProviderRegistry class with model-to-adapter resolution

 3. Provider Adapters

 New files: src/providers/openai-adapter.ts, anthropic-adapter.ts, google-adapter.ts

 Each adapter:
 - Lazy-loads SDK with try-catch
 - Maps LLMConfig to provider-specific params
 - Returns normalized ProviderCompletionResult

 Example OpenAI mapping:
 await client.chat.completions.create({
   model: options.model,
   messages: options.messages,
   temperature: options.config.temperature,
   max_tokens: options.config.maxTokens,
   top_p: options.config.topP,
   stop: options.config.stopSequences,
 })

 4. Trace Creation

 File: src/traces.ts
 - Add create(payload: CreateTracePayload): Promise<{ traceId: string }>

 5. runLocal Method

 File: src/index.ts
 - Add runLocal() method to main Tracia class
 - Flow: interpolate variables → resolve adapter → get API key → call provider → create trace → return result

 6. Exports & Package

 File: src/index.ts
 - Export new types

 File: package.json
 {
   "peerDependencies": {
     "openai": "^4.0.0",
     "@anthropic-ai/sdk": "^0.30.0",
     "@google/generative-ai": "^0.21.0"
   },
   "peerDependenciesMeta": {
     "openai": { "optional": true },
     "@anthropic-ai/sdk": { "optional": true },
     "@google/generative-ai": { "optional": true }
   }
 }

 7. Tests

 - Unit tests for each adapter (SDK loading, model detection, config mapping)
 - Integration tests for runLocal() (success, errors, trace creation)

 ---
 Key Files to Modify

 | File          | Changes                                                                         |
 |---------------|---------------------------------------------------------------------------------|
 | src/types.ts  | Add LLMProvider, RunLocalInput, RunLocalResult, CreateTracePayload, error codes |
 | src/traces.ts | Add create() method                                                             |
 | src/index.ts  | Add runLocal() method to Tracia class, export new types                         |
 | package.json  | Add optional peer dependencies                                                  |

 New Files

 | File                               | Purpose                     |
 |------------------------------------|-----------------------------|
 | src/providers/types.ts             | Provider interfaces         |
 | src/providers/registry.ts          | Model-to-adapter resolution |
 | src/providers/openai-adapter.ts    | OpenAI implementation       |
 | src/providers/anthropic-adapter.ts | Anthropic implementation    |
 | src/providers/google-adapter.ts    | Google implementation       |
 | src/providers/index.ts             | Barrel export               |

 ---
 Environment Variables

 | Provider  | Env Var           |
 |-----------|-------------------|
 | OpenAI    | OPENAI_API_KEY    |
 | Anthropic | ANTHROPIC_API_KEY |
 | Google    | GOOGLE_API_KEY    |









###############################
###############################
RESULT
###############################
###############################
 All 83 tests pass. Let me mark the final task as complete.

⏺ Implementation complete. Here's a summary of what was built:

  Summary

  New Files Created

  - src/providers/types.ts - Provider adapter interfaces
  - src/providers/registry.ts - Model-to-adapter resolution
  - src/providers/openai-adapter.ts - OpenAI SDK integration
  - src/providers/anthropic-adapter.ts - Anthropic SDK integration
  - src/providers/google-adapter.ts - Google AI SDK integration
  - src/providers/index.ts - Barrel export

  Files Modified

  - src/types.ts - Added LLMProvider, LocalPromptMessage, RunLocalInput, RunLocalResult, CreateTracePayload, CreateTraceResult, and new error codes
  - src/traces.ts - Added create() method
  - src/index.ts - Added runLocal() method with variable interpolation, provider resolution, and trace creation
  - package.json - Added optional peer dependencies for provider SDKs

  Tests Created

  - tests/run-local.test.ts - 14 tests for runLocal and traces.create
  - tests/providers/openai-adapter.test.ts - 8 tests
  - tests/providers/anthropic-adapter.test.ts - 6 tests
  - tests/providers/google-adapter.test.ts - 6 tests

  Usage Example

  const tracia = new Tracia({ apiKey: 'tr_xxx' })

  const result = await tracia.runLocal({
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello {{name}}!' },
    ],
    model: 'gpt-4o',
    variables: { name: 'Alice' },
    temperature: 0.7,
    slug: 'welcome',
    tags: ['production'],
  })

  console.log(result.text)       // LLM response
  console.log(result.traceId)    // Trace ID for observability
