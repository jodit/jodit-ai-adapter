# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
