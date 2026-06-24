import type { FanboxClient } from "../client.js";
import type { PostSort } from "../models/post.js";

export interface PaginateCreatorPostsParams {
  creatorId: string;
  sort?: PostSort;
}

export type PaginateCreatorPostsResult = string[];

/**
 * List all urls to the pages, which paginated by the given conditions.
 */
export async function paginateCreatorPosts(
  this: FanboxClient,
  params: PaginateCreatorPostsParams,
): Promise<PaginateCreatorPostsResult> {
  return this.get("post.paginateCreator", params);
}
