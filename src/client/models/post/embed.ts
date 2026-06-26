export type ArticleEmbedItem = ArticleEmbedKnownItem | ArticleEmbedUnknownItem;
export type ArticleEmbedKnownItem = ArticleEmbedTwitterItem;

export interface ArticleEmbedTwitterItem {
  contentId: string;
  id: string;
  serviceProvider: "twitter";
}

export interface ArticleEmbedUnknownItem {
  id: string;
  serviceProvider: string & {};
}
