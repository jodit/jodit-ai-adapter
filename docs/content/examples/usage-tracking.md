# Usage Tracking Examples

This document provides examples of implementing usage tracking for the Jodit AI Adapter service.

## Basic Usage Tracking

```typescript
import { start, type UsageStats } from 'jodit-ai-adapter';

await start({
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
       (user_id, provider, model, conversation_id, response_id,
        prompt_tokens, completion_tokens, total_tokens,
        duration, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        stats.userId,
        stats.provider,
        stats.model,
        stats.conversationId,
        stats.responseId,
        stats.promptTokens || 0,
        stats.completionTokens || 0,
        stats.totalTokens || 0,
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
      conversationId: stats.conversationId,
      responseId: stats.responseId,
      tokens: {
        prompt: stats.promptTokens,
        completion: stats.completionTokens,
        total: stats.totalTokens
      },
      duration: stats.duration,
      timestamp: new Date(stats.timestamp),
      metadata: stats.metadata
    });
  }
});
```

## Cost Calculation

```typescript
import { start } from 'jodit-ai-adapter';

// Define pricing per model (per 1M tokens)
const PRICING = {
  'gpt-5.2': {
    input: 2.50,  // $2.50 per 1M input tokens
    output: 10.00  // $10.00 per 1M output tokens
  },
  'gpt-5.2-mini': {
    input: 0.15,
    output: 0.60
  }
};

function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = PRICING[model as keyof typeof PRICING];
  if (!pricing) return 0;

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

await start({
  port: 8082,
  onUsage: async (stats) => {
    const cost = calculateCost(
      stats.model,
      stats.promptTokens || 0,
      stats.completionTokens || 0
    );

    await db.query(
      `INSERT INTO ai_usage (user_id, model, tokens, cost, timestamp)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        stats.userId,
        stats.model,
        stats.totalTokens,
        cost,
        new Date(stats.timestamp)
      ]
    );

    console.log(`Cost: $${cost.toFixed(4)} for ${stats.totalTokens} tokens`);
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
    const cost = calculateCost(
      stats.model,
      stats.promptTokens || 0,
      stats.completionTokens || 0
    );

    if (cost > 0) {
      // Get user's Stripe customer ID
      const user = await db.users.findById(stats.userId);

      if (user.stripeCustomerId) {
        // Create usage record for metered billing
        await stripe.subscriptionItems.createUsageRecord(
          user.stripeSubscriptionItemId,
          {
            quantity: Math.ceil(cost * 100), // Convert to cents
            timestamp: Math.floor(stats.timestamp / 1000)
          }
        );
      }
    }

    // Save to database
    await db.usage.create({
      userId: stats.userId,
      cost,
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
        duration: stats.duration,
        conversationId: stats.conversationId
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
      conversationId: stats.conversationId,
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
  conversation_id VARCHAR(255) NOT NULL,
  response_id VARCHAR(255) NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  duration INTEGER,
  cost DECIMAL(10, 6),
  timestamp TIMESTAMP NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_timestamp (user_id, timestamp),
  INDEX idx_provider_model (provider, model),
  INDEX idx_conversation (conversation_id)
);

-- Query daily usage by user
SELECT
  user_id,
  DATE(timestamp) as date,
  SUM(total_tokens) as total_tokens,
  SUM(cost) as total_cost,
  COUNT(*) as request_count
FROM ai_usage
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY user_id, DATE(timestamp)
ORDER BY date DESC;
```
