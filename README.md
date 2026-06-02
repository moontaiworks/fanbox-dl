# @moontaiworks/fanbox-dl

A read-only TypeScript SDK for building pixivFANBOX downloaders.

[![NPM Version](https://img.shields.io/npm/v/@moontaiworks/fanbox-dl)](https://www.npmjs.com/package/@moontaiworks/fanbox-dl)
[![NPM Downloads](https://img.shields.io/npm/d18m/@moontaiworks/fanbox-dl)](https://www.npmjs.com/package/@moontaiworks/fanbox-dl)
[![Documentation](https://github.com/moontaiworks/fanbox-dl/actions/workflows/docs.yml/badge.svg)](https://github.com/moontaiworks/fanbox-dl/actions/workflows/docs.yml)
[![codecov](https://codecov.io/gh/moontaiworks/fanbox-dl/branch/main/graph/badge.svg)](https://codecov.io/gh/moontaiworks/fanbox-dl)

## Installation

```bash
npm install @moontaiworks/fanbox-dl
```

## Usage

FANBOX uses the `FANBOXSESSID` cookie for authenticated requests. Obtain it from
your own browser session and keep it outside source control.

```typescript
import { FanboxClient } from "@moontaiworks/fanbox-dl";

const fanbox = new FanboxClient({
  cookie: `FANBOXSESSID=${process.env.FANBOX_SESSION_ID}`,
});

const creators = await fanbox.listFollowingCreators();
const supportingPlans = await fanbox.listSupportingPlans();

const pageUrls = await fanbox.paginateCreatorPosts({
  creatorId: creators[0].creatorId,
  sort: "newest",
});

const posts = await fanbox.listCreatorPosts({
  creatorId: supportingPlans[0].creatorId,
  limit: 10,
  sort: "newest",
});

const post = await fanbox.getPost({ postId: posts[0].id });
```

The SDK also provides `listHomePosts()` and `listSupportingPosts()` for
authenticated timelines. It intentionally exposes read-only endpoints: it does
not follow creators, like posts, or create comments.

## Documentation

API documentation is automatically generated using [TypeDoc](https://typedoc.org/) and published to GitHub Pages.

- **View the latest documentation**: [GitHub Pages](https://moontaiworks.github.io/fanbox-dl/)

## Testing

Tests inject a local HTTP transport and do not require a real FANBOX session.

Run:

```bash
pnpm test
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
