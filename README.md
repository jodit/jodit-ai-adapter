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

## Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Jodit     │ HTTPS   │  Adapter Service │  HTTPS  │  AI Provider│
│  AI Plugin  ├────────►│   (This repo)    ├────────►│  (OpenAI)   │
└─────────────┘         └──────────────────┘         └─────────────┘
     Client                    Server                     External
```

## Installation

### Using npm

```bash
npm install jodit-ai-adapter
```

### Using Docker

```bash
docker build -t jodit-ai-adapter .
docker run -p 8082:8082 --env-file .env jodit-ai-adapter
```

## Quick Start

### 1. Setup Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
PORT=8082
NODE_ENV=development

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_DEFAULT_MODEL=gpt-4o

# CORS (use specific origins in production)
CORS_ORIGIN=*
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

The service will be available at `http://localhost:8082`

### 4. Build for Production

```bash
npm run build
npm start
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8082` |
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging level | `debug` (dev), `info` (prod) |
| `CORS_ORIGIN` | CORS allowed origins | `*` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `OPENAI_DEFAULT_MODEL` | Default OpenAI model | `gpt-5.1` |
| `HTTP_PROXY` | HTTP/SOCKS5 proxy URL | - |
| `RATE_LIMIT_ENABLED` | Enable rate limiting | `false` |
| `RATE_LIMIT_TYPE` | Rate limiter type (`memory` or `redis`) | `memory` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `RATE_LIMIT_WINDOW_MS` | Time window in ms | `60000` |
| `REDIS_URL` | Redis connection URL | - |
| `REDIS_PASSWORD` | Redis password | - |
| `REDIS_DB` | Redis database number | `0` |
| `CONFIG_FILE` | Path to JSON config file | - |

### Configuration File

You can use a JSON configuration file instead of environment variables:

```json
{
  "port": 8082,
  "debug": true,
  "requestTimeout": 120000,
  "maxRetries": 3,
  "corsOrigin": "*",
  "requireReferer": false,
  "providers": {
    "openai": {
      "type": "openai",
      "defaultModel": "gpt-4o",
      "apiKey": "sk-..."
    }
  }
}
```

Load it with:

```bash
CONFIG_FILE=./config.json npm start
```

## API Endpoints

### Health Check

```http
GET /health
```

Returns service status and available providers.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-22T10:30:00.000Z",
  "providers": ["openai"]
}
```

### AI Request (Streaming)

```http
POST /ai/request
Content-Type: application/json
Authorization: Bearer YOUR-API-KEY-32-CHARS
```

**Request Body:**
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
    ],
    "tools": [],
    "conversationOptions": {
      "model": "gpt-4o",
      "temperature": 0.7
    },
    "instructions": "You are a helpful assistant."
  }
}
```

**Streaming Response (SSE):**
```
event: created
data: {"type":"created","response":{"responseId":"resp_123","content":"","finished":false}}

event: text-delta
data: {"type":"text-delta","delta":"Hello"}

event: text-delta
data: {"type":"text-delta","delta":"!"}

event: completed
data: {"type":"completed","response":{"responseId":"resp_123","content":"Hello!","finished":true}}
```

### Provider Info

```http
GET /ai/providers
Authorization: Bearer YOUR-API-KEY-32-CHARS
```

Returns configured providers and their settings.

## Authentication

The service validates:

1. **API Key Format**: Must be 32 characters containing A-F, 0-9, and hyphens
2. **API Key Header**: Sent via `Authorization: Bearer <key>` or `x-api-key: <key>`
3. **Custom Validation**: Optional `checkAuthentication` callback

### Custom Authentication

```typescript
import { start } from 'jodit-ai-adapter';

await start({
  port: 8082,
  checkAuthentication: async (apiKey, referer, request) => {
    // Validate API key against your database
    const user = await db.users.findByApiKey(apiKey);

    if (!user || !user.active) {
      return null; // Reject
    }

    return user.id; // Accept and return user ID
  }
});
```

### Usage Tracking

Track AI usage (tokens, costs) with a callback:

