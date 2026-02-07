# Architecture Overview

This document describes the architecture and design decisions of the Jodit AI Adapter service.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Side                              │
│  ┌────────────────┐                                             │
│  │ Jodit Editor   │                                             │
│  │ AI Plugin      │                                             │
│  └───────┬────────┘                                             │
│          │ HTTPS (API Key in header)                            │
└──────────┼──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Adapter Service                             │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐       │
│  │ CORS         │→ │ Auth         │→ │ Request        │       │
│  │ Middleware   │  │ Middleware   │  │ Handler        │       │
│  └──────────────┘  └──────────────┘  └───────┬────────┘       │
│                                               │                 │
│                                               ▼                 │
│                                    ┌─────────────────────┐     │
│                                    │ Adapter Factory     │     │
│                                    └──────────┬──────────┘     │
│                                               │                 │
│                ┌──────────────────────────────┼──────────┐     │
│                │                              │          │     │
│                ▼                              ▼          ▼     │
│       ┌────────────────┐           ┌──────────────┐  ┌───┐   │
│       │ OpenAI Adapter │           │ DeepSeek     │  │...│   │
│       │ (Vercel AI SDK)│           │ Adapter      │  └───┘   │
│       └───────┬────────┘           └──────────────┘           │
│               │                                                │
└───────────────┼────────────────────────────────────────────────┘
                │ HTTPS
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External AI Providers                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│   │ OpenAI   │  │ DeepSeek │  │ Anthropic│  │ Google   │      │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Middlewares

#### CORS Middleware (`src/middlewares/cors.ts`)
- Handles Cross-Origin Resource Sharing
- Configurable allowed origins
- Supports wildcards, specific domains, and RegExp patterns

#### Auth Middleware (`src/middlewares/auth.ts`)
- Validates API key format (36 chars, UUID format: A-F0-9-)
- Extracts API key from `Authorization` or `x-api-key` header
- Validates referer if required
- Calls custom authentication callback
- Stores user ID in request object

### 2. Adapters

#### Base Adapter (`src/adapters/base-adapter.ts`)
Abstract base class providing:
- Common error handling
- Response validation
- Helper methods for tool conversion
- Streaming support utilities

#### OpenAI Adapter (`src/adapters/openai-adapter.ts`)
Implements OpenAI integration:
- Uses Vercel AI SDK `@ai-sdk/openai`
- Supports streaming and non-streaming responses
- Handles tool calling
- Message format conversion (Jodit ↔ OpenAI)

#### Adapter Factory (`src/adapters/adapter-factory.ts`)
- Registry pattern for adapters
- Creates adapter instances based on provider type
- Manages API key priority (user key > config key)

### 3. Routes (`src/routes/<name>/`)

Each route is organized as a module with its own directory:
- `handler.ts` - Request handler logic
- `index.ts` - Router factory function
- `schema.ts` - Zod validation schemas
- `handler.test.ts` - Route-specific tests

Available routes:
- `ai-request/` - `POST /ai/request` - AI text generation (streaming SSE)
- `ai-providers/` - `GET /ai/providers` - List configured providers
- `image-generate/` - `POST /ai/image/generate` - Image generation
- `health/` - `GET /ai/health` - Health check

### 4. Rate Limiter (`src/rate-limiter/`)

Built-in rate limiting with pluggable backends:
- `memory-rate-limiter.ts` - In-memory rate limiting for single-instance deployments
- `redis-rate-limiter.ts` - Redis-based rate limiting for distributed deployments
- `rate-limiter-factory.ts` - Creates rate limiter based on configuration

### 5. Type System

#### Jodit AI Types (`src/types/jodit-ai.ts`)
Defines interfaces matching Jodit AI Assistant Pro contract:
- `IAIRequestContext` - Request from Jodit
- `IAIAssistantResult` - Response to Jodit (streaming or final)
- `IAIMessage` - Conversation message
- `IToolCall` - Tool/function call
- `AIStreamEvent` - Streaming event types

#### Config Types (`src/types/config.ts`)
- `AppConfig` - Application configuration
- `ProviderConfig` - Provider-specific settings
- `AuthCallback` - Authentication callback signature

### 6. Application

#### Express App (`src/app.ts`)
Main application setup:
- Middleware chain configuration
- Route handlers (`/ai/health`, `/ai/request`, `/ai/providers`, `/ai/image/generate`)
- Request validation using Zod
- Error handling
- Streaming response handling (SSE)

#### Entry Points
- `src/index.ts` - Library entry point with `start()` and `stop()`
- `src/run.ts` - CLI entry point for standalone server

## Request Flow

### 1. Client Request

```
POST /ai/request
Headers:
  Authorization: Bearer 12345678-1234-1234-1234-123456789abc
  Content-Type: application/json
Body:
  {
    provider: "openai",
    context: {
      mode: "full",
      messages: [...],
      tools: [...],
      conversationOptions: { model: "gpt-5.2" }
    }
  }
```

### 2. Middleware Chain

1. **CORS Middleware**: Validates origin, sets headers
2. **Auth Middleware**:
   - Extracts API key
   - Validates format
   - Checks referer (optional)
   - Calls custom auth callback (optional)
   - Sets `req.apiKey` and `req.userId`

### 3. Request Handler

1. Validate request body with Zod schema
2. Check provider is supported and configured
3. Create adapter instance via factory
4. Create AbortController for timeout
5. Call `adapter.handleRequest(context, signal)`

### 4. Adapter Processing

#### OpenAI Adapter Flow:

1. **Build Messages**:
   - Add system instructions
   - Convert Jodit messages to OpenAI format
   - Append selection contexts

2. **Build Tools**:
   - Convert Jodit tool definitions to OpenAI schema
   - Build JSON Schema for parameters

3. **Call Vercel AI SDK**:
   - Use `streamText()` for streaming
   - Use `generateText()` for non-streaming

4. **Transform Response**:
   - Convert OpenAI format back to Jodit format
   - Extract tool calls
   - Handle artifacts (images, etc.)

### 5. Response Streaming

For streaming responses:

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: created
data: {"type":"created","response":{"responseId":"...","content":"","finished":false}}

event: text-delta
data: {"type":"text-delta","delta":"Hello"}

event: text-delta
data: {"type":"text-delta","delta":" there"}

event: completed
data: {"type":"completed","response":{"responseId":"...","content":"Hello there","finished":true}}
```

### 6. Error Handling

Errors are caught at multiple levels:

1. **Adapter Level**: Catches provider API errors
2. **Request Handler Level**: Catches validation errors
3. **Express Error Handler**: Catches unhandled errors

All errors converted to Boom errors with appropriate HTTP status codes.

## Security Architecture

### 1. API Key Management

```
Client                  Adapter Service          AI Provider
  │                            │                      │
  │ Request + API Key          │                      │
  ├───────────────────────────►│                      │
  │                            │ Validate Key         │
  │                            │ (36 chars, UUID)     │
  │                            │                      │
  │                            │ Custom Auth          │
  │                            │ (Optional)           │
  │                            │                      │
  │                            │ Provider Request     │
  │                            │ (Provider API Key)   │
  │                            ├─────────────────────►│
  │                            │                      │
  │                            │◄─────────────────────┤
  │◄───────────────────────────┤                      │
```

**Key Points**:
- Client API key ≠ Provider API key
- Provider keys stored server-side only
- Client key validates user access
- Custom callback can check database

### 2. Authentication Flow

```typescript
1. Extract API key from request header
   ↓
2. Validate format (regex)
   ↓
3. Check referer (if configured)
   ↓
4. Call custom auth callback (optional)
   ├─ Returns user ID → Allow
   └─ Returns null → Reject (401)
```

### 3. CORS Protection

Configurable CORS settings:
- Development: `*` (allow all)
- Production: Specific domains or patterns
- Supports string, array, or RegExp

## Extensibility

### Adding New Providers

The architecture supports easy addition of new providers:

1. **Create Adapter**: Extend `BaseAdapter`
2. **Register**: Add to `AdapterFactory.adapters`
3. **Configure**: Add to default config
4. **Test**: Write test suite with nock

Example:
```typescript
// 1. Create adapter
export class MyProviderAdapter extends BaseAdapter {
  protected async processRequest(context, signal) {
    // Use Vercel AI SDK or custom implementation
  }
}

// 2. Register
AdapterFactory.adapters.set('myprovider', MyProviderAdapter);

// 3. Configure
providers: {
  myprovider: {
    type: 'myprovider',
    apiKey: process.env.MYPROVIDER_API_KEY,
    defaultModel: 'model-v1'
  }
}
```

### Custom Middlewares

Add custom middleware in `src/app.ts`:

```typescript
import { rateLimitMiddleware } from './middlewares/rate-limit';

export function createApp(config: AppConfig): Express {
  const app = express();

  // ... existing middlewares
  app.use(rateLimitMiddleware(config.rateLimit));

  // ... routes
}
```

## Performance Considerations

### 1. Streaming

- Reduces time to first token
- Better user experience
- Lower memory usage
- Supports Server-Sent Events (SSE)

### 2. Connection Pooling

- HTTP keep-alive enabled
- Reuses connections to AI providers
- Reduces latency

### 3. Timeout Management

- Request timeout (default: 2 minutes)
- Configurable per request
- Graceful abort handling

### 4. Error Recovery

- Automatic retry with exponential backoff (configurable)
- Graceful degradation on provider failures

## Testing Strategy

### Unit Tests
- Individual functions and classes
- Mock external dependencies with nock
- High coverage requirement

### Integration Tests
- Full request flow
- Middleware chain
- Provider integration

### Test Structure
```typescript
describe('Component', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should handle success case', () => {
    // Arrange
    // Act
    // Assert
  });

  it('should handle error case', () => {
    // Arrange
    // Act
    // Assert
  });
});
```

## Deployment Architecture

### Docker Deployment

```
┌─────────────────────────────────────────┐
│          Docker Container               │
│  ┌──────────────────────────────────┐  │
│  │   Node.js 22                     │  │
│  │   ┌──────────────────────────┐   │  │
│  │   │ Adapter Service          │   │  │
│  │   │ Port: 8082               │   │  │
│  │   └──────────────────────────┘   │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│          Load Balancer                  │
│          (nginx/traefik)                │
└─────────────────────────────────────────┘
```

### Environment Variables

Sensitive data via environment:
- API keys
- CORS origins
- Custom configuration path

### Scalability

- Stateless design (horizontal scaling)
- No session storage
- Load balancer compatible
- Health check endpoint

## Future Enhancements

### Planned Features
1. Additional providers (DeepSeek, Anthropic, Google)
2. Caching layer for responses
3. WebSocket support as alternative to SSE
4. Admin dashboard
5. Multi-tenancy support

### Performance Optimizations
1. Response caching (Redis)
2. Request deduplication
3. Connection pooling improvements
4. Compression (gzip/brotli)
