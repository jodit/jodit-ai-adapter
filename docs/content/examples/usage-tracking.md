# Usage Tracking Examples

This document provides examples of implementing usage tracking for the Jodit AI Adapter service.

## Basic Usage Tracking

```typescript
import { start, type UsageStats } from 'jodit-ai-adapter';

const { cleanup } = await start({
  port: 8082,
  onUsage: async (stats: UsageStats) => {
    console.log('AI Usage:', {
      user: stats.userId,
      provider: stats.provider,
      model: stats.model,
      tokens: stats.totalTokens,
      duration: stats.duration + 'ms'
    });
  }
});

// Call cleanup() to gracefully shut down
```

## Database Integration

### PostgreSQL Example

```typescript
import { Pool } from 'pg';
import { start } from 'jodit-ai-adapter';

const pool = new Pool({
  host: 'localhost',
  database: 'myapp',
  user: 'user',
  password: 'password'
});

await start({
  port: 8082,
  checkAuthentication: async (apiKey) => {
    const result = await pool.query(
      'SELECT id FROM users WHERE api_key = $1 AND active = true',
      [apiKey]
    );
    return result.rows[0]?.id || null;
  },
  onUsage: async (stats) => {
    await pool.query(
      `INSERT INTO ai_usage
       (user_id, provider, model, response_id,
        prompt_tokens, completion_tokens, total_tokens,
        credits, usd_cost,
        duration, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        stats.userId,
        stats.provider,
        stats.model,
        stats.responseId,
        stats.promptTokens || 0,
        stats.completionTokens || 0,
        stats.totalTokens || 0,
        stats.credits.credits,
        stats.credits.usdCost,
        stats.duration,
        new Date(stats.timestamp),
        JSON.stringify(stats.metadata)
      ]
    );
  }
});
```

### MongoDB Example

```typescript
import { MongoClient } from 'mongodb';
import { start } from 'jodit-ai-adapter';

const client = new MongoClient('mongodb://localhost:27017');
await client.connect();
const db = client.db('myapp');

await start({
  port: 8082,
  checkAuthentication: async (apiKey) => {
    const user = await db.collection('users').findOne({
      apiKey,
      active: true
    });
    return user?._id.toString() || null;
  },
  onUsage: async (stats) => {
    await db.collection('ai_usage').insertOne({
      userId: stats.userId,
      provider: stats.provider,
      model: stats.model,
      responseId: stats.responseId,
      tokens: {
        prompt: stats.promptTokens,
        completion: stats.completionTokens,
        total: stats.totalTokens
      },
      credits: stats.credits.credits,
      usdCost: stats.credits.usdCost,
      duration: stats.duration,
      timestamp: new Date(stats.timestamp),
      metadata: stats.metadata
    });
  }
});
```

## Credits (Built-in Cost Calculation)

Every `onUsage` callback receives a `credits` field with a pre-calculated cost breakdown.
No need to maintain your own pricing tables — the adapter does it automatically.

See [Credits](../credits.md) for the full reference.

```typescript
import { start } from 'jodit-ai-adapter';

