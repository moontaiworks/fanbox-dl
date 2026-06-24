import type { PostListParams, PostSort, PostSummary } from "../models/post.js";

export const POST_LIST_CREATOR_PATH = "post.listCreator";

export interface ListCreatorPostsParams extends PostListParams {
  creatorId: string;
  firstId?: string;
  firstPublishedDatetime?: string;
  sort?: PostSort;
}

export type ListCreatorPostsResult = PostSummary[];
