import type { FanboxClient } from "../client.js";
import type { PostListParams, PostSummary } from "../models/post.js";

export type ListHomePostsParams = PostListParams;

export type ListHomePostsResult = PostSummary[];

/**
 * List all posts from the home feed from both following and supporting
 * creators. This endpoint is only available to logged-in users.
 */
export async function listHomePosts(
  this: FanboxClient,
  params: ListHomePostsParams = {},
): Promise<ListHomePostsResult> {
  return this.get("post.listHome", params);
}