```typescript
import { start } from 'jodit-ai-adapter';

await start({
  port: 8082,
  checkAuthentication: async (apiKey, referer) => {
    const user = await db.users.findByApiKey(apiKey);
    return user?.id || null;
  },
  onUsage: async (stats) => {
    // Save usage statistics to database
    await db.usage.create({
      userId: stats.userId,
      provider: stats.provider,
      model: stats.model,
      conversationId: stats.conversationId,
      promptTokens: stats.promptTokens,
      completionTokens: stats.completionTokens,
      totalTokens: stats.totalTokens,
      duration: stats.duration,
      timestamp: new Date(stats.timestamp)
    });

    // Update user's token balance
    if (stats.totalTokens) {
      await db.users.decrementTokens(stats.userId, stats.totalTokens);
    }

    console.log(`User ${stats.userId} used ${stats.totalTokens} tokens`);
  }
});
```

**Usage Stats Interface:**
```typescript
interface UsageStats {
  userId: string;              // User ID from authentication
  apiKey: string;              // API key used
  provider: string;            // AI provider (openai, deepseek, etc.)
  model: string;               // Model used (gpt-4o, etc.)
  conversationId: string;      // Conversation ID
  responseId: string;          // Response ID
  promptTokens?: number;       // Input tokens
  completionTokens?: number;   // Output tokens
  totalTokens?: number;        // Total tokens
  timestamp: number;           // Request timestamp (ms)
  duration: number;            // Request duration (ms)
  metadata?: Record<string, unknown>; // Additional data
}
```

## Rate Limiting

The service includes built-in rate limiting to prevent abuse and manage resource usage. Rate limiting can be configured to use either in-memory storage (for single-instance deployments) or Redis (for distributed/multi-instance deployments).

### Configuration

#### In-Memory Rate Limiting (Single Instance)

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_TYPE=memory
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

This configuration allows 100 requests per minute per user/IP address.

#### Redis Rate Limiting (Distributed)

For production deployments with multiple instances, use Redis:

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_TYPE=redis
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-password
REDIS_DB=0
```

#### Using Docker Compose with Redis

For development, use the provided Docker Compose configuration:

```bash
# Start Redis only
docker-compose -f docker-compose.dev.yml up -d

# Start Redis with monitoring UI
docker-compose -f docker-compose.dev.yml up -d
# Access Redis Commander at http://localhost:8081
```

Then configure your app to use Redis:

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_TYPE=redis
REDIS_URL=redis://localhost:6379
```

### Programmatic Configuration

```typescript
import { start } from 'jodit-ai-adapter';

await start({
  port: 8082,
  rateLimit: {
    enabled: true,
    type: 'redis',
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    redisUrl: 'redis://localhost:6379',
    keyPrefix: 'rl:'
  },
  providers: {
    openai: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY
    }
  }
});
```

### Rate Limit Headers

When rate limiting is enabled, the following headers are included in responses:

- `X-RateLimit-Limit`: Maximum requests allowed in the window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: ISO 8601 timestamp when the rate limit resets
- `Retry-After`: Seconds to wait before retrying (only when limit exceeded)

### Rate Limit Response

When rate limit is exceeded, the service returns a `429 Too Many Requests` error:

```json
{
  "success": false,
  "error": {
    "code": 429,
    "message": "Too many requests, please try again later",
    "details": {
      "limit": 100,
      "current": 101,
      "resetTime": 45000
    }
  }
}
```

### Key Extraction

By default, rate limiting uses:
1. **User ID** (if authenticated via `checkAuthentication` callback)
2. **IP Address** (fallback if no user ID)

This means authenticated users are tracked by their user ID, while anonymous requests are tracked by IP address.

### Custom Rate Limiting

You can implement custom rate limiting logic:

```typescript
import { start, MemoryRateLimiter } from 'jodit-ai-adapter';

// Create custom rate limiter with skip function
const rateLimiter = new MemoryRateLimiter({
  maxRequests: 100,
  windowMs: 60000,
  skip: (key) => {
    // Skip rate limiting for admin users
    return key.startsWith('user:admin-');
  }
});

await start({
  port: 8082,
  // ... other config
});
```

## Client Integration (Jodit)

### Basic Setup

```javascript
import { Jodit } from 'jodit-pro';

const editor = Jodit.make('#editor', {
  aiAssistantPro: {
    apiRequest: async (context, signal) => {
      const response = await fetch('http://localhost:8082/ai/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer YOUR-API-KEY-32-CHARS'
        },
        body: JSON.stringify({
          provider: 'openai',
          context
        }),
        signal
      });

      // Handle streaming
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // ... streaming logic (see full example in docs)
    }
  }
});
```

