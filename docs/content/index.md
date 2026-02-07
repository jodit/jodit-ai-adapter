# Jodit AI Adapter Service

[![CI](https://github.com/jodit/jodit-ai-adapter/workflows/Jodit%20AI%20Adapter%20CI%2FCD/badge.svg)](https://github.com/jodit/jodit-ai-adapter/actions)
[![npm version](https://badge.fury.io/js/jodit-ai-adapter.svg)](https://www.npmjs.com/package/jodit-ai-adapter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/docker/v/xdsoft/jodit-ai-adapter?label=docker)](https://hub.docker.com/r/xdsoft/jodit-ai-adapter)

Universal AI adapter service for [Jodit Editor AI Assistant Pro](https://xdsoft.net/jodit/) using [Vercel AI SDK](https://ai-sdk.dev/).

This service provides a secure, server-side proxy for AI providers (OpenAI, DeepSeek, Claude, etc.) that can be used with Jodit Editor's AI Assistant Pro plugin. It handles API key management, authentication, and request routing to various AI providers.

## Features

- 🔒 **Secure API Key Management** - API keys stored server-side, not exposed to clients
- 🔑 **Authentication** - Validates API keys (32 characters, A-F0-9-) and referer headers
- 🌐 **Multi-Provider Support** - OpenAI, DeepSeek, Anthropic, Google (extensible)
- 📡 **Streaming Support** - Real-time streaming responses using Server-Sent Events (SSE)
- 🛠️ **Tool Calling** - Full support for function/tool calling
- 🚦 **Rate Limiting** - Configurable rate limiting with in-memory or Redis backend
- 🔄 **Distributed Support** - Redis-based rate limiting for multi-instance deployments
- 🚀 **Production Ready** - Docker support, TypeScript, comprehensive error handling
- 📊 **Logging** - Winston-based logging with different levels
- 🧪 **Testing** - Jest with comprehensive test coverage

## Quick Start

### Installation

```bash
npm install jodit-ai-adapter
```

### Basic Usage

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

### Docker

```bash
docker build -t jodit-ai-adapter .
docker run -p 8082:8082 --env-file .env jodit-ai-adapter
```

## Documentation

- [Architecture](ARCHITECTURE.md) - System architecture and design
- [Rate Limiting](rate-limiting.md) - Rate limiting configuration
- [Client Integration](examples/client-integration.md) - Jodit Editor integration examples
- [Usage Tracking](examples/usage-tracking.md) - Track AI usage and costs

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8082` |
| `NODE_ENV` | Environment mode | `development` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `OPENAI_DEFAULT_MODEL` | Default OpenAI model | `gpt-5.2` |
| `RATE_LIMIT_ENABLED` | Enable rate limiting | `false` |
| `RATE_LIMIT_TYPE` | Rate limiter type (`memory` or `redis`) | `memory` |
| `REDIS_URL` | Redis connection URL | - |

### Configuration File

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

## API Endpoints

### Health Check

```http
GET /health
```

Returns service status and available providers.

### AI Request (Streaming)

```http
POST /ai/request
Content-Type: application/json
Authorization: Bearer YOUR-API-KEY-32-CHARS
```

**Request:**
```json
{
  "provider": "openai",
  "context": {
    "mode": "full",
    "conversationId": "conv_123",
    "messages": [
      {
        "id": "msg_1",
        "role": "user",
        "content": "Hello!",
        "timestamp": 1234567890
      }
    ]
  }
}
```

**Response (SSE):**
```
event: created
data: {"type":"created","response":{"responseId":"resp_123"}}

event: text-delta
data: {"type":"text-delta","delta":"Hello"}

event: completed
data: {"type":"completed","response":{"finished":true}}
```

## License

MIT License - see [LICENSE](../LICENSE) for details.

## Links

- [GitHub Repository](https://github.com/jodit/jodit-ai-adapter)
- [npm Package](https://www.npmjs.com/package/jodit-ai-adapter)
- [Jodit Editor](https://xdsoft.net/jodit/)
- [Vercel AI SDK](https://ai-sdk.dev/)
