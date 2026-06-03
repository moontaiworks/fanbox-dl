# Rust Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TypeScript/Node project with a Rust crate that provides a FANBOX downloader library and `fanbox-dl download` CLI.

**Architecture:** Build one Rust package with `src/lib.rs` for reusable modules and `src/main.rs` for the CLI binary. Preserve the current downloader file layout and schema v1 manifest while using Rust crates for HTTP, async scheduling, JSON, CLI parsing, logging, path handling, and tests.

**Tech Stack:** Rust 2021, `tokio`, `reqwest`, `serde`, `serde_json`, `clap`, `thiserror`, `chrono`, `sha2`, `unicode-segmentation`, `sanitize-filename`, `tracing`, `wiremock`, `assert_cmd`, `tempfile`.

---

## File Structure

- Create `Cargo.toml`: crate metadata, binary target, dependencies, dev-dependencies.
- Create `src/lib.rs`: module exports and public API surface.
- Create `src/main.rs`: process entrypoint that delegates to CLI runner.
- Create `src/types.rs`: FANBOX response and post models.
- Create `src/client.rs`: API client, request construction, response unwrapping, API errors.
- Create `src/cli.rs`: clap parser, cookie normalization, command dispatch.
- Create `src/logger.rs`: JSON and pretty log lines.
- Create `src/scheduler.rs`: concurrency, retry, request interval, rate-limit pause.
- Create `src/path.rs`: path sanitization and path budget enforcement.
- Create `src/manifest.rs`: manifest types and atomic load/save.
- Create `src/markdown.rs`: markdown renderer.
- Create `src/downloader.rs`: discovery, creator resolution, post sync, asset download.
- Create `tests/cli_download.rs`: end-to-end CLI behavior against a local server.
- Modify `README.md`: Rust installation, CLI usage, development commands.
- Modify `.gitignore`: Rust build output and local download directories.
- Delete Node/TypeScript files and local artifacts not needed by Rust.

## Task 1: Rust Project Skeleton

**Files:**
- Create: `Cargo.toml`
- Create: `src/lib.rs`
- Create: `src/main.rs`
- Create: `src/cli.rs`
- Modify: `.gitignore`

- [ ] Step 1: Write a failing smoke test by running `cargo test` before Rust project files exist.
  Expected: Cargo reports it cannot find `Cargo.toml`.

- [ ] Step 2: Create `Cargo.toml` with package metadata, dependencies, and binary target.

- [ ] Step 3: Create `src/lib.rs` exporting `cli`.

- [ ] Step 4: Create `src/main.rs` that calls `fanbox_dl::cli::run_from_env().await`.

- [ ] Step 5: Create `src/cli.rs` with a minimal async `run_from_env` returning success for `--help`.

- [ ] Step 6: Run `cargo test`.
  Expected: compile succeeds.

- [ ] Step 7: Commit with `chore: scaffold rust crate`.

## Task 2: CLI Options and Cookie Normalization

**Files:**
- Modify: `src/cli.rs`

- [ ] Step 1: Add tests for `download --creator`, required selectors, integer validation, raw session cookie normalization, full Cookie header preservation, and Netscape cookies.txt FANBOX-domain selection.

- [ ] Step 2: Run `cargo test cli`.
  Expected: tests fail because parser and normalization are incomplete.

- [ ] Step 3: Implement clap structs and `DownloadOptions::from_matches`.

- [ ] Step 4: Implement `normalize_cookie` and `parse_netscape_cookies`.

- [ ] Step 5: Run `cargo test cli`.
  Expected: parser and cookie tests pass.

- [ ] Step 6: Commit with `feat: add rust cli option parsing`.

## Task 3: FANBOX Types and Client

**Files:**
- Create: `src/types.rs`
- Create: `src/client.rs`
- Modify: `src/lib.rs`

- [ ] Step 1: Add client tests using `wiremock` for URL serialization, envelope unwrapping, browser-like headers, cookie header, caller-provided User-Agent, JSON error bodies, and text error bodies.

- [ ] Step 2: Run `cargo test client`.
  Expected: tests fail because `FanboxClient` does not exist.

- [ ] Step 3: Implement serde FANBOX models and flexible post body representations.

- [ ] Step 4: Implement `FanboxClient` with read-only endpoints.

- [ ] Step 5: Run `cargo test client`.
  Expected: client tests pass.

- [ ] Step 6: Commit with `feat: add fanbox api client`.

## Task 4: Logger, Scheduler, Paths, Manifest, Markdown

**Files:**
- Create: `src/logger.rs`
- Create: `src/scheduler.rs`
- Create: `src/path.rs`
- Create: `src/manifest.rs`
- Create: `src/markdown.rs`
- Modify: `src/lib.rs`

- [ ] Step 1: Add focused unit tests for log formats, retryable statuses, Retry-After parsing, concurrency-limited operations, path reserved names, invalid characters, grapheme truncation, manifest missing-file defaults, atomic save/load, and markdown rendering for text/image/file/article/video/unknown posts.

- [ ] Step 2: Run `cargo test logger scheduler path manifest markdown`.
  Expected: tests fail because modules are missing.

- [ ] Step 3: Implement the five modules.

- [ ] Step 4: Run `cargo test logger scheduler path manifest markdown`.
  Expected: unit tests pass.

- [ ] Step 5: Commit with `feat: add downloader support modules`.

## Task 5: Downloader Workflow

**Files:**
- Create: `src/downloader.rs`
- Modify: `src/cli.rs`
- Modify: `src/lib.rs`

- [ ] Step 1: Add unit tests for creator resolution, discovery cursor fallback, restricted post skip, unchanged post skip, obsolete asset archival, asset resume, SHA-256 verification, dry-run no-write behavior, and successful output layout.

- [ ] Step 2: Run `cargo test downloader`.
  Expected: tests fail because workflow is missing.

- [ ] Step 3: Implement creator resolution and post discovery.

- [ ] Step 4: Implement asset download with `.part`, HTTP Range resume, hashing, timestamps, and errors.

- [ ] Step 5: Implement `sync_creator` and connect CLI execution.

- [ ] Step 6: Run `cargo test downloader`.
  Expected: downloader tests pass.

- [ ] Step 7: Commit with `feat: add rust fanbox downloader`.

## Task 6: Integration, Cleanup, Documentation

**Files:**
- Create: `tests/cli_download.rs`
- Modify: `README.md`
- Modify: `.github/workflows/*` if existing CI remains useful
- Delete: TypeScript/Node configs, TypeScript source/tests, `node_modules`, local artifacts, and stale generated files.

- [ ] Step 1: Add integration tests for `fanbox-dl --help`, invalid usage exit code 2, dry-run logging, and minimal successful download.

- [ ] Step 2: Run `cargo test`.
  Expected: integration tests fail until CLI wiring is complete.

- [ ] Step 3: Fix CLI wiring and update README.

- [ ] Step 4: Delete all non-Rust project files and local artifacts not required by the Rust crate.

- [ ] Step 5: Run `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, and `cargo test`.
  Expected: all verification commands pass.

- [ ] Step 6: Commit with `chore: replace typescript project with rust`.

## Self-Review

Spec coverage: the plan covers project deletion, Rust crate structure, CLI compatibility, FANBOX client behavior, downloader output layout, manifest schema, retries, path handling, logging, tests, and documentation.

Placeholder scan: no task uses TBD, TODO, or an unspecified implementation step.

Type consistency: module and file names match the design and task list.
