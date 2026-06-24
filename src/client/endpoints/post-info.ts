import type { FanboxClient } from "../client.js";
import type { Post } from "../models/post.js";

export interface GetPostParams {
  postId: string;
}

export type GetPostResult = Post;

/**
 * Get detailed information about a specific post.
 */
export async function getPost(
  this: FanboxClient,
  params: GetPostParams,
): Promise<GetPostResult> {
  return this.get("post.info", params);
}
