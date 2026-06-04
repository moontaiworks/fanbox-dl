import type { PostListParams, PostSummary } from "./models/post.js";

export const POST_LIST_HOME_PATH = "post.listHome";

export type ListHomePostsParams = PostListParams;

export type ListHomePostsResult = PostSummary[];
