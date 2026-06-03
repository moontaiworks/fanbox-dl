# Rust Rewrite Design

## Goal

Rewrite the project as a Rust-native FANBOX downloader while preserving the current command-line workflow and downloaded file layout. The first delivery is a Rust crate with both a library and a CLI. npm packaging is intentionally out of scope for this phase.

## Scope

The rewrite replaces the TypeScript and Node.js project files with Rust project files. Existing local download and documentation artifacts are not carried forward unless they are required by the Rust project. The repository keeps only the files needed for the new Rust implementation, documentation, tests, and version control metadata.

## Architecture

The crate is named `fanbox-dl` and exposes both `src/lib.rs` and `src/main.rs`. The CLI keeps `fanbox-dl download` as the primary command. The library exposes reusable pieces for a future npm wrapper or direct Rust use.

Modules:

- `client`: read-only FANBOX API client with cookie, base URL, configurable User-Agent, and browser-like request headers.
- `types`: serde models for FANBOX payloads, preserving unknown fields where FANBOX responses are likely to vary.
- `cli`: clap-based argument parsing for the current downloader options.
- `downloader`: discovery, post sync, asset download, dry-run, verification, and output writing.
- `manifest`: schema v1 manifest loading and atomic saving.
- `scheduler`: concurrency limits, request interval, retries, HTTP 429 pausing, and Retry-After support.
- `path`: path sanitization, reserved-name handling, grapheme-aware UTF-8 truncation, and path budget checks.
- `markdown`: `content.md` rendering for supported post types.
- `logger`: JSON Lines and pretty log output.

## Compatibility

The Rust implementation follows the README and current test expectations as the compatibility contract, not existing TypeScript bugs. In particular, `--user-agent` and `FANBOX_USER_AGENT` must be passed to FANBOX API requests, and API requests must include browser-like headers used by a logged-in browser session.

The downloader keeps the existing output layout:

```text
<output>/<creator>/manifest.json
<output>/<creator>/posts/<date>_<postId>_<title>/summary.json
<output>/<creator>/posts/<date>_<postId>_<title>/metadata.json
<output>/<creator>/posts/<date>_<postId>_<title>/content.md
<output>/<creator>/posts/<date>_<postId>_<title>/assets/...
<output>/<creator>/posts/<date>_<postId>_<title>/archived/...
```

`manifest.json` remains schema version 1. Existing complete posts are skipped when `updatedDatetime` and cover URL have not changed. `--verify-assets` re-checks local file size and SHA-256 before skipping.

## Data Flow

1. CLI parses selectors, auth, output, logging, and request-control options.
2. Cookie input is normalized from `--cookie`, `--cookie-file`, or `FANBOX_SESSION_ID`. Netscape cookies.txt input selects FANBOX-domain cookies.
3. Creator IDs are resolved from explicit creators, followed creators, supporting plans, and ignored creators.
4. Discovery lists creator posts with direct cursor pagination and falls back to `post.paginateCreator` if direct cursoring fails or makes no progress.
5. For each creator, the manifest is loaded, summaries are written, restricted posts are skipped, unchanged posts are skipped, and changed posts fetch metadata.
6. Assets are listed from cover images, image posts, file posts, and article maps. Missing or changed assets are downloaded through the scheduler.
7. Completed assets are hashed, timestamps are set from `Last-Modified` or published time, obsolete assets are moved under `archived`, metadata and markdown are written, and the manifest is atomically saved.

## Error Handling

The CLI returns `0` for complete success, `1` for sync/download failures, and `2` for invalid usage. Per-post and per-asset failures are recorded in the manifest and logged without aborting the entire creator unless setup or discovery fails. FANBOX API and asset errors retain HTTP status and response bodies for verbose debug logs.

## Testing

Rust tests replace Vitest tests. Unit tests cover option parsing, cookie normalization, client request construction with a local mock server, discovery fallback, scheduler retry/pause behavior, path sanitization, markdown rendering, manifest load/save, asset resume/hash behavior, and sync output layout. Integration tests cover `fanbox-dl download --creator ... --dry-run` and a minimal successful download against a local test server.

## Out of Scope

This phase does not publish an npm package, expose a Node API, or add write-capable FANBOX endpoints. It also does not attempt to reverse-engineer private FANBOX behavior beyond the existing read-only endpoints already used by the project.
