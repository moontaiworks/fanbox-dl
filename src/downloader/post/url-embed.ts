import type { ArticleUrlEmbedBlock } from "../../client/models/post/article.js";
import type {
  ArticleUrlEmbedHtmlItem,
  ArticleUrlEmbedItem,
} from "../../client/models/post/url-embed.js";
import { TextContent } from "./content.js";

interface TypeMap {
  twitter: ArticleUrlEmbedHtmlItem;
}

export function handleUrlEmbedBlock(
  block: ArticleUrlEmbedBlock,
  urlEmbedMap: Record<string, ArticleUrlEmbedItem>,
) {
  const item = urlEmbedMap[block.urlEmbedId];

  if (isUrlEmbedType("twitter", item))
    return new TextContent({ text: item.html });

  // TODO: warn unknown url embed type
  return null;
}

function isUrlEmbedType<T extends keyof TypeMap>(
  type: T,
  item: ArticleUrlEmbedItem,
): item is TypeMap[T] {
  return item.type === type;
}
