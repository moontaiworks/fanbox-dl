# @moontaiworks/fanbox-dl

A cli downloader or a read-only TypeScript SDK for building pixivFANBOX applications.

[![NPM Version](https://img.shields.io/npm/v/@moontaiworks/fanbox-dl)](https://www.npmjs.com/package/@moontaiworks/fanbox-dl)
[![NPM Downloads](https://img.shields.io/npm/d18m/@moontaiworks/fanbox-dl)](https://www.npmjs.com/package/@moontaiworks/fanbox-dl)
[![Documentation](https://github.com/moontaiworks/fanbox-dl/actions/workflows/docs.yml/badge.svg)](https://github.com/moontaiworks/fanbox-dl/actions/workflows/docs.yml)
[![codecov](https://codecov.io/gh/moontaiworks/fanbox-dl/branch/main/graph/badge.svg)](https://codecov.io/gh/moontaiworks/fanbox-dl)

## CLI Downloader

Run the downloader through your package manager, or install it globally:

```bash
npx @moontaiworks/fanbox-dl download --creator creator-id
```

```bash
npm install -g @moontaiworks/fanbox-dl
fanbox-dl download --creator creator-id
```

Authenticated downloads read `FANBOX_SESSION_ID` by default:

```bash
FANBOX_SESSION_ID=your-session-id npx @moontaiworks/fanbox-dl download \
  --supporting \
  --output ./fanbox-downloads
```

You can also pass a cookie file exported from your logged-in browser session:

```bash
npx @moontaiworks/fanbox-dl download \
  --creator creator-id \
  --cookie-file ./cookies.txt
```

Preview the selected creators and posts without downloading:

```bash
npx @moontaiworks/fanbox-dl download --creator creator-id --dry-run
```

At least one creator selector is required: `--creator`, `--following`, or
`--supporting`.

### CLI Options

| Option                           | Description                                                                                            | Example                          | Default             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------- |
| `--creator <id>`                 | Add a creator ID to download. Can be repeated.                                                         | `--creator alpha --creator beta` | None                |
| `--following`                    | Download posts from followed creators. Requires authentication.                                        | `--following`                    | `false`             |
| `--supporting`                   | Download posts from supporting creators. Requires authentication.                                      | `--supporting`                   | `false`             |
| `--ignore-creator <id>`          | Exclude a creator ID from the selected creators. Can be repeated.                                      | `--ignore-creator beta`          | None                |
| `--cookie <value>`               | Raw `FANBOXSESSID`, `FANBOXSESSID=...`, or a full Cookie header.                                       | `--cookie "FANBOXSESSID=..."`    | `FANBOX_SESSION_ID` |
| `--cookie-file <path>`           | Read a raw cookie value or Netscape `cookies.txt`. FANBOX cookies are selected automatically.          | `--cookie-file ./cookies.txt`    | None                |
| `--user-agent <value>`           | Send the same User-Agent as the browser session that produced your cookie.                             | `--user-agent "Mozilla/5.0 ..."` | random string       |
| `--output <path>`                | Directory where downloaded creators and posts are stored.                                              | `--output ./fanbox-downloads`    | `fanbox-downloads`  |
| `--dry-run`                      | List selected creators and discovered post summaries without writing files or requesting post details. | `--dry-run`                      | `false`             |
| `--flat-posts`                   | Store post files directly under each creator directory instead of one directory per post.              | `--flat-posts`                   | `false`             |
| `--verify-assets`                | Verify existing asset size and SHA-256 before deciding whether to skip a file.                         | `--verify-assets`                | `false`             |
| `--concurrency <n>`              | Maximum number of concurrent requests. Must be greater than `0`.                                       | `--concurrency 3`                | `3`                 |
| `--http2-session-multiplier <n>` | Multiplier used with concurrency to set HTTP/2 sessions per origin. Must be greater than `0`.          | `--http2-session-multiplier 10`  | `10`                |
| `--request-interval-ms <n>`      | Delay between request starts, in milliseconds.                                                         | `--request-interval-ms 1000`     | `0`                 |
| `--rate-limit-pause-ms <n>`      | Pause duration after HTTP 429 when FANBOX does not send `Retry-After`.                                 | `--rate-limit-pause-ms 60000`    | `60000`             |
| `--max-retries <n>`              | Retry attempts for retryable request failures.                                                         | `--max-retries 5`                | `5`                 |
| `--log-format json\|pretty`      | Choose JSON Lines logs or human-readable logs.                                                         | `--log-format pretty`            | `json`              |
| `--log-level <level>`            | Show logs at this level or higher. One of `trace`, `debug`, `info`, `warn`, `error` or `silent`.       | `--log-level trace`              | `info`              |
| `--help`                         | Show CLI help.                                                                                         | `--help`                         | None                |

### CLI Notes

The downloader stores each post as `metadata.json`, `content.md`, and asset
files in a per-post directory. Asset file names include a two-digit sequence
number, so files are easy to browse in order.

It keeps a per-creator `manifest.json`, skips unchanged posts, resumes `.part`
files with HTTP Range requests when supported, and can verify existing SHA-256
hashes with `--verify-assets`.

Passing `--cookie` is convenient but may leave the session value in shell
history. `--cookie-file` accepts either a raw cookie value or a Netscape
`cookies.txt` export from your own logged-in browser session. When using
`cookies.txt`, FANBOX cookies such as `FANBOXSESSID` and `cf_clearance` are
selected automatically.

Run `fanbox-dl --help` for the full CLI option list.

## SDK

### Installation

```bash
npm install @moontaiworks/fanbox-dl
```

### Usage

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

### Documentation

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
