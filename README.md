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

## CLI Downloader

Install the package globally or run it through your package manager:

```bash
npx @moontaiworks/fanbox-dl download \
  --following \
  --supporting \
  --ignore-creator creator-to-skip \
  --output ./fanbox-downloads
```

The downloader stores each post as `summary.json`, `metadata.json`,
`content.md`, and an `assets/` directory. It keeps a per-creator
`manifest.json`, skips unchanged posts, resumes `.part` files with HTTP Range
requests when supported, and can verify existing SHA-256 hashes:

```bash
fanbox-dl download --creator creator-id --verify-assets
```

Preview the selected creators and discovered post summaries without writing
files or requesting post details:

```bash
fanbox-dl download --creator creator-id --dry-run
```

Authenticated downloads read `FANBOX_SESSION_ID` by default. You can override
it with `--cookie-file` or `--cookie`. Passing `--cookie` is convenient but may
leave the session value in shell history.

If FANBOX returns a Cloudflare block page, use the same `User-Agent` as the
browser session that produced your cookie:

```bash
fanbox-dl download \
  --creator creator-id \
  --cookie-file ./fanbox-cookie.txt \
  --user-agent "Mozilla/5.0 ..."
```

`--cookie` and `--cookie-file` may contain a full Cookie header, for example
`FANBOXSESSID=...; cf_clearance=...`, when those values come from your own
logged-in browser session.

Useful request controls:

```bash
fanbox-dl download \
  --supporting \
  --concurrency 3 \
  --request-interval-ms 1000 \
  --rate-limit-pause-ms 60000 \
  --max-retries 5
```

Logs use JSON Lines by default. Add `--log-format pretty` for interactive use.
Use `--verbose` to include debug logs, including response status and body for
FANBOX API errors. When FANBOX responds with HTTP 429, all new requests pause
before retrying.

Run `fanbox-dl --help` for the full CLI option list.

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
