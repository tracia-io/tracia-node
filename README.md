# Tracia SDK

TypeScript SDK for [Tracia](https://tracia.io) - store, test, and trace LLM prompts.

## Installation

```bash
npm install tracia ai
```

When using `runLocal()` or `runResponses()`, install the provider for your model:

```bash
npm install @ai-sdk/openai    # for GPT, o1, o3, etc.
npm install @ai-sdk/anthropic  # for Claude
npm install @ai-sdk/google     # for Gemini
```

## Quick Start

```typescript
import { Tracia } from 'tracia';

const tracia = new Tracia({ apiKey: process.env.TRACIA_API_KEY });

// Run a prompt stored in Tracia
const result = await tracia.prompts.run('welcome-email', { name: 'Alice' });
console.log(result.text);

// Or call LLM directly with automatic tracing
const response = await tracia.runLocal({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(response.text);
```

## Documentation

[Full API Reference →](https://docs.tracia.io/sdk-node/)

## Features

- Run prompts with variables and automatic tracing
- Manage prompts programmatically (create, update, delete)
- Full TypeScript support with exported types
- Zero dependencies (native fetch)

## License

MIT