import type { ArticlePostBody } from "./post/article.js";
import type { PostFile, PostImage } from "./post/asset.js";
import type { FanboxUser } from "./user.js";

export interface ArticlePost extends PostBase {
  body: ArticlePostBody;
  type: "article";
}

export interface FilePost extends PostBase {
  body: FilePostBody;
  type: "file";
}

export interface FilePostBody {
  files: PostFile[];
  text: string;
}

export interface ImagePost extends PostBase {
  body: ImagePostBody;
  type: "image";
}

export interface ImagePostBody {
  images: PostImage[];
  text: string;
}

export type KnownPost =
  | ArticlePost
  | FilePost
  | ImagePost
  | TextPost
  | VideoPost;

export interface NeighboringPost {
  id: string;
  publishedDatetime: string;
  title: string;
}

export type Post = KnownPost | UnknownPost;

export interface PostCover {
  type: "cover_image" | "post_image";
  url: string;
}

export interface PostListParams {
  limit?: number;
  maxId?: string;
  maxPublishedDatetime?: string;
}

export type PostSort = "newest" | "oldest";

export interface PostSummary {
  commentCount: number;
  cover: null | PostCover;
  creatorId: string;
  excerpt: string;
  feeRequired: number;
  hasAdultContent: boolean;
  id: string;
  isCommentingRestricted: boolean;
  isLiked: boolean;
  isPinned: boolean;
  isRestricted: boolean;
  likeCount: number;
  publishedDatetime: string;
  tags: string[];
  title: string;
  updatedDatetime: string;
  user: FanboxUser;
}

export interface TextPost extends PostBase {
  body: TextPostBody;
  type: "text";
}

export interface TextPostBody {
  text: string;
}

export interface UnknownPost extends PostBase {
  type: string & {};
}

export type UnknownPostBody = Record<string, unknown>;

export interface VideoPost extends PostBase {
  body: VideoPostBody;
  type: "video";
}

export interface VideoPostBody {
  text: string;
  video: {
    serviceProvider: string;
    videoId: string;
  };
}

interface PostBase extends Omit<PostSummary, "cover"> {
  body: unknown;
  coverImageUrl: null | string;
  imageForShare: null | string;
  nextPost: NeighboringPost | null;
  prevPost: NeighboringPost | null;
  type: string;
}
