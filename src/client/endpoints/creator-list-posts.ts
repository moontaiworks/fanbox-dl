import type { FanboxClient } from "../client.js";
import type { PostListParams, PostSort, PostSummary } from "../models/post.js";

export interface ListCreatorPostsParams extends PostListParams {
  creatorId: string;
  firstId?: string;
  firstPublishedDatetime?: string;
  sort?: PostSort;
}

export type ListCreatorPostsResult = PostSummary[];

/**
 * List posts for a specific creator.
 */
export async function listCreatorPosts(
  this: FanboxClient,
  params: ListCreatorPostsParams,
): Promise<ListCreatorPostsResult> {
  return this.get("post.listCreator", params);
}
