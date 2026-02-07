# Contributing to Jodit AI Adapter

Thank you for your interest in contributing to Jodit AI Adapter! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful and constructive in all interactions. We aim to maintain a welcoming and inclusive environment.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/jodit/jodit-ai-adapter/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node version, OS, etc.)
   - Code samples if applicable

### Suggesting Features

1. Check existing feature requests
2. Create a new issue with:
   - Clear use case
   - Proposed solution
   - Alternative solutions considered
   - Potential impact

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Write/update tests
5. Run tests: `npm test`
6. Run linter: `npm run lint`
7. Commit with descriptive message
8. Push to your fork
9. Create a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/jodit-ai-adapter.git
cd jodit-ai-adapter

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run development server
npm run dev
```

## Coding Standards

### TypeScript

- Use strict TypeScript settings
- Provide types for all function parameters and return values
- Avoid `any` type unless absolutely necessary

### Code Style

- Use Prettier for formatting: `npm run format`
- Use ESLint for linting: `npm run lint`
- Follow existing code patterns

### Testing

- Write tests for new features
- Maintain or improve code coverage
- Use nock for mocking HTTP requests
- Follow AAA pattern (Arrange, Act, Assert)

Example:
```typescript
describe('MyFeature', () => {
  it('should do something', () => {
    // Arrange
    const input = ...;

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Commit Messages

Follow conventional commits:

- `feat: add new provider adapter`
- `fix: correct authentication validation`
- `docs: update README with examples`
- `test: add tests for streaming`
- `refactor: simplify error handling`
- `chore: update dependencies`

## Adding a New AI Provider

1. **Create Adapter Class**

```typescript
// src/adapters/my-provider-adapter.ts
import { BaseAdapter } from './base-adapter';

export class MyProviderAdapter extends BaseAdapter {
  protected async processRequest(context, signal) {
    // Implement using Vercel AI SDK
  }
}
```

2. **Register in Factory**

```typescript
// src/adapters/adapter-factory.ts
import { MyProviderAdapter } from './my-provider-adapter';

AdapterFactory.adapters.set('myprovider', MyProviderAdapter);
```

3. **Add Configuration**

```typescript
// src/config/default-config.ts
myprovider: {
  type: 'myprovider',
  apiKey: process.env.MYPROVIDER_API_KEY,
  defaultModel: 'model-name'
}
```

4. **Write Tests**

```typescript
// src/adapters/my-provider-adapter.test.ts
describe('MyProviderAdapter', () => {
  // Test cases
});
```

5. **Update Documentation**

- Add to README.md
- Update configuration examples
- Add usage examples

## Testing Guidelines

### Unit Tests

- Test individual functions/classes
- Mock external dependencies
- Cover edge cases and error conditions

### Integration Tests

- Test API endpoints
- Test middleware chain
- Test provider integration

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- auth.test.ts

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Update inline comments for complex logic
- Create examples in `docs/` directory

### Local Documentation Server

The project uses [MkDocs](https://www.mkdocs.org/) for documentation. To generate and preview docs locally:

```bash
# First-time setup (creates Python venv and installs dependencies)
npm run docs:setup

# Start local dev server with hot-reload
npm run docs:serve

# Build static site
npm run docs:build
```

Deployment to GitHub Pages (`npm run docs:deploy`) is handled automatically by CI.

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create git tag: `git tag v0.2.0`
4. Push tag: `git push --tags`
5. GitHub Actions will handle the rest

## Questions?

Feel free to:
- Open an issue for questions
- Start a discussion
- Reach out to maintainers

Thank you for contributing! 🎉
