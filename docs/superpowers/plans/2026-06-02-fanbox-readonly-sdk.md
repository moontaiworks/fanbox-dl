# FANBOX Read-only SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a typed, read-only TypeScript client for downloader-oriented pixivFANBOX API calls.

**Architecture:** A single `FanboxClient` owns shared HTTP configuration and exposes resource-oriented methods. Public API types live in a separate module, while tests inject a fetch-compatible transport and assert requests without touching the network.

**Tech Stack:** TypeScript, Vitest, native `fetch`, pnpm

---

### Task 1: HTTP client and collection endpoints

**Files:**
- Create: `src/types.ts`
- Create: `src/client.ts`
- Create: `src/client.spec.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing tests for request construction and response unwrapping**

Add Vitest tests that instantiate `FanboxClient` with a recording fetch
function. Assert `getCreator`, `listCreatorPlans`, `paginateCreatorPosts`,
`listCreatorPosts`, and `getPost` call the corresponding GET paths, serialize
query values, include FANBOX origin and referer headers, include an optional
cookie, and return the inner `body`.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `pnpm exec vitest run src/client.spec.ts`

Expected: FAIL because `src/client.ts` does not exist.

- [ ] **Step 3: Add public types and the minimal client implementation**

Implement:

```ts
export class FanboxClient {
  public constructor(options: FanboxClientOptions = {}) {}
  public getCreator(params: GetCreatorParams): Promise<Creator> {}
  public listCreatorPlans(params: ListCreatorPlansParams): Promise<Plan[]> {}
  public paginateCreatorPosts(params: PaginateCreatorPostsParams): Promise<string[]> {}
  public listCreatorPosts(params: ListCreatorPostsParams): Promise<PostSummary[]> {}
  public getPost(params: GetPostParams): Promise<Post> {}
}
```

Add query serialization, default headers, response envelope unwrapping, and
exports from `src/index.ts`.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `pnpm exec vitest run src/client.spec.ts`

Expected: PASS.

### Task 2: Authenticated discovery endpoints and errors

**Files:**
- Modify: `src/types.ts`
- Modify: `src/client.ts`
- Modify: `src/client.spec.ts`

- [ ] **Step 1: Write failing tests for discovery calls and errors**

Assert `listFollowingCreators`, `listSupportingPlans`, `listHomePosts`, and
`listSupportingPosts` call the correct GET paths. Assert post-list pagination
omits unset values and serializes `limit`, `maxPublishedDatetime`, and `maxId`.
Assert a non-2xx response throws `FanboxApiError` with status, status text, and
parsed body.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `pnpm exec vitest run src/client.spec.ts`

Expected: FAIL because authenticated discovery methods and structured errors do
not exist.

- [ ] **Step 3: Add discovery methods and structured errors**

Implement:

```ts
public listFollowingCreators(): Promise<CreatorSummary[]> {}
public listSupportingPlans(): Promise<SupportingPlan[]> {}
public listHomePosts(params: ListPostsParams = {}): Promise<PostSummary[]> {}
public listSupportingPosts(params: ListPostsParams = {}): Promise<PostSummary[]> {}
```

Add `FanboxApiError` and reuse the common request method.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `pnpm exec vitest run src/client.spec.ts`

Expected: PASS.

### Task 3: Downloader-facing documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace template usage documentation**

Document cookie injection, creator discovery, creator pagination, post detail
retrieval, and the read-only SDK scope. Include an ESM example:

```ts
const fanbox = new FanboxClient({
  cookie: `FANBOXSESSID=${process.env.FANBOX_SESSION_ID}`,
});

const creators = await fanbox.listFollowingCreators();
const pageUrls = await fanbox.paginateCreatorPosts({
  creatorId: creators[0].creatorId,
});
```

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm test
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run build
```

Expected: all commands exit successfully.