### With Streaming Support

See `docs/client-integration.md` for complete examples.

## Development

### Project Structure

```
jodit-ai-adapter/
├── src/
│   ├── adapters/          # AI provider adapters
│   │   ├── base-adapter.ts
│   │   ├── openai-adapter.ts
│   │   └── adapter-factory.ts
│   ├── middlewares/       # Express middlewares
│   │   ├── auth.ts
│   │   └── cors.ts
│   ├── types/            # TypeScript types
│   │   ├── jodit-ai.ts
│   │   ├── config.ts
│   │   └── index.ts
│   ├── helpers/          # Utility functions
│   │   └── logger.ts
│   ├── config/           # Configuration
│   │   └── default-config.ts
│   ├── app.ts            # Express app setup
│   ├── index.ts          # Main entry point
│   └── run.ts            # CLI runner
├── docs/                 # Documentation
├── tests/                # Test files
├── Dockerfile
├── package.json
└── tsconfig.json
```

### Available Scripts

```bash
npm run dev              # Start development server with hot reload
npm run build            # Build for production
npm start                # Start production server
npm test                 # Run tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage
npm run lint             # Lint code
npm run lint:fix         # Lint and fix code
npm run format           # Format code with Prettier
npm run docker:build     # Build Docker image
npm run docker:run       # Run Docker container
```

### Adding a New Provider

1. Create adapter class extending `BaseAdapter`:

```typescript
// src/adapters/deepseek-adapter.ts
import { BaseAdapter } from './base-adapter';

export class DeepSeekAdapter extends BaseAdapter {
  protected async processRequest(context, signal) {
    // Implementation using Vercel AI SDK
  }
}
```

2. Register in factory:

```typescript
// src/adapters/adapter-factory.ts
AdapterFactory.adapters.set('deepseek', DeepSeekAdapter);
```

3. Add configuration:

```typescript
// src/config/default-config.ts
providers: {
  deepseek: {
    type: 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY,
    defaultModel: 'deepseek-chat'
  }
}
```

## Testing

### Run Tests

```bash
npm test
```

### Example Test with nock

```typescript
import nock from 'nock';
import { OpenAIAdapter } from '../adapters/openai-adapter';

describe('OpenAIAdapter', () => {
  it('should handle streaming response', async () => {
    // Mock OpenAI API
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, {
        // Mock response
      });

    const adapter = new OpenAIAdapter({
      apiKey: 'test-key'
    });

    // Test adapter
    const result = await adapter.handleRequest(context, signal);
    expect(result.mode).toBe('stream');
  });
});
```

## Security Best Practices

1. **Never expose API keys in client-side code**
2. **Use HTTPS in production**
3. **Configure CORS properly** - Don't use `*` in production
4. **Implement rate limiting** (e.g., using express-rate-limit)
5. **Validate referer headers** when `requireReferer: true`
6. **Use environment variables** for sensitive data
7. **Implement custom authentication** for production use

## Deployment

### Docker

```bash
# Build
docker build -t jodit-ai-adapter .

# Run
docker run -d \
  -p 8082:8082 \
  -e OPENAI_API_KEY=sk-... \
  --name jodit-ai-adapter \
  jodit-ai-adapter
```

### Docker Compose

```yaml
version: '3.8'
services:
  jodit-ai-adapter:
    build: .
    ports:
      - "8082:8082"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - NODE_ENV=production
    restart: unless-stopped
```

## Troubleshooting

### Common Issues

**API Key Invalid Format**
- Ensure your API key is exactly 32 characters
- Must contain only A-F, 0-9, and hyphens

**CORS Errors**
- Check `CORS_ORIGIN` configuration
- Ensure client origin is allowed

**Streaming Not Working**
- Check that client properly handles SSE
- Verify `Content-Type: text/event-stream` header

**Provider Not Found**
- Ensure provider is configured in `providers` object
- Check provider name matches exactly (case-sensitive)

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

Chupurnov Valeriy <chupurnov@gmail.com>

## Links

- [Jodit Editor](https://xdsoft.net/jodit/)
- [Vercel AI SDK](https://ai-sdk.dev/)
- [Documentation](https://github.com/jodit/jodit-ai-adapter/docs)
- [Issues](https://github.com/jodit/jodit-ai-adapter/issues)
