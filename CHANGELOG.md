# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.14]

### Changed
- **Transcription VAD silence is now configurable and lower by default.** The
  realtime `turn_detection.silence_duration_ms` defaults to **200ms** (was 500ms)
  so interim/final transcripts arrive on shorter pauses, and can be overridden
  per session via the `silence` query param (→ `ITranscriptionContext.silenceMs`,
  clamped to 100–2000ms).

## [0.2.13]

### Added
- **Provider transcription contract** — `BaseAdapter.openTranscriptionSession(session)`
  (default throws "not supported", like `handleImageGeneration`) plus the
  `ITranscriptionSession` / `ITranscriptionContext` / `ITranscriptionUsage` types.
  Provider adapters override it to run a realtime speech-to-text session.
- **OpenAI Realtime transcription session** (`runOpenAITranscriptionSession`,
  wired through `OpenAIAdapter.openTranscriptionSession`) — opens the OpenAI
  realtime transcription WebSocket with the server-held key, streams the client's
  binary PCM16 audio as `input_audio_buffer.append`, and translates OpenAI's
  `delta` / `completed` / `error` events into the client protocol
  (`ready` / `delta` / `final` / `error`). Model + language are caller-chosen;
  accumulated audio/text token usage is reported via `reportUsage`. Endpoint
  overridable through `config.options.realtimeTranscriptionUrl`.
- **End-to-end `/ai/transcribe` wiring** — the WebSocket endpoint now resolves the
  provider adapter (from the `provider` / `model` / `language` query params, default
  `openai`) and runs a real transcription session instead of the placeholder echo.
  Session usage is converted to a credits cost and forwarded through `config.onUsage`,
  exactly like text requests.
- **Transcription pricing** — `gpt-4o-mini-transcribe` and `gpt-4o-transcribe`
  added to `model-pricing.json` with an `audioInput` rate; `calculateCredits` bills
  audio input tokens at the audio rate and the remaining input tokens as text.

## [0.2.12]

### Added
- **Speech-to-Text WebSocket endpoint** (`${routePrefix}/transcribe`, default
  `/ai/transcribe`) — authenticated transport for proxying realtime audio
  transcription so the provider key stays server-side. Reuses the HTTP auth rules
  (key format, referer, `checkAuthentication`) on the upgrade handshake. Exposed
  via the new `attachTranscriptionWs(server, config)` export for integration mode;
  attached automatically to the standalone server in `start()`.
- `ws` runtime dependency.
- Test suite `src/ws/transcription-ws.test.ts` covering auth, referer enforcement
  and path scoping.

> This release adds the authenticated transport only. The realtime audio→transcript
> protocol and per-credit metering land in subsequent releases.

## [0.2.11]

### Fixed
- Increased `DEFAULT_MAX_OUTPUT_TOKENS` from 1024 to 8192 to prevent truncated tool call arguments on long responses
- Empty streaming responses (no text and no tool calls) now emit an SSE `error` event instead of a silent empty `completed`

### Added
- Streaming fixture `empty-response-streaming.txt` for empty response scenario
- Test case for empty stream error handling

## [0.2.8]

### Added
- `CorsConfig` interface for fine-grained CORS control (`cors` field in `AppConfig`)
- Configurable `methods`, `allowedHeaders`, `credentials`, and `maxAge` CORS options
- `x-requested-with` added to default allowed headers
- CORS middleware tests (14 cases)
- CORS configuration section in documentation

## [0.1.23]

### Added
- Streaming text generation via `streamText` (SSE) with `metadata: { stream: true }`
- Streaming SSE fixtures captured from real OpenAI Responses API
- Streaming tests for adapter and request handler (text, tool calls, error handling)
- Fixture capture script now supports SSE streaming responses

## [0.1.22]

### Changed
- Moved `processRequest`, `handleNonStreaming`, `handleStreaming` from `OpenAIAdapter` to `BaseAdapter`
- `handleStreaming` now returns error as stream event instead of throwing
- Added abstract methods for provider customization: `createLanguageModel()`, `getDefaultFallbackModel()`, `getProviderOptions()`
- `OpenAIAdapter` reduced to constructor, 3 overrides, and `handleImageGeneration`

## [0.1.21]

### Added
- `enabled` option in `ProviderConfig` to disable providers via configuration
- Configurable route prefix (`routePrefix` / `ROUTE_PREFIX` env var, default `/ai`)
- Image generation endpoint (`POST /ai/image/generate`)
- Fixture capturing script for OpenAI API requests/responses
- Mermaid diagrams in architecture documentation
- Getting Started, Configuration, and API Reference documentation pages

### Changed
- Extracted generic Vercel AI SDK logic from `OpenAIAdapter` to `BaseAdapter`
- `AdapterFactory` map type no longer tied to `OpenAIAdapter`
- Removed `instanceof OpenAIAdapter` check from image generation handler
- Moved `enabled` check into `AdapterFactory.isProviderSupported()`
- Renamed route directories: `ai-request` → `request`, `ai-providers` → `providers`
- Restructured documentation into separate pages

### Fixed
- API key format in auth middleware tests updated for consistency

## [0.1.17]

### Changed
- Updated package.json to use ES module format for main and exports

## [0.1.16]

### Added
- Support for mounting into existing Express applications (`existingApp` / `existingRouter` options)

## [0.1.8]

### Added
- Memory and Redis rate limiters with tests

## [0.1.0] - 2025-01-22

### Added
- Initial release
- OpenAI provider support via Vercel AI SDK
- Authentication middleware with API key validation
- Streaming responses via Server-Sent Events (SSE)
- Tool calling support
- CORS middleware
- Docker support
- Comprehensive test suite with nock
