import type { PostFile, PostImage } from "./asset.js";

export type ArticleBlock = ArticleUnknownBlock | KnownArticleBlock;

export interface ArticleEmbedBlock {
  embedId: string;
  type: "embed";
}

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

export interface ArticlePostBody {
  blocks: ArticleBlock[];
  embedMap: Record<string, ArticleEmbedItem>;
  fileMap: Record<string, PostFile>;
  imageMap: Record<string, PostImage>;
  urlEmbedMap: Record<string, ArticleUrlEmbedItem>;
}

export interface ArticleUnknownBlock {
  [key: string]: unknown;
  type: string & {};
}

export interface ArticleUrlEmbedBlock {
  type: "url_embed";
  urlEmbedId: string;
}

export type KnownArticleBlock =
  | ArticleEmbedBlock
  | ArticleFileBlock
  | ArticleHeaderBlock
  | ArticleImageBlock
  | ArticleParagraphBlock
  | ArticleUrlEmbedBlock;

type ArticleEmbedItem = ArticleEmbedTwitterItem;

interface ArticleEmbedTwitterItem {
  contentId: string;
  id: string;
  serviceProvider: "twitter";
}

interface ArticleUrlEmbedHtmlItem {
  html: string;
  id: string;
  type: "html";
}

type ArticleUrlEmbedItem = ArticleUrlEmbedHtmlItem;