await start({
  port: 8082,
  onUsage: async (stats) => {
    const { credits } = stats;

    await db.query(
      `INSERT INTO ai_usage (user_id, model, tokens, credits, usd_cost, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        stats.userId,
        stats.model,
        stats.totalTokens,
        credits.credits,
        credits.usdCost,
        new Date(stats.timestamp)
      ]
    );

    console.log(`Cost: ${credits.credits} credits ($${credits.usdCost.toFixed(6)}) for ${stats.totalTokens} tokens`);
  }
});
```

## Rate Limiting Based on Usage

```typescript
import { start } from 'jodit-ai-adapter';
import Redis from 'ioredis';

const redis = new Redis();

// Limits: max tokens per day
const DAILY_TOKEN_LIMIT = 100_000;

await start({
  port: 8082,
  checkAuthentication: async (apiKey) => {
    const user = await db.users.findByApiKey(apiKey);
    if (!user) return null;

    // Check daily usage
    const today = new Date().toISOString().split('T')[0];
    const usageKey = `usage:${user.id}:${today}`;
    const todayUsage = await redis.get(usageKey);

    if (todayUsage && parseInt(todayUsage) >= DAILY_TOKEN_LIMIT) {
      throw new Error('Daily token limit exceeded');
    }

    return user.id;
  },
  onUsage: async (stats) => {
    // Track daily usage in Redis
    const today = new Date().toISOString().split('T')[0];
    const usageKey = `usage:${stats.userId}:${today}`;

    await redis.incrby(usageKey, stats.totalTokens || 0);
    await redis.expire(usageKey, 86400 * 2); // 2 days TTL

    // Also save to database
    await db.usage.create({
      userId: stats.userId,
      tokens: stats.totalTokens,
      timestamp: new Date(stats.timestamp)
    });
  }
});
```

## Billing Integration

```typescript
import { start } from 'jodit-ai-adapter';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

await start({
  port: 8082,
  onUsage: async (stats) => {
    const { credits } = stats;

    if (credits.credits > 0) {
      const user = await db.users.findById(stats.userId);

      if (user.stripeCustomerId) {
        // Report credits as metered usage
        await stripe.subscriptionItems.createUsageRecord(
          user.stripeSubscriptionItemId,
          {
            quantity: credits.credits,
            timestamp: Math.floor(stats.timestamp / 1000)
          }
        );
      }
    }

    await db.usage.create({
      userId: stats.userId,
      credits: credits.credits,
      usdCost: credits.usdCost,
      tokens: stats.totalTokens,
      timestamp: new Date(stats.timestamp)
    });
  }
});
```

## Analytics and Reporting

```typescript
import { start } from 'jodit-ai-adapter';

await start({
  port: 8082,
  onUsage: async (stats) => {
    // Send to analytics service
    await analytics.track({
      userId: stats.userId,
      event: 'AI_Request_Completed',
      properties: {
        provider: stats.provider,
        model: stats.model,
        tokens: stats.totalTokens,
        duration: stats.duration
      },
      timestamp: new Date(stats.timestamp)
    });

    // Update real-time metrics (e.g., Prometheus)
    metrics.aiRequests.inc({
      provider: stats.provider,
      model: stats.model,
      user: stats.userId
    });

    metrics.aiTokens.inc({
      provider: stats.provider,
      model: stats.model
    }, stats.totalTokens || 0);

    metrics.aiDuration.observe({
      provider: stats.provider,
      model: stats.model
    }, stats.duration / 1000); // Convert to seconds
  }
});
```

## Logging Usage

```typescript
import { start } from 'jodit-ai-adapter';
import winston from 'winston';

const usageLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({
      filename: 'logs/ai-usage.log'
    })
  ]
});

await start({
  port: 8082,
  onUsage: async (stats) => {
    usageLogger.info('AI Usage', {
      userId: stats.userId,
      provider: stats.provider,
      model: stats.model,
      tokens: {
        prompt: stats.promptTokens,
        completion: stats.completionTokens,
        total: stats.totalTokens
      },
      duration: stats.duration,
      timestamp: stats.timestamp
    });
  }
});
```

## Error Handling in Usage Callback

```typescript
import { start } from 'jodit-ai-adapter';

await start({
  port: 8082,
  onUsage: async (stats) => {
    try {
      await db.usage.create(stats);
    } catch (error) {
      // Log error but don't fail the request
      console.error('Failed to track usage:', error);

      // Optionally: queue for retry
      await queue.add('usage-tracking', stats, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });
    }
  }
});
```

## Multi-Tenant Usage Tracking

```typescript
import { start } from 'jodit-ai-adapter';

await start({
  port: 8082,
  checkAuthentication: async (apiKey) => {
    const apiKeyRecord = await db.apiKeys.findOne({
      key: apiKey,
      active: true
    });

    if (!apiKeyRecord) return null;

    // Return composite ID: organizationId:userId
    return `${apiKeyRecord.organizationId}:${apiKeyRecord.userId}`;
  },
  onUsage: async (stats) => {
    const [organizationId, userId] = stats.userId.split(':');

    // Track at organization level
    await db.orgUsage.increment({
      organizationId,
      tokens: stats.totalTokens
    });

    // Track at user level
    await db.userUsage.create({
      organizationId,
      userId,
      provider: stats.provider,
      model: stats.model,
      tokens: stats.totalTokens,
      timestamp: new Date(stats.timestamp)
    });
  }
});
```

## Schema Example (PostgreSQL)

```sql
CREATE TABLE ai_usage (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  response_id VARCHAR(255) NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  credits INTEGER NOT NULL DEFAULT 0,
  usd_cost DECIMAL(12, 8) NOT NULL DEFAULT 0,
  duration INTEGER,
  timestamp TIMESTAMP NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_timestamp ON ai_usage (user_id, timestamp);
CREATE INDEX idx_provider_model ON ai_usage (provider, model);

-- Query daily usage and cost by user
SELECT
  user_id,
  DATE(timestamp) as date,
  SUM(total_tokens) as total_tokens,
  SUM(credits) as total_credits,
  SUM(usd_cost) as total_usd_cost,
  COUNT(*) as request_count
FROM ai_usage
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY user_id, DATE(timestamp)
ORDER BY date DESC;
```
