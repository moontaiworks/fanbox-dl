export interface ArticleUrlEmbedHtmlItem {
  html: string;
  id: string;
  type: "html";
}

export type ArticleUrlEmbedItem =
  | ArticleUrlEmbedKnownItem
  | ArticleUrlEmbedUnknownItem;

export type ArticleUrlEmbedKnownItem = ArticleUrlEmbedHtmlItem;

export interface ArticleUrlEmbedUnknownItem {
  [key: string]: unknown;
  id: string;
  type: string & {};
}
