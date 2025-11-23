# Rate Limiting Guide

This guide explains how to configure and use rate limiting in the Jodit AI Adapter service.

## Overview

The rate limiter protects your service from abuse by limiting the number of requests a user or IP address can make within a time window. It supports two backends:

- **In-Memory**: Fast, simple, suitable for single-instance deployments
- **Redis**: Distributed, suitable for multi-instance deployments

## Quick Start

### In-Memory Rate Limiting

Perfect for development and single-instance production deployments:

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_TYPE=memory
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

This allows 100 requests per minute per user/IP.

### Redis Rate Limiting

For production deployments with multiple instances:

1. Start Redis (using Docker Compose):

```bash
docker-compose -f docker-compose.dev.yml up -d
```

2. Configure environment variables:

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_TYPE=redis
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-password  # optional
REDIS_DB=0                     # optional
```

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `RATE_LIMIT_ENABLED` | Enable/disable rate limiting | `false` |
| `RATE_LIMIT_TYPE` | Type: `memory` or `redis` | `memory` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `RATE_LIMIT_WINDOW_MS` | Time window in milliseconds | `60000` (1 minute) |
| `REDIS_URL` | Redis connection URL | - |
| `REDIS_PASSWORD` | Redis password | - |
| `REDIS_DB` | Redis database number | `0` |
| `RATE_LIMIT_KEY_PREFIX` | Key prefix in storage | `rl:` |

## Programmatic Usage

```typescript
import { start } from 'jodit-ai-adapter';

await start({
  port: 8082,
  rateLimit: {
    enabled: true,
    type: 'redis',
    maxRequests: 100,
    windowMs: 60000,
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

## How It Works

### Key Extraction

By default, rate limiting uses:
1. **User ID** (if authenticated via `checkAuthentication` callback)
2. **IP Address** (fallback if no user ID)

This means:
- Authenticated users are tracked by their user ID across all IP addresses
- Anonymous requests are tracked by IP address

### Response Headers

When rate limiting is enabled, responses include:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2025-01-22T10:35:00.000Z
```

When rate limit is exceeded:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
```

### Response Format

When rate limited, the API returns:

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

## Advanced Configuration

### Custom Key Extraction

You can customize how users/IPs are tracked:

```typescript
import { createRateLimitMiddleware, MemoryRateLimiter } from 'jodit-ai-adapter';

const rateLimiter = new MemoryRateLimiter({
  maxRequests: 100,
  windowMs: 60000
});

const middleware = createRateLimitMiddleware(rateLimiter, {
  keyExtractor: (req) => {
    // Use API key from header
    return req.headers['x-api-key'] as string;
  }
});
```

### Skip Certain Requests

Skip rate limiting for specific users or paths:

```typescript
const rateLimiter = new MemoryRateLimiter({
  maxRequests: 100,
  windowMs: 60000,
  skip: (key) => {
    // Skip rate limiting for admin users
    return key.startsWith('user:admin-');
  }
});
```

Or in middleware:

```typescript
const middleware = createRateLimitMiddleware(rateLimiter, {
  skip: (req) => {
    // Skip health check endpoint
    return req.path === '/health';
  }
});
```

### Custom Error Messages

```typescript
const middleware = createRateLimitMiddleware(rateLimiter, {
  message: 'Slow down there, partner! Try again in a minute.'
});
```

### On Limit Reached Callback

Track when users hit the rate limit:

```typescript
const middleware = createRateLimitMiddleware(rateLimiter, {
  onLimitReached: async (req, key) => {
    console.log(`Rate limit exceeded for ${key}`);
    // Log to monitoring service
    await monitoring.trackRateLimitExceeded(key);
  }
});
```

## Docker Deployment

### Development

```bash
# Start Redis with monitoring UI
docker-compose -f docker-compose.dev.yml up -d

# Access Redis Commander at http://localhost:8081
```

### Production

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  app:
    build: .
    environment:
      - RATE_LIMIT_ENABLED=true
      - RATE_LIMIT_TYPE=redis
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
```

## Testing

Run rate limiter tests:

```bash
# In-memory tests
npm test -- src/rate-limiter/memory-rate-limiter.test.ts

# Redis tests (requires Redis running)
REDIS_URL=redis://localhost:6379 npm test -- src/rate-limiter/redis-rate-limiter.test.ts

# Middleware integration tests
npm test -- src/middlewares/rate-limit.test.ts
```

## Monitoring

### Redis Commander

When using `docker-compose.dev.yml`, you get Redis Commander UI:

```bash
docker-compose -f docker-compose.dev.yml up -d
# Open http://localhost:8081
```

### Check Rate Limit Status

```typescript
const state = await rateLimiter.getState('user:123');
console.log({
  current: state.current,      // Current request count
  remaining: state.remaining,  // Remaining requests
  allowed: state.allowed,      // Whether next request will be allowed
  resetTime: state.resetTime   // MS until reset
});
```

## Troubleshooting

### Rate limiting not working

1. Check `RATE_LIMIT_ENABLED=true` is set
2. Verify configuration is loaded correctly
3. Check logs for rate limiter initialization messages

### Redis connection errors

1. Verify Redis is running: `redis-cli ping`
2. Check `REDIS_URL` is correct
3. Check network connectivity
4. Verify password if using authentication

### Different users sharing limits

This happens when:
- No authentication is implemented (all users tracked by IP)
- Multiple users behind same proxy/NAT
- Solution: Implement `checkAuthentication` callback

### Rate limiter fails open

By design, if Redis is unavailable, requests are allowed through. This prevents Redis downtime from taking down your service. Monitor Redis health separately.

## Best Practices

1. **Start conservative**: Begin with stricter limits (e.g., 50 req/min) and adjust based on usage
2. **Monitor usage**: Track rate limit hits to tune limits appropriately
3. **Use Redis in production**: For consistency across multiple instances
4. **Set up monitoring**: Alert when rate limits are frequently hit
5. **Document limits**: Make users aware of rate limits in API documentation
6. **Provide feedback**: Use descriptive error messages and Retry-After headers
7. **Different limits for different tiers**: Consider implementing tiered rate limiting

## Examples

### Basic Setup

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

### Aggressive Limiting

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
```

### Lenient Limiting

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_WINDOW_MS=60000
```

## Performance

### In-Memory

- Very fast (~1μs per request)
- Cleanup runs every 60 seconds
- Memory usage: ~100 bytes per tracked key

### Redis

- Fast (~1ms per request)
- Automatic expiry (no cleanup needed)
- Scales horizontally
- Adds network latency

## Security Considerations

- Rate limiting is **not** a security feature by itself
- Use in combination with authentication
- Don't rely solely on IP-based limiting (can be spoofed behind proxies)
- Implement proper authentication with `checkAuthentication`
- Consider additional security measures (firewall rules, WAF, etc.)
