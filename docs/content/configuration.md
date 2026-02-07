# Configuration

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8082` |
| `NODE_ENV` | Environment mode | `development` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `OPENAI_DEFAULT_MODEL` | Default OpenAI model | `gpt-5.2` |
| `RATE_LIMIT_ENABLED` | Enable rate limiting | `false` |
| `RATE_LIMIT_TYPE` | Rate limiter type (`memory` or `redis`) | `memory` |
| `REDIS_URL` | Redis connection URL | - |
| `CONFIG_FILE` | Path to JSON config file | - |

## Standalone Server

The package ships a ready-to-run entry point at `jodit-ai-adapter/run`.
This is the fastest way to spin up a local server — no custom code required:

```bash
OPENAI_API_KEY=sk-... node -e "import('jodit-ai-adapter/run')"
```

It reads all settings from environment variables (see table above).
To use a JSON config file instead, set `CONFIG_FILE`:

```bash
CONFIG_FILE=./config.json node -e "import('jodit-ai-adapter/run')"
```

### Configuration File Format

```json
{
  "port": 8082,
  "providers": {
    "openai": {
      "type": "openai",
      "apiKey": "sk-...",
      "defaultModel": "gpt-5.2"
    }
  },
  "rateLimit": {
    "enabled": true,
    "type": "memory",
    "maxRequests": 100,
    "windowMs": 60000
  }
}
```

### Docker

The Docker image uses the same standalone entry point internally:

```bash
docker run -p 8082:8082 -e OPENAI_API_KEY=sk-... xdsoft/jodit-ai-adapter
```

With a config file:

```bash
docker run -p 8082:8082 \
  -v ./config.json:/app/config.json \
  -e CONFIG_FILE=/app/config.json \
  xdsoft/jodit-ai-adapter
```

## Programmatic Configuration

When using the package as a library in your own app:

```typescript
import { start } from 'jodit-ai-adapter';

await start({
  port: 8082,
  config: {
    providers: {
      openai: {
        type: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        defaultModel: 'gpt-5.2'
      }
    },
    rateLimit: {
      enabled: true,
      type: 'memory',
      maxRequests: 100,
      windowMs: 60000
    }
  }
});
```

See [Rate Limiting](rate-limiting.md) for advanced rate limiting options (Redis, per-user limits, etc.).
