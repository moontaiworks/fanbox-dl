import type {
  ListCreatorPostsParams,
  PaginateCreatorPostsParams,
  PostSummary,
} from "../types.js";
import { logDebugErrorResponse } from "./errors.js";
import { logger } from "./logger.js";

const DEFAULT_PAGE_SIZE = 300;

export interface CreatorPostClient {
  listCreatorPosts(params: ListCreatorPostsParams): Promise<PostSummary[]>;
  paginateCreatorPosts(params: PaginateCreatorPostsParams): Promise<string[]>;
}

export interface DiscoverCreatorPostsOptions {
  pageSize?: number;
}

export async function discoverCreatorPosts(
  client: CreatorPostClient,
  creatorId: string,
  { pageSize = DEFAULT_PAGE_SIZE }: DiscoverCreatorPostsOptions = {},
): Promise<PostSummary[]> {
  const found = new Map<string, PostSummary>();
  let cursor: ListCreatorPostsParams = {
    creatorId,
    limit: pageSize,
    sort: "newest",
  };

  for (;;) {
    let page: PostSummary[];
    try {
      page = await client.listCreatorPosts(cursor);
    } catch (error) {
      logDebugErrorResponse(logger, error, { creatorId });
      logger.warn(
        "post.discovery.fallback",
        "Direct cursor failed; using paginateCreator",
        {
          creatorId,
          error: String(error),
        },
      );
      await fallbackPaginate(client, creatorId, found);
      break;
    }
    const added = addPosts(page, found);
    if (page.length < pageSize) {
      break;
    }
    if (added === 0) {
      logger.warn(
        "post.discovery.fallback",
        "Direct cursor made no progress; using paginateCreator",
        {
          creatorId,
        },
      );
      await fallbackPaginate(client, creatorId, found);
      break;
    }
    const last = page.at(-1)!;
    cursor = {
      creatorId,
      firstId: last.id,
      firstPublishedDatetime: last.publishedDatetime,
      limit: pageSize,
      sort: "newest",
    };
  }

  return [...found.values()];
}

function addPosts(
  posts: PostSummary[],
  found: Map<string, PostSummary>,
): number {
  let added = 0;
  for (const post of posts) {
    if (!found.has(post.id)) {
      added += 1;
      found.set(post.id, post);
    }
  }

  return added;
}

function cursorFromUrl(url: string): ListCreatorPostsParams | undefined {
  const parsed = new URL(url);
  const creatorId = parsed.searchParams.get("creatorId");
  if (!creatorId) {
    return undefined;
  }

  return {
    creatorId,
    firstId: parsed.searchParams.get("firstId") ?? undefined,
    firstPublishedDatetime:
      parsed.searchParams.get("firstPublishedDatetime") ?? undefined,
    limit: Number(parsed.searchParams.get("limit") ?? DEFAULT_PAGE_SIZE),
    sort: "newest",
  };
}

async function fallbackPaginate(
  client: CreatorPostClient,
  creatorId: string,
  found: Map<string, PostSummary>,
): Promise<void> {
  for (const url of await client.paginateCreatorPosts({
    creatorId,
    sort: "newest",
  })) {
    const cursor = cursorFromUrl(url);
    if (cursor) {
      addPosts(await client.listCreatorPosts(cursor), found);
    }
  }
}
