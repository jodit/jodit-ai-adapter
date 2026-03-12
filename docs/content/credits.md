# Credits System

Jodit AI Adapter includes a built-in credits system that automatically calculates the cost of every AI request
based on the provider's per-token pricing. Credits are a provider-agnostic unit of cost
that you can use for billing, quotas, and usage analytics.

## How It Works

Every call to `onUsage` now includes a `credits` field with a pre-calculated cost breakdown:

```typescript
interface CreditsCost {
  credits: number;          // Integer credits (1000 credits = $1 USD)
  usdCost: number;          // Exact USD cost as a floating-point number
  inputTokens: number;      // Input tokens consumed
  outputTokens: number;     // Output tokens consumed
  cachedInputTokens: number; // Tokens served from cache (cheaper rate)
}
```

### Calculation Formula

For each request the adapter resolves the model's per-token pricing and computes:

```
normalInputTokens = inputTokens - cachedInputTokens

usdCost = (normalInputTokens / 1 000 000) * inputPrice
        + (cachedInputTokens  / 1 000 000) * cachedInputPrice
        + (outputTokens       / 1 000 000) * outputPrice

credits = ceil(usdCost * 1000)
```

Cached input tokens are billed at a reduced rate (typically 10x cheaper).
The final `credits` value is always rounded **up** to the nearest integer so that even the smallest request costs at least 1 credit.

## Supported Models and Pricing

Pricing data is stored in [`src/adapters/openai/model-pricing.json`](https://github.com/jodit/jodit-ai-adapter/blob/main/src/adapters/openai/model-pricing.json) and is easy to update.

All prices are **per 1 million tokens** in USD.

- [Open AI Pricing](https://developers.openai.com/api/docs/pricing)

### GPT-5 Series

| Model | Input | Cached Input | Output |
|-------|------:|-------------:|-------:|
| gpt-5.4 | $2.50 | $0.25 | $15.00 |
| gpt-5.4-pro | $30.00 | $30.00 | $180.00 |
| gpt-5.2 | $1.75 | $0.175 | $14.00 |
| gpt-5.2-pro | $21.00 | $21.00 | $168.00 |
| gpt-5.1 | $1.25 | $0.125 | $10.00 |
| gpt-5 | $1.25 | $0.125 | $10.00 |
| gpt-5-pro | $15.00 | $15.00 | $120.00 |
| gpt-5-mini | $0.25 | $0.025 | $2.00 |
| gpt-5-nano | $0.05 | $0.005 | $0.40 |

### GPT-4 Series

| Model | Input | Cached Input | Output |
|-------|------:|-------------:|-------:|
| gpt-4.1 | $2.00 | $0.50 | $8.00 |
| gpt-4.1-mini | $0.40 | $0.10 | $1.60 |
| gpt-4.1-nano | $0.10 | $0.025 | $0.40 |
| gpt-4o | $2.50 | $1.25 | $10.00 |
| gpt-4o-mini | $0.15 | $0.075 | $0.60 |

### Reasoning Models (o-series)

| Model | Input | Cached Input | Output |
|-------|------:|-------------:|-------:|
| o1 | $15.00 | $7.50 | $60.00 |
| o1-pro | $150.00 | $150.00 | $600.00 |
| o1-mini | $1.10 | $0.55 | $4.40 |
| o3 | $2.00 | $0.50 | $8.00 |
| o3-pro | $20.00 | $20.00 | $80.00 |
| o3-mini | $1.10 | $0.55 | $4.40 |
| o4-mini | $1.10 | $0.275 | $4.40 |

### Image Models

| Model | Input | Cached Input | Output |
|-------|------:|-------------:|-------:|
| gpt-image-1.5 | $5.00 | $1.25 | $10.00 |
| chatgpt-image-latest | $5.00 | $1.25 | $10.00 |
| gpt-image-1 | $5.00 | $1.25 | $10.00 |

## Usage Example

```typescript
import { start, type UsageStats } from 'jodit-ai-adapter';

await start({
  port: 8082,
  providers: {
    openai: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
      defaultModel: 'gpt-4.1-mini'
    }
  },
  onUsage: async (stats: UsageStats) => {
    const { credits } = stats;

    console.log(`Request cost: ${credits.credits} credits ($${credits.usdCost.toFixed(6)})`);
    console.log(`Tokens: ${credits.inputTokens} in, ${credits.outputTokens} out`);

    // Save to your database
    await db.query(
      `INSERT INTO ai_usage (user_id, credits, usd_cost, model, timestamp)
       VALUES ($1, $2, $3, $4, $5)`,
      [stats.userId, credits.credits, credits.usdCost, stats.model, new Date(stats.timestamp)]
    );
  }
});
```

## Credit-Based Quotas

You can use credits to enforce per-user spending limits:

```typescript
import { start } from 'jodit-ai-adapter';

const DAILY_CREDIT_LIMIT = 5000; // $5 per day

await start({
  port: 8082,
  checkAuthentication: async (apiKey) => {
    const user = await db.users.findByApiKey(apiKey);
    if (!user) return null;

    // Check daily credit usage
    const today = new Date().toISOString().split('T')[0];
    const spent = await db.query(
      `SELECT COALESCE(SUM(credits), 0) as total
       FROM ai_usage WHERE user_id = $1 AND date = $2`,
      [user.id, today]
    );

    if (spent.rows[0].total >= DAILY_CREDIT_LIMIT) {
      throw new Error('Daily credit limit exceeded');
    }

    return user.id;
  },
  onUsage: async (stats) => {
    await db.query(
      `INSERT INTO ai_usage (user_id, credits, usd_cost, date)
       VALUES ($1, $2, $3, CURRENT_DATE)`,
      [stats.userId, stats.credits.credits, stats.credits.usdCost]
    );
  }
});
```

## Updating Pricing

Model pricing is stored in a JSON file at `src/adapters/openai/model-pricing.json`.
To add a new model or update prices, edit this file:

```json
{
  "gpt-5.2": {
    "input": 1.75,
    "cachedInput": 0.175,
    "output": 14.0
  }
}
```

Each entry specifies the price **per 1 million tokens** in USD.

If a request uses a model not listed in the pricing file, `calculateCredits` will throw an error.
Make sure all models your users can access are listed.
