# Tracia SDK

TypeScript/JavaScript SDK for Tracia — the developer tool for storing, testing, and tracing LLM prompts.

This SDK provides a simple interface to call prompts stored in Tracia and automatically trace all LLM interactions.

## Quick Context
```typescript
import { Tracia } from 'tracia';

const tracia = new Tracia({ apiKey: 'tr_xxx' });
const result = await tracia.run('welcome-email', { name: 'Alice' });
```

The SDK calls the Tracia API (`POST /v1/run`), which handles prompt resolution, LLM calls, and tracing. The SDK itself never calls LLM providers directly.

## IMPORTANT: Coding Standards

### Naming
- ALWAYS use descriptive variable/parameter names
- NEVER use single-letter names (`p`, `r`, `k`) except in trivial callbacks like `.map(x => x.id)`
- Use domain terminology: `prompt`, `trace`, `provider`, `apiKey`

✅ Good:
```typescript
function createTrace(promptSlug: string, variables: Record<string, string>): Trace
const response = await this.client.post('/v1/run', payload)
for (const trace of traces) { }
```

❌ Bad:
```typescript
function createTrace(p: string, v: Record<string, string>): Trace
const r = await this.client.post('/v1/run', payload)
for (const t of traces) { }
```

### Enums and Constants
- ALWAYS use enums/constants for fixed values, never hardcoded strings
- Define enums in `src/types.ts`

✅ Good:
```typescript
if (response.status === TraciaErrorCode.PROMPT_NOT_FOUND)
throw new TraciaError(TraciaErrorCode.INVALID_API_KEY, message)
```

❌ Bad:
```typescript
if (response.status === 'prompt_not_found')
throw new TraciaError('invalid_api_key', message)
```

### Comments
- Do NOT add comments that just describe what's obvious from names
- Only comment on WHY, not WHAT

✅ Good:
```typescript
// Retry with exponential backoff because OpenAI often returns 429 under load
async function executeWithRetry(fn: () => Promise<T>): Promise<T>
```

❌ Bad:
```typescript
// Execute the function with retry logic
async function executeWithRetry(fn: () => Promise<T>): Promise<T>
```

## Tech Stack

- TypeScript (strict mode)
- No runtime dependencies (fetch is native, no axios)
- Vitest for testing
- tsup for bundling
- Publishes to npm as `tracia`

## Project Structure
```
tracia-sdk/
├── src/
│   ├── index.ts           # Main export, Tracia class
│   ├── client.ts          # HTTP client for API calls
│   ├── types.ts           # All TypeScript types and enums
│   ├── errors.ts          # TraciaError class and error codes
│   └── utils.ts           # Helpers (if needed)
├── tests/
│   ├── client.test.ts
│   ├── tracia.test.ts
│   └── mocks/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

## Public API Surface

Keep the API minimal. Only these should be exported:
```typescript
// Main class
export class Tracia {
  constructor(options: TraciaOptions)
  run(prompt: string, variables?: RunVariables, options?: RunOptions): Promise<RunResult>
}

// Types
export interface TraciaOptions {
  apiKey: string
  baseUrl?: string  // defaults to https://api.tracia.dev
}

export interface RunOptions {
  model?: string
  tags?: string[]
  userId?: string
  sessionId?: string
}

export interface RunResult {
  text: string
  traceId: string
  promptVersion: number
  latencyMs: number
  usage: TokenUsage
  cost: number
}

// Errors
export class TraciaError extends Error {
  code: TraciaErrorCode
  statusCode?: number
}

export enum TraciaErrorCode {
  INVALID_API_KEY = 'invalid_api_key',
  PROMPT_NOT_FOUND = 'prompt_not_found',
  PROVIDER_ERROR = 'provider_error',
  RATE_LIMITED = 'rate_limited',
  NETWORK_ERROR = 'network_error',
}
```

## Key Patterns

### Error Handling
- All API errors should throw `TraciaError` with appropriate `TraciaErrorCode`
- Include original error message from API in the error
- Network failures should be `TraciaErrorCode.NETWORK_ERROR`

### HTTP Client
- Use native `fetch` (no axios or other deps)
- Set reasonable timeout (30s default, LLM calls can be slow)
- Include SDK version in User-Agent header

### TypeScript
- Strict mode enabled
- Export all public types
- Use `interface` for object shapes, `type` for unions/aliases

## Commands
```bash
pnpm install          # Install dependencies
pnpm dev              # Watch mode for development
pnpm build            # Build with tsup
pnpm test             # Run tests with vitest
pnpm test:watch       # Run tests in watch mode
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm release          # Bump version and publish to npm
```

## Testing Guidelines

- Mock the HTTP layer, not the Tracia class methods
- Test error scenarios: invalid API key, prompt not found, network failure
- Test that correct headers are sent (Authorization, User-Agent)
- No need for integration tests hitting real API in this repo

## Design Principles

1. **Zero dependencies** — Only native fetch, no bloat
2. **Type-safe** — Full TypeScript, strict mode, exported types
3. **Predictable errors** — Always TraciaError with known codes
4. **Minimal API** — One class, one main method, that's it
5. **Tree-shakeable** — ESM build, no side effects