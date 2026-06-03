# HTTP/2 Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the project's fetch-based networking with a native HTTP/2-first transport built on `node:http2`.

**Architecture:** Add a focused transport layer that owns HTTP/2 sessions, request pseudo-headers, response headers, and stream bodies. FANBOX API and asset downloads consume that transport directly while the request scheduler continues to own concurrency, pacing, rate-limit pauses, and retry behavior.

**Tech Stack:** TypeScript, Node.js `node:http2`, Node streams, Vitest, existing scheduler/logger/downloader modules.

---

### Task 1: Native HTTP/2 Transport

**Files:**
- Create: `src/http.ts`
- Test: `src/http.spec.ts`

- [ ] **Step 1: Write failing tests**

Create tests that start a local HTTP/2 cleartext server, send a GET request through `Http2Transport`, verify `stream.session.alpnProtocol`/HTTP/2 request handling indirectly through the server, verify JSON parsing, header capture, and stream body reading.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/http.spec.ts`
Expected: FAIL because `src/http.ts` does not exist.

- [ ] **Step 3: Implement minimal transport**

Implement `HttpRequest`, `HttpResponse`, `HttpTransport`, `HttpError`, `Http2Transport`, and helpers for `text()`/`json()`/session cleanup.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/http.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add native http2 transport`

### Task 2: FANBOX API Client Uses Transport

**Files:**
- Modify: `src/types.ts`
- Modify: `src/client.ts`
- Modify: `src/client.spec.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing client tests**

Update tests to inject a recording `HttpTransport`, assert request URL/method/headers, and assert API errors use `HttpResponse`.

- [ ] **Step 2: Run client tests to verify they fail**

Run: `pnpm exec vitest run src/client.spec.ts`
Expected: FAIL because `FanboxClient` still expects `fetch`.

- [ ] **Step 3: Implement client migration**

Change `FanboxClientOptions` to `transport?: HttpTransport`, use `Http2Transport` by default, preserve cookie/user-agent/baseUrl behavior, and parse response JSON from `HttpResponse`.

- [ ] **Step 4: Run client tests to verify they pass**

Run: `pnpm exec vitest run src/client.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `refactor: use http transport for fanbox api`

### Task 3: Scheduler And Asset Downloads Use Transport

**Files:**
- Modify: `src/downloader/scheduler.ts`
- Modify: `src/downloader/scheduler.spec.ts`
- Modify: `src/downloader/asset.ts`
- Modify: `src/downloader/asset.spec.ts`
- Modify: `src/downloader/errors.ts`
- Modify: `src/downloader/sync.spec.ts`

- [ ] **Step 1: Write failing scheduler and asset tests**

Update scheduler tests to wrap generic operations returning `HttpResponse`. Update asset tests to return Node readable streams and verify Range, resume, restart, and error logging.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `pnpm exec vitest run src/downloader/scheduler.spec.ts src/downloader/asset.spec.ts`
Expected: FAIL because scheduler/asset still depend on fetch/Response.

- [ ] **Step 3: Implement scheduler and asset migration**

Expose a generic `RequestScheduler.request(operation)` method, keep retry semantics, and make `AssetDownloader` call `transport.request()` then pipeline the Node response stream directly.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `pnpm exec vitest run src/downloader/scheduler.spec.ts src/downloader/asset.spec.ts src/downloader/sync.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `refactor: download assets through http2 transport`

### Task 4: CLI Dependency Wiring

**Files:**
- Modify: `src/downloader/cli.ts`
- Modify: `src/downloader/cli.spec.ts`

- [ ] **Step 1: Write failing CLI tests**

Update CLI tests to inject a recording `HttpTransport` instead of fetch and confirm configured user-agent reaches API requests.

- [ ] **Step 2: Run CLI tests to verify they fail**

Run: `pnpm exec vitest run src/downloader/cli.spec.ts`
Expected: FAIL because CLI still accepts `fetch`.

- [ ] **Step 3: Implement CLI migration**

Change `RunCliDependencies` to accept `transport?: HttpTransport`, create a default shared `Http2Transport`, pass scheduler-wrapped request operations to the API client and asset downloader, and close the transport at the end.

- [ ] **Step 4: Run CLI tests to verify they pass**

Run: `pnpm exec vitest run src/downloader/cli.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `refactor: wire cli to http2 transport`

### Task 5: Full Verification

**Files:**
- Modify as needed: remaining tests/types affected by transport rename

- [ ] **Step 1: Run all verification**

Run: `pnpm run typecheck`
Run: `pnpm run lint`
Run: `pnpm test`

- [ ] **Step 2: Fix only transport migration fallout**

Address type, lint, and test failures caused by the HTTP/2 migration.

- [ ] **Step 3: Commit**

Commit message: `test: verify http2 transport migration`
