# fanbox-dl

A Rust read-only pixivFANBOX SDK and CLI downloader.

## Features

- Authenticated FANBOX API client for creator, post, following, and supporting endpoints
- CLI downloader with creator selection, dry-run mode, retries, rate-limit pauses, and asset verification
- Local output per creator with `manifest.json`, `summary.json`, `metadata.json`, `content.md`, and downloaded assets
- Cross-platform path sanitization and resumable asset downloads with SHA-256 tracking

## Build

```bash
cargo build
```

## Test

```bash
cargo test
```

## CLI usage

```bash
cargo run -- download \
  --creator creator-id \
  --output ./fanbox-downloads
```

Use `FANBOX_SESSION_ID` for authentication, or pass `--cookie` / `--cookie-file`.
Use `--user-agent` if your FANBOX session requires the browser user agent.

## Library usage

Create a `FanboxClient` with a scheduler and HTTP client, then call the read-only API methods exposed from the crate.
