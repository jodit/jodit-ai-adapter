# Client Integration Examples

This document provides examples of integrating the Jodit AI Adapter service with the Jodit Editor AI Assistant Pro plugin.

## Basic Integration

```javascript
import { Jodit } from 'jodit-pro';

const ADAPTER_URL = 'http://localhost:8082';
const API_KEY = '12345678-1234-1234-1234-123456789abc'; // Your UUID API key

const editor = Jodit.make('#editor', {
  aiAssistantPro: {
    apiRequest: createAdapterRequester(ADAPTER_URL, API_KEY, 'openai')
  }
});

/**
 * Create requester function for the adapter service
 */
function createAdapterRequester(adapterUrl, apiKey, provider) {
  return async (context, signal) => {
    try {
      const response = await fetch(`${adapterUrl}/ai/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          provider,
          context
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check if streaming response
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        return {
          mode: 'stream',
          stream: parseSSEStream(response.body)
        };
      }

      // Non-streaming response
      const data = await response.json();
      return {
        mode: 'final',
        response: data.result
      };
    } catch (error) {
      console.error('Adapter request error:', error);
      throw error;
    }
  };
}

/**
 * Parse Server-Sent Events stream
 */
async function* parseSSEStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete events
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        const eventMatch = line.match(/^event: (.+)$/m);
        const dataMatch = line.match(/^data: (.+)$/m);

        if (eventMatch && dataMatch) {
          const eventType = eventMatch[1];
          const eventData = JSON.parse(dataMatch[1]);

          // Yield the parsed event
          yield eventData;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

## Advanced Configuration

```javascript
const editor = Jodit.make('#editor', {
  aiAssistantPro: {
    apiRequest: createAdapterRequester(
      'https://your-domain.com/ai-adapter',
      '12345678-1234-1234-1234-123456789abc',
      'openai'
    ),

    // Display mode
    displayMode: 'right', // 'left', 'right', 'top', 'bottom', 'dialog'
    panelWidth: 400,

    // Model settings
    defaultModel: 'gpt-5.2',
    defaultTemperature: 0.7,
    allowEditDialogSettings: true,

    dialogSettings: {
      models: ['gpt-5.2', 'gpt-5.2-mini', 'gpt-5.2-nano'],
      temperature: {
        min: 0,
        max: 2,
        step: 0.1
      }
    },

    // API mode
    apiMode: 'incremental', // or 'full'

    // Permissions
    defaultPermissionScope: 'conversation', // 'once', 'conversation', 'forever'

    // Instructions for AI
    instructions: `You are an advanced AI assistant integrated into the Jodit editor.
      Help users improve their content while maintaining their writing style.`
  }
});
```

## With Custom Tools

```javascript
// Define custom tool
const customTool = {
  name: 'searchDocumentation',
  description: 'Search in project documentation',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Search query',
      required: true
    }
  ],
  requiresPermission: true,
  execute: async (jodit, args, signal) => {
    // Implement search logic
    const results = await fetch('/api/search', {
      method: 'POST',
      body: JSON.stringify({ query: args.query }),
      signal
    });

    return await results.json();
  }
};

const editor = Jodit.make('#editor', {
  aiAssistantPro: {
    apiRequest: createAdapterRequester(ADAPTER_URL, API_KEY, 'openai'),
    customTools: [customTool]
  }
});
```

## Error Handling

```javascript
function createAdapterRequester(adapterUrl, apiKey, provider) {
  return async (context, signal) => {
    try {
      const response = await fetch(`${adapterUrl}/ai/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ provider, context }),
        signal
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));

        return {
          mode: 'final',
          response: {
            responseId: `error_${Date.now()}`,
            content: `❌ Error: ${error.error?.message || response.statusText}`,
            finished: true,
            metadata: { error: true }
          }
        };
      }

      // Handle streaming...
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        return {
          mode: 'stream',
          stream: parseSSEStream(response.body)
        };
      }

      const data = await response.json();
      return {
        mode: 'final',
        response: data.result
      };
    } catch (error) {
      // Handle network errors, aborts, etc.
      if (error.name === 'AbortError') {
        throw error; // Let Jodit handle abort
      }

      console.error('Adapter request error:', error);

      return {
        mode: 'final',
        response: {
          responseId: `error_${Date.now()}`,
          content: `❌ Error: ${error.message}`,
          finished: true,
          metadata: { error: true }
        }
      };
    }
  };
}
```

## Environment-Specific Configuration

```javascript
// config.js
const API_CONFIG = {
  development: {
    url: 'http://localhost:8082',
    apiKey: '12345678-1234-1234-1234-123456789abc'
  },
  production: {
    url: 'https://ai-adapter.yourdomain.com',
    apiKey: process.env.JODIT_AI_API_KEY
  }
};

const config = API_CONFIG[process.env.NODE_ENV] || API_CONFIG.development;

const editor = Jodit.make('#editor', {
  aiAssistantPro: {
    apiRequest: createAdapterRequester(
      config.url,
      config.apiKey,
      'openai'
    )
  }
});
```

## Multiple Providers

```javascript
// Switch between providers based on user selection
let currentProvider = 'openai';

const editor = Jodit.make('#editor', {
  aiAssistantPro: {
    apiRequest: async (context, signal) => {
      return createAdapterRequester(
        ADAPTER_URL,
        API_KEY,
        currentProvider
      )(context, signal);
    }
  }
});

// UI to switch providers
document.getElementById('provider-select').addEventListener('change', (e) => {
  currentProvider = e.target.value;
});
```

## TypeScript Integration

```typescript
import { Jodit } from 'jodit-pro';
import type {
  IAIAssistantProOptions,
  IAIRequestContext,
  IAIAssistantResult
} from 'jodit-pro/plugins/ai-assistant-pro/interface';

interface AdapterConfig {
  url: string;
  apiKey: string;
  provider: string;
}

function createAdapterRequester(
  config: AdapterConfig
): IAIAssistantProOptions['apiRequest'] {
  return async (
    context: IAIRequestContext,
    signal: AbortSignal
  ): Promise<IAIAssistantResult> => {
    const response = await fetch(`${config.url}/ai/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        provider: config.provider,
        context
      }),
      signal
    });

    // ... implementation
  };
}

const editor = Jodit.make<HTMLDivElement>('#editor', {
  aiAssistantPro: {
    apiRequest: createAdapterRequester({
      url: 'http://localhost:8082',
      apiKey: '12345678-1234-1234-1234-123456789abc',
      provider: 'openai'
    })
  }
});
```

## Testing

```javascript
// Mock adapter for testing
function createMockAdapterRequester() {
  return async (context, signal) => {
    return {
      mode: 'final',
      response: {
        responseId: 'test_123',
        content: 'Mock response for testing',
        finished: true
      }
    };
  };
}

// Use in tests
describe('Jodit AI Assistant', () => {
  it('should handle AI requests', async () => {
    const editor = Jodit.make('#editor', {
      aiAssistantPro: {
        apiRequest: createMockAdapterRequester()
      }
    });

    // Test AI functionality
  });
});
```
