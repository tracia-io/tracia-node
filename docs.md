# Tracia SDK

TypeScript/JavaScript SDK for [Tracia](https://tracia.dev) - store, test, and trace LLM prompts.

## Installation

```bash
npm install tracia
# or
pnpm add tracia
# or
yarn add tracia
```

## Quick Start

```typescript
import { Tracia } from 'tracia';

const tracia = new Tracia({ apiKey: process.env.TRACIA_API_KEY });

const result = await tracia.prompts.run('welcome-email', {
  name: 'Alice',
  product: 'Tracia'
});

console.log(result.text);
```

## API Reference

### `Tracia`

The main client class.

#### Constructor

```typescript
new Tracia(options: TraciaOptions)
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | `string` | Yes | Your Tracia API key (starts with `tr_`) |
| `baseUrl` | `string` | No | API base URL (default: `https://api.tracia.dev`) |

### `tracia.prompts`

Namespace for prompt operations (run, list, get, create, update, delete).

#### `prompts.run(slug, variables?, options?)`

Runs a prompt and returns the generated text.

```typescript
const result = await tracia.prompts.run(
  'welcome-email',           // prompt slug
  { name: 'Alice' },         // variables (optional)
  { model: 'gpt-4' }         // options (optional)
);
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `slug` | `string` | Yes | The prompt slug |
| `variables` | `Record<string, string>` | No | Template variables |
| `options.model` | `string` | No | Override the default model |
| `options.tags` | `string[]` | No | Tags for filtering traces |
| `options.userId` | `string` | No | End user identifier |
| `options.sessionId` | `string` | No | Session identifier |

**Returns:** `Promise<RunResult>`

```typescript
interface RunResult {
  text: string;           // The generated text
  traceId: string;        // Unique trace identifier
  promptVersion: number;  // Version of the prompt used
  latencyMs: number;      // Request latency in milliseconds
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: number;           // Cost in USD
}
```

#### `prompts.list()`

Lists all prompts for the authenticated user.

```typescript
const prompts = await tracia.prompts.list();
console.log(prompts); // [{ slug: 'welcome-email', name: 'Welcome Email', ... }]
```

**Returns:** `Promise<PromptListItem[]>`

#### `prompts.get(slug)`

Gets a single prompt with its current version content.

```typescript
const prompt = await tracia.prompts.get('welcome-email');
console.log(prompt.content); // Array of messages
console.log(prompt.variables); // ['name', 'product']
```

**Returns:** `Promise<Prompt>`

#### `prompts.create(options)`

Creates a new prompt.

```typescript
const prompt = await tracia.prompts.create({
  name: 'Welcome Email',
  slug: 'welcome-email', // optional, auto-generated from name if not provided
  description: 'A welcome email template',
  content: [
    { id: 'msg_1', role: 'system', content: 'You are a helpful assistant.' },
    { id: 'msg_2', role: 'user', content: 'Write a welcome email for {{name}}.' },
  ],
});
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | Yes | Display name for the prompt |
| `slug` | `string` | No | URL-friendly identifier (auto-generated if not provided) |
| `description` | `string` | No | Description of the prompt |
| `content` | `PromptMessage[]` | Yes | Array of messages (system, user, assistant) |

**Returns:** `Promise<Prompt>`

#### `prompts.update(slug, options)`

Updates an existing prompt. If content changes, creates a new version.

```typescript
const prompt = await tracia.prompts.update('welcome-email', {
  name: 'Updated Welcome Email',
  content: [
    { id: 'msg_1', role: 'user', content: 'New content for {{name}}.' },
  ],
});
console.log(prompt.currentVersion); // Version incremented if content changed
```

**Returns:** `Promise<Prompt>`

#### `prompts.delete(slug)`

Deletes a prompt and all its versions.

```typescript
await tracia.prompts.delete('welcome-email');
```

**Returns:** `Promise<void>`

### Prompt Types

```typescript
interface Prompt {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  model: string | null;
  currentVersion: number;
  content: PromptMessage[];
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

interface PromptMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PromptListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  model: string | null;
  currentVersion: number;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}
```

## Error Handling

All API errors throw `TraciaError` with a specific error code:

```typescript
import { Tracia, TraciaError, TraciaErrorCode } from 'tracia';

const tracia = new Tracia({ apiKey: process.env.TRACIA_API_KEY });

try {
  const result = await tracia.prompts.run('welcome-email', { name: 'Alice' });
  console.log(result.text);
} catch (error) {
  if (error instanceof TraciaError) {
    switch (error.code) {
      case TraciaErrorCode.UNAUTHORIZED:
        console.error('Invalid API key');
        break;
      case TraciaErrorCode.NOT_FOUND:
        console.error('Prompt does not exist');
        break;
      case TraciaErrorCode.CONFLICT:
        console.error('Resource already exists');
        break;
      case TraciaErrorCode.MISSING_VARIABLES:
        console.error('Missing required template variables');
        break;
      case TraciaErrorCode.PROVIDER_ERROR:
        console.error('LLM provider error:', error.message);
        break;
      case TraciaErrorCode.NETWORK_ERROR:
        console.error('Network error:', error.message);
        break;
      case TraciaErrorCode.TIMEOUT:
        console.error('Request timed out');
        break;
      default:
        console.error('Unknown error:', error.message);
    }
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Invalid or missing API key |
| `NOT_FOUND` | The requested resource (prompt, etc.) does not exist |
| `CONFLICT` | Resource already exists (e.g., duplicate slug) |
| `MISSING_VARIABLES` | Required template variables are missing |
| `MISSING_PROVIDER_KEY` | No LLM provider key configured |
| `PROVIDER_ERROR` | Error from the LLM provider (OpenAI, etc.) |
| `INVALID_REQUEST` | Invalid request format |
| `NETWORK_ERROR` | Network connectivity error |
| `TIMEOUT` | Request timed out (30 second limit) |

## TypeScript

The SDK is written in TypeScript and exports all types:

```typescript
import {
  Tracia,
  TraciaOptions,
  RunOptions,
  RunResult,
  TokenUsage,
  Prompt,
  PromptListItem,
  PromptMessage,
  MessageRole,
  CreatePromptOptions,
  UpdatePromptOptions,
  TraciaError,
  TraciaErrorCode,
} from 'tracia';
```

## Requirements

- Node.js 18+ (uses native `fetch`)
- Works in modern browsers with native `fetch` support

## License

MIT