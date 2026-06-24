import type { FanboxClient } from "../client.js";
import type { PostListParams, PostSummary } from "../models/post.js";

export type ListSupportingPostsParams = PostListParams;

export type ListSupportingPostsResult = PostSummary[];

/**
 * List all posts from the home feed from supporting creators only. This
 * endpoint is only available to logged-in users.
 */
export async function listSupportingPosts(
  this: FanboxClient,
  params: ListSupportingPostsParams = {},
): Promise<ListSupportingPostsResult> {
  return this.get("post.listSupporting", params);
}
