export type ArticleBlock =
  | ArticleFileBlock
  | ArticleHeaderBlock
  | ArticleImageBlock
  | ArticleParagraphBlock
  | ArticleUnknownBlock
  | ArticleUrlEmbedBlock;

export interface ArticleFileBlock {
  fileId: string;
  type: "file";
}

export interface ArticleHeaderBlock {
  text: string;
  type: "header";
}

export interface ArticleImageBlock {
  imageId: string;
  type: "image";
}

export interface ArticleParagraphBlock {
  text: string;
  type: "p";
}

export interface ArticlePost extends PostBase {
  body: ArticlePostBody;
  type: "article";
}

export interface ArticlePostBody {
  blocks: ArticleBlock[];
  fileMap: Record<string, PostFile>;
  imageMap: Record<string, PostImage>;
  urlEmbedMap: Record<string, unknown>;
}

export interface ArticleUnknownBlock {
  [key: string]: unknown;
  type: string;
}

export interface ArticleUrlEmbedBlock {
  type: "url_embed";
  urlEmbedId: string;
}

export interface Creator {
  category: string;
  coverImageUrl: null | string;
  creatorId: string;
  description: string;
  hasAdultContent: boolean;
  hasBoothShop: boolean;
  hasPublishedPost: boolean;
  isAcceptingRequest: boolean;
  isFollowed: boolean;
  isStopped: boolean;
  isSupported: boolean;
  profileItems: CreatorProfileItem[];
  profileLinks: string[];
  user: FanboxUser;
}

export interface CreatorProfileImage {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  type: "image";
}

export type CreatorProfileItem =
  | CreatorProfileImage
  | CreatorProfileUnknownItem;

export interface CreatorProfileUnknownItem {
  [key: string]: unknown;
  id: string;
  type: string;
}

export interface CreatorSummary {
  creatorId: string;
  description: string;
  hasAdultContent: boolean;
  iconUrl: string;
  isFollowed: boolean;
  isSupported: boolean;
  name: string;
  userId: string;
}

export interface FanboxClientOptions {
  baseUrl?: string;
  cookie?: string;
  fetch?: typeof globalThis.fetch;
}

export interface FanboxEnvelope<T> {
  body: T;
}

export interface FanboxUser {
  iconUrl: string;
  name: string;
  userId: string;
}

export interface FilePost extends PostBase {
  body: FilePostBody;
  type: "file";
}

export interface FilePostBody {
  files: PostFile[];
  text: string;
}

export interface GetCreatorParams {
  creatorId: string;
}

export interface GetPostParams {
  postId: string;
}

export interface ImagePost extends PostBase {
  body: ImagePostBody;
  type: "image";
}

export interface ImagePostBody {
  images: PostImage[];
  text: string;
}

export interface ListCreatorPlansParams {
  creatorId: string;
}

export interface ListCreatorPostsParams extends PostListParams {
  creatorId: string;
  sort?: PostSort;
}

export interface NeighboringPost {
  id: string;
  publishedDatetime: string;
  title: string;
}

export interface PaginateCreatorPostsParams {
  creatorId: string;
  sort?: PostSort;
}

export interface Plan {
  coverImageUrl: null | string;
  creatorId: string;
  description: string;
  fee: number;
  hasAdultContent: boolean;
  id: string;
  paymentMethod: null | string;
  perks: string[];
  title: string;
  user: FanboxUser;
}

export type Post =
  | ArticlePost
  | FilePost
  | ImagePost
  | TextPost
  | UnknownPost
  | VideoPost;

export interface PostCover {
  type: "cover_image" | "post_image";
  url: string;
}

export interface PostFile {
  extension: string;
  id: string;
  name: string;
  size: number;
  url: string;
}

export interface PostImage {
  extension: string;
  height: number;
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  width: number;
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

export interface SupportingPlan extends Plan {
  paymentMethod: string;
}

export interface TextPost extends PostBase {
  body: TextPostBody;
  type: "text";
}

export interface TextPostBody {
  text: string;
}

export interface UnknownPost extends PostBase {
  type: string;
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
