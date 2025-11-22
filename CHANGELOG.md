# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project setup
- OpenAI adapter using Vercel AI SDK
- Authentication middleware with API key validation (32 chars, A-F0-9-)
- Referer validation support
- CORS middleware
- Streaming support via Server-Sent Events (SSE)
- Tool calling support
- Docker configuration
- Comprehensive test suite with nock
- Documentation and examples
- TypeScript configuration with strict mode
- ESLint and Prettier configuration

### Security
- Server-side API key storage
- Custom authentication callback support
- Referer header validation

## [0.1.0] - 2025-01-22

### Added
- Initial release
- OpenAI provider support
- Basic authentication
- Streaming responses
- Docker support
