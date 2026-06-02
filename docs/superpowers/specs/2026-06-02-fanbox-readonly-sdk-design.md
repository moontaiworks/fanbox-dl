# FANBOX Read-only SDK Design

## Goal

Build a TypeScript SDK for the read-only pixivFANBOX API surface needed by a
downloader. The SDK must expose the endpoints captured in the local Postman
collection and the authenticated creator and timeline lists needed to discover
downloadable content.

## Scope

The SDK exposes these GET endpoints:

| Client method | FANBOX endpoint | Purpose |
| --- | --- | --- |
| `getCreator` | `creator.get` | Get creator details |
| `listCreatorPlans` | `plan.listCreator` | List a creator's plans |
| `paginateCreatorPosts` | `post.paginateCreator` | List page URLs for a creator |
| `listCreatorPosts` | `post.listCreator` | List posts for one creator |
| `getPost` | `post.info` | Get full post content |
| `listFollowingCreators` | `creator.listFollowing` | List creators followed by the authenticated account |
| `listSupportingPlans` | `plan.listSupporting` | List plans supported by the authenticated account |
| `listHomePosts` | `post.listHome` | List posts from followed or supported creators |
| `listSupportingPosts` | `post.listSupporting` | List posts from supported creators |

Mutating endpoints such as follow, unfollow, likes, and comments are excluded.
Search, notification, and newsletter endpoints are also excluded because they
are not necessary for the initial downloader workflow.

## API Shape

Export a `FanboxClient` class. The constructor accepts an optional
`FanboxClientOptions` object:

- `cookie`: cookie header value such as `FANBOXSESSID=...`.
- `baseUrl`: API root, defaulting to `https://api.fanbox.cc`.
- `fetch`: injectable fetch-compatible transport for deterministic tests.

Each public method returns the unwrapped FANBOX `body` value rather than the
wire-level `{ body: ... }` envelope. Each method accepts a typed parameter
object where the endpoint has query parameters. Pagination options are shared
between post-list methods.

The HTTP layer always sends `Origin: https://www.fanbox.cc` and
`Referer: https://www.fanbox.cc/`. It sends `Cookie` only when configured.
Non-success HTTP responses throw `FanboxApiError` with the response status,
status text, and parsed response body when available.

## Types

Define explicit reusable response types for:

- creator details, users, profile items, plans, and supporting plans;
- post summaries, post covers, post details, neighboring posts;
- image, file, article, text, and video post bodies;
- article blocks and embedded image, file, and URL maps;
- pagination options and sort order.

The API is unofficial and can add response fields. Types model fields used by a
downloader while allowing post-body variants to preserve unknown properties.

## File Layout

- `src/client.ts`: `FanboxClient`, query serialization, and error handling.
- `src/types.ts`: public request and response types.
- `src/index.ts`: package exports.
- `src/client.spec.ts`: transport-level unit tests with injected fetch.
- `README.md`: short SDK setup and usage example.

## Testing

Use Vitest with an injected fetch function. Tests verify URL construction,
headers, response unwrapping, omission of unset query parameters, pagination
cursor serialization, authenticated creator-list calls, timeline calls, and
structured API errors. No test performs a live request or any mutating
operation.

## Decisions Made During User Absence

- Treat "creator lists" as both followed creators and supported plans. FANBOX
  exposes support relationships through plans rather than a separate creator
  list.
- Add `post.listHome` and `post.listSupporting` because the stated downloader
  use case is discovering content from followed and supported creators.
- Keep the initial SDK read-only. A downloader does not need write operations,
  and the user explicitly prohibited testing operations that may mutate data.
- Accept a caller-provided cookie instead of implementing login. The unofficial
  API uses `FANBOXSESSID`, and handling browser login is outside this SDK's
  focused scope.
