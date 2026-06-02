# @moontaiworks/fanbox-dl

A modern TypeScript project template with ESLint, Prettier, and automated releases.

[![NPM Version](https://img.shields.io/npm/v/@moontaiworks/fanbox-dl)](https://www.npmjs.com/package/@moontaiworks/fanbox-dl)
[![NPM Downloads](https://img.shields.io/npm/d18m/@moontaiworks/fanbox-dl)](https://www.npmjs.com/package/@moontaiworks/fanbox-dl)
[![Documentation](https://github.com/moontaiworks/fanbox-dl/actions/workflows/docs.yml/badge.svg)](https://github.com/moontaiworks/fanbox-dl/actions/workflows/docs.yml)
[![codecov](https://codecov.io/gh/moontaiworks/fanbox-dl/branch/main/graph/badge.svg)](https://codecov.io/gh/moontaiworks/fanbox-dl)

## Installation

```bash
npm install @moontaiworks/fanbox-dl
```

## Usage

### ESM (ES Modules)

```typescript
import FanboxDL from "@moontaiworks/fanbox-dl";

// TODO(docs): Usage
```

### CommonJS

```javascript
const FanboxDL = require("@moontaiworks/fanbox-dl");

// TODO(docs): Usage
```

## Documentation

API documentation is automatically generated using [TypeDoc](https://typedoc.org/) and published to GitHub Pages.

- **View the latest documentation**: [GitHub Pages](https://moontaiworks.github.io/fanbox-dl/)

## Testing

Tests load env vars from `.env.test` and `.env.test.local` via the `env` command in the `pnpm test` scripts. The committed `.env.test` file includes empty placeholders; put real credentials in `.env.test.local` to run OAuth-backed tests locally.

```bash

```

Then run:

```bash
pnpm test
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
