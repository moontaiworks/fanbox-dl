# Contributing to fanbox-dl

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development

### Prerequisites

- Node.js 20.x or higher
- pnpm (recommended) or npm

## Development Setup

1. Fork and clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/fanbox-dl.git
cd fanbox-dl
```

2. Install dependencies:

```bash
pnpm install
```

3. Create a new branch for your feature or bugfix:

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bugfix-name
```

## Project Structure

```
fanbox-dl/
├── .github/
│   └── workflows/
│       ├── ci.yml          # CI workflow with tests
│       ├── docs.yml        # Documentation publishing
│       ├── docs-preview.yml # PR documentation preview
│       └── release.yml     # Release and publish workflow
├── src/
│   ├── add/
│   │   ├── index.ts        # Add function
│   │   └── index.spec.ts   # Unit tests
│   ├── sum/
│   │   ├── index.ts        # Sum function
│   │   └── index.spec.ts   # Unit tests
│   ├── index.ts            # Main entry point
│   ├── utils.ts            # Utility functions
│   └── utils.spec.ts       # Unit tests
├── tests/
│   ├── utils/
│   │   └── test-helpers.ts # Shared test utilities
│   └── e2e/
│       └── integration.test.ts # E2E tests
├── .gitignore
├── .prettierignore
├── .prettierrc             # Prettier configuration
├── .releaserc.json         # Semantic-release configuration
├── eslint.config.mjs       # ESLint 9 flat config
├── tsconfig.json           # Base TypeScript config
├── tsconfig.esm.json       # ESM build config
├── tsconfig.cjs.json       # CommonJS build config
├── tsup.config.ts          # Bundler configuration
├── typedoc.json            # TypeDoc configuration
├── vitest.config.ts        # Vitest configuration
├── package.json
├── LICENSE
└── README.md
```

### Build Outputs

The project generates multiple build outputs:

1. **Bundled files** (`dist/bundle/`):
   - `index.js` - ESM bundle (minified)
   - `index.cjs` - CommonJS bundle (minified)
   - Type definitions included

2. **Native files** (`dist/esm/` and `dist/cjs/`):
   - Individual transpiled files maintaining source structure
   - Useful for tree-shaking and selective imports

## Development Workflow

### Code Style

This project uses ESLint and Prettier for code quality and formatting:

```bash
# Check linting
pnpm run lint

# Fix linting issues automatically
pnpm run lint:fix

# Format code
pnpm run format

# Check formatting
pnpm run format:check
```

### Type Checking

```bash
pnpm run typecheck
```

### Building

```bash
# Build all outputs
pnpm run build

# Build only bundled version
pnpm run build:bundle

# Build only native files
pnpm run build:native

# Clean build artifacts
pnpm run clean
```

## Commit Messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/) specification. Your commit messages should follow this format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat:` - A new feature (triggers minor version bump)
- `fix:` - A bug fix (triggers patch version bump)
- `docs:` - Documentation only changes (triggers patch version bump)
- `style:` - Changes that don't affect code meaning (white-space, formatting)
- `refactor:` - Code change that neither fixes a bug nor adds a feature (triggers patch version bump)
- `perf:` - Performance improvement (triggers patch version bump)
- `test:` - Adding or correcting tests
- `build:` - Changes to build process or dependencies
- `ci:` - Changes to CI configuration
- `chore:` - Other changes that don't modify src or test files

### Breaking Changes

To trigger a major version bump, include `BREAKING CHANGE:` in the commit footer or add `!` after the type:

```
feat!: change API signature

BREAKING CHANGE: The greet function now requires two parameters
```

### Examples

```bash
feat: add subtract function
fix: correct multiplication logic
docs: update README with new examples
refactor: simplify add function implementation
feat!: change API to use object parameters
```

## Pull Request Process

1. Ensure your code passes all checks:

   ```bash
   pnpm run typecheck
   pnpm run lint
   pnpm run format:check
   pnpm run build
   pnpm test
   ```

2. Update documentation if needed

3. Create a Pull Request with a clear title and description

4. Link any related issues in the PR description

5. Wait for review and address any feedback

## Testing

This project uses [Vitest](https://vitest.dev/) for testing. Tests are included and should be run before submitting a PR.

### Test Structure

- **Unit Tests** (`.spec.ts`): Located alongside source files in `src/`
  - Test individual functions and modules
  - Fast execution
  - Example: `src/add/index.spec.ts`, `src/utils.spec.ts`

- **E2E Tests** (`.test.ts`): Located in `tests/e2e/`
  - Test integration between multiple modules
  - Test complete user workflows
  - Example: `tests/e2e/integration.test.ts`

- **Test Utilities**: Located in `tests/utils/`
  - Shared test helpers and fixtures
  - Available for both unit and e2e tests
  - Example: `tests/utils/test-helpers.ts`

### Running Tests

```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Run tests with interactive UI
pnpm run test:ui

# Run tests with coverage report
pnpm run test:coverage
```

When adding new features or fixing bugs:

1. Place unit test files next to source files with `.spec.ts` extension
2. Place integration tests in `tests/e2e/` with `.test.ts` extension
3. Ensure all tests pass before submitting PR
4. Aim to maintain 100% code coverage

### Coverage Reports

Coverage reports are automatically generated and uploaded to [Codecov](https://codecov.io/gh/moontaiworks/fanbox-dl) on every CI run. You can view:

- Line coverage
- Branch coverage
- Function coverage
- File-by-file breakdown

## Release Process

Releases are automated through semantic-release:

1. Commits to the `release` branch trigger the release workflow
2. Semantic-release analyzes commit messages
3. Version is bumped according to commit types
4. Changelog is generated automatically
5. GitHub release is created
6. Package is published to NPM

You don't need to manually update version numbers or create releases.

## CI/CD Pipeline

### Continuous Integration

The CI workflow runs on every push and pull request:

1. Type checking with TypeScript
2. Linting with ESLint
3. Format checking with Prettier
4. Building the project
5. Running tests with coverage
6. Uploading coverage to Codecov

Tested on Node.js versions: 20.x, 22.x, 24.x

### Continuous Deployment

The Release workflow runs on pushes to the `release` branch:

1. Analyzes commits using conventional commit format
2. Determines version bump based on commit types
3. Generates changelog
4. Creates GitHub release
5. Publishes to NPM registry
6. Updates version in package.json

## Documentation

API documentation is automatically generated using [TypeDoc](https://typedoc.org/) and published to GitHub Pages.

- **View the latest documentation**: [GitHub Pages](https://moontaiworks.github.io/fanbox-dl/)

### Generating Documentation Locally

```bash
# Generate documentation
pnpm run docs

# Clean documentation
pnpm run docs:clean
```

The generated documentation will be in the `docs/` directory. Open `docs/index.html` in your browser to view it.

### Documentation in PRs

When you create a pull request, the documentation preview workflow will automatically:

1. Generate documentation for your changes
2. Upload it as an artifact
3. Post a comment with a download link

This allows reviewers to see how your changes affect the API documentation before merging.

## Questions?

Feel free to open an issue for any questions or concerns!
