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
