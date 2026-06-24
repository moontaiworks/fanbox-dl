import type { Post } from "../models/post.js";

export const POST_INFO_PATH = "post.info";

export interface GetPostParams {
  postId: string;
}

export type GetPostResult = Post;
