# Tracia SDK

TypeScript SDK for [Tracia](https://tracia.io) — store, test, and trace LLM prompts.

## Installation

```bash
npm install tracia
```

## Quick Start

```typescript
import { Tracia } from 'tracia';

const tracia = new Tracia({ apiKey: process.env.TRACIA_API_KEY });

const result = await tracia.prompts.run('welcome-email', { name: 'Alice' });
console.log(result.text);
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