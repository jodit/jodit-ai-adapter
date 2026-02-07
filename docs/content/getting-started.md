# Getting Started

Get up and running with Jodit AI Adapter in minutes.

## Installation

```bash
npm install jodit-ai-adapter
```

## Basic Usage

```typescript
import { start } from 'jodit-ai-adapter';

await start({
  port: 8082,
  providers: {
    openai: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      defaultModel: 'gpt-5.2'
    }
  }
});
```

The server is now running at `http://localhost:8082`.

## Embed Into Existing Express App

If you already have an Express server, mount the adapter as middleware:

```typescript
import express from 'express';
import { start } from 'jodit-ai-adapter';

const app = express();

// ... your existing routes and middleware

await start({
  existingApp: app,
  config: {
    providers: {
      openai: {
        type: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        defaultModel: 'gpt-5.2'
      }
    }
  }
});

app.listen(3000);
```

All AI routes will be available under `/ai/*` (e.g. `/ai/health`, `/ai/request`).

## Docker

```bash
docker run -p 8082:8082 --env-file .env xdsoft/jodit-ai-adapter
```

### Docker Compose

```yaml
services:
  jodit-ai-adapter:
    image: xdsoft/jodit-ai-adapter
    ports:
      - "8082:8082"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_DEFAULT_MODEL=gpt-5.2
    restart: unless-stopped
```

With Redis rate limiting:

```yaml
services:
  jodit-ai-adapter:
    image: xdsoft/jodit-ai-adapter
    ports:
      - "8082:8082"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_DEFAULT_MODEL=gpt-5.2
      - RATE_LIMIT_ENABLED=true
      - RATE_LIMIT_TYPE=redis
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
```

## Verify It Works

```bash
curl http://localhost:8082/ai/health
```

## Next Steps

- [Configuration](configuration.md) - Environment variables, config file, rate limiting
- [API Reference](api-reference.md) - All available endpoints
- [Client Integration](examples/client-integration.md) - Connect Jodit Editor to the adapter
