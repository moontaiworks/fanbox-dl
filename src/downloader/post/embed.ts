import type { ArticleEmbedBlock } from "../../client/models/post/article.js";
import type {
  ArticleEmbedItem,
  ArticleEmbedTwitterItem,
} from "../../client/models/post/embed.js";
import { TextContent } from "./content.js";

interface TypeMap {
  twitter: ArticleEmbedTwitterItem;
}

export function handleEmbedBlock(
  block: ArticleEmbedBlock,
  embedMap: Record<string, ArticleEmbedItem>,
) {
  const item = embedMap[block.embedId];

  if (isEmbedType("twitter", item))
    return new TextContent({ text: `https://x.com/${item.contentId}` });

  // TODO: warn unknown embed type
  return null;
}

function isEmbedType<T extends keyof TypeMap>(
  type: T,
  item: ArticleEmbedItem,
): item is TypeMap[T] {
  return item.serviceProvider === type;
}
