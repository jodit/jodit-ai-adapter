# API Reference

All endpoints require the `Authorization` header unless noted otherwise.

```
Authorization: Bearer 12345678-1234-1234-1234-123456789abc
```

---

## Health Check

```http
GET /ai/health
```

Returns service status and available providers. No authentication required.

---

## AI Request (Streaming)

```http
POST /ai/request
Content-Type: application/json
```

**Request:**

```json
{
  "provider": "openai",
  "context": {
    "mode": "full",
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

---

## List Providers

```http
GET /ai/providers
```

Returns a list of configured AI providers.

---

## Autocomplete

```http
POST /ai/autocomplete?query=How+to+make+a
Content-Type: application/json
```

Returns structured autocomplete suggestions for the given query text. Uses structured output (JSON schema) — non-streaming.

**Query Parameters:**

| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| `query`   | string | Yes      | The text to autocomplete       |

**Request Body:**

```json
{
  "provider": "openai",
  "context": {
    "instructions": "You are a helpful writing assistant.",
    "conversationOptions": {
      "model": "gpt-4.1-nano",
      "temperature": 0.3
    },
    "maxSuggestions": 5
  }
}
```

| Field                              | Type   | Required | Description                         |
|------------------------------------|--------|----------|-------------------------------------|
| `provider`                         | string | Yes      | AI provider name                    |
| `context`                          | object | No       | Optional context                    |
| `context.instructions`             | string | No       | System instructions for the AI      |
| `context.conversationOptions.model`| string | No       | AI model to use                     |
| `context.conversationOptions.temperature` | number | No | Temperature (0-2)              |
| `context.maxSuggestions`           | number | No       | Max suggestions (1-10, default 5)   |

**Response:**

```json
{
  "success": true,
  "result": {
    "responseId": "resp_ac_001...",
    "suggestions": [
      "cake with chocolate frosting",
      "website from scratch",
      "good first impression",
      "budget for your project",
      "presentation that stands out"
    ],
    "metadata": {
      "model": "gpt-4.1-nano",
      "usage": {
        "inputTokens": 60,
        "outputTokens": 30,
        "totalTokens": 90
      }
    }
  }
}
```

---

## Image Generation

```http
POST /ai/image/generate
Content-Type: application/json
```

**Request:**

```json
{
  "provider": "openai",
  "request": {
    "prompt": "A white siamese cat with blue eyes",
    "model": "dall-e-3",
    "size": "1024x1024"
  }
}
```

**Response:**

```json
{
  "success": true,
  "result": {
    "images": [
      { "b64_json": "..." }
    ],
    "created": 1234567890,
    "metadata": {
      "model": "dall-e-3",
      "prompt": "A white siamese cat with blue eyes"
    }
  }
}
```
