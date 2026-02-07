# Jodit AI Adapter Service

[![CI](https://github.com/jodit/jodit-ai-adapter/workflows/Jodit%20AI%20Adapter%20CI%2FCD/badge.svg)](https://github.com/jodit/jodit-ai-adapter/actions)
[![npm version](https://badge.fury.io/js/jodit-ai-adapter.svg)](https://www.npmjs.com/package/jodit-ai-adapter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/docker/v/xdsoft/jodit-ai-adapter?label=docker)](https://hub.docker.com/r/xdsoft/jodit-ai-adapter)

Universal AI adapter service for [Jodit Editor AI Assistant Pro](https://xdsoft.net/jodit/) using [Vercel AI SDK](https://ai-sdk.dev/).

This service provides a secure, server-side proxy for AI providers (OpenAI, DeepSeek, Claude, etc.) that can be used with Jodit Editor's AI Assistant Pro plugin. It handles API key management, authentication, and request routing to various AI providers.

## Features

- **Secure API Key Management** - API keys stored server-side, not exposed to clients
- **Authentication** - Validates API keys (36 characters, UUID format) and referer headers
- **Multi-Provider Support** - OpenAI, DeepSeek, Anthropic, Google (extensible)
- **Streaming Support** - Real-time streaming responses using Server-Sent Events (SSE)
- **Tool Calling** - Full support for function/tool calling
- **Rate Limiting** - Configurable rate limiting with in-memory or Redis backend
- **Distributed Support** - Redis-based rate limiting for multi-instance deployments
- **Production Ready** - Docker support, TypeScript, comprehensive error handling
- **Logging** - Winston-based logging with different levels
- **Testing** - Jest with comprehensive test coverage

## Documentation

- [Quick Start](getting-started.md) - Install, configure, and run in minutes
- [Configuration](configuration.md) - Environment variables and configuration file
- [API Reference](api-reference.md) - All available endpoints
- [Architecture](ARCHITECTURE.md) - System architecture and design
- [Rate Limiting](rate-limiting.md) - Rate limiting configuration
- [Client Integration](examples/client-integration.md) - Jodit Editor integration examples
- [Usage Tracking](examples/usage-tracking.md) - Track AI usage and costs

## License

MIT License - see [LICENSE](../LICENSE) for details.

## Links

- [GitHub Repository](https://github.com/jodit/jodit-ai-adapter)
- [npm Package](https://www.npmjs.com/package/jodit-ai-adapter)
- [Jodit Editor](https://xdsoft.net/jodit/)
- [Vercel AI SDK](https://ai-sdk.dev/)
