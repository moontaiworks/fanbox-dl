import type { PostListParams, PostSummary } from "../models/post.js";

export const POST_LIST_SUPPORTING_PATH = "post.listSupporting";

export type ListSupportingPostsParams = PostListParams;

export type ListSupportingPostsResult = PostSummary[];
