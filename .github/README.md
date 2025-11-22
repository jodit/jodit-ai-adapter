# GitHub Actions Workflows

This directory contains CI/CD workflows for the Jodit AI Adapter project.

## Workflows

### 1. CI/CD Pipeline (`ci.yml`)

**Triggers:**
- Manual dispatch
- Git tags (releases)
- Pull requests to main/master

**Jobs:**

#### Test Job
- Checkout code
- Setup Node.js 22
- Install dependencies
- Run linter
- Run tests with coverage
- Upload coverage to Codecov
- Build project
- Verify build artifacts

#### Docker Job (on tags only)
- Build multi-platform Docker images (amd64, arm64)
- Push to Docker Hub with version tag and latest
- Supports image caching

#### Publish Job (on tags only)
- Build project
- Publish to npm registry
- Requires NPM_TOKEN secret

#### Release Job (on tags only)
- Create GitHub release
- Auto-generate release notes from CHANGELOG.md

### 2. Documentation (`docs.yml`)

**Triggers:**
- Manual dispatch
- Push to main/master (when docs/** or src/** changes)

**Jobs:**

#### Build Docs
- Setup Node.js and Python
- Build project
- Install MkDocs with Material theme
- Generate documentation site from:
  - README.md
  - CHANGELOG.md
  - CONTRIBUTING.md
  - ARCHITECTURE.md
  - Example files
- Upload as Pages artifact

#### Deploy
- Deploy to GitHub Pages

## Required Secrets

Configure these in repository settings → Secrets and variables → Actions:

- `DOCKERHUB_USERNAME` - Docker Hub username
- `DOCKERHUB_TOKEN` - Docker Hub access token
- `NPM_TOKEN` - npm authentication token

## Required Permissions

GitHub Pages deployment requires:
- Settings → Pages → Source: GitHub Actions
- Actions permissions: Read and write permissions

## Usage

### Create a Release

```bash
# Update version in package.json
npm version patch  # or minor, major

# Push tag
git push --tags

# GitHub Actions will automatically:
# - Run tests
# - Build Docker image
# - Publish to npm
# - Create GitHub release
```

### Deploy Documentation

Documentation deploys automatically on push to main/master, or trigger manually:
- Go to Actions → Generate and Deploy Documentation → Run workflow

## Local Testing

Test workflows locally with [act](https://github.com/nektos/act):

```bash
# Install act
brew install act

# Run test job
act -j test

# Run all jobs (requires secrets)
act --secret-file .secrets
```

## Workflow Status Badges

Add to README.md:

```markdown
![CI](https://github.com/jodit/jodit-ai-adapter/workflows/Jodit%20AI%20Adapter%20CI%2FCD/badge.svg)
![Docs](https://github.com/jodit/jodit-ai-adapter/workflows/Generate%20and%20Deploy%20Documentation/badge.svg)
```
