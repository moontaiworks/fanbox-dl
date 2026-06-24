import type { PostSort } from "../models/post.js";

export const POST_PAGINATE_CREATOR_PATH = "post.paginateCreator";

export interface PaginateCreatorPostsParams {
  creatorId: string;
  sort?: PostSort;
}

export type PaginateCreatorPostsResult = string[];
