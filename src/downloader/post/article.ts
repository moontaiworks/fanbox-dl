import type {
  ArticleBlock,
  ArticleEmbedBlock,
  ArticleFileBlock,
  ArticleHeaderBlock,
  ArticleImageBlock,
  ArticleParagraphBlock,
  ArticleUrlEmbedBlock,
} from "../../client/models/post/article.js";
import type { ArticlePost } from "../../client/types.js";
import type { Content } from "./content.js";
import { FileContent, ImageContent, TextContent } from "./content.js";
import { handleEmbedBlock } from "./embed.js";
import { handleUrlEmbedBlock } from "./url-embed.js";

interface TypeMap {
  embed: ArticleEmbedBlock;
  file: ArticleFileBlock;
  header: ArticleHeaderBlock;
  image: ArticleImageBlock;
  p: ArticleParagraphBlock;
  url_embed: ArticleUrlEmbedBlock;
}

export function formatArticleContents(post: ArticlePost): Content[] {
  return post.body.blocks
    .map((block) => formatArticleBlock(post, block))
    .filter(isContent);
}

function formatArticleBlock(
  post: ArticlePost,
  block: ArticleBlock,
): Content | null {
  if (isArticleBlockType("image", block)) {
    const image = post.body.imageMap[block.imageId];
    return new ImageContent(image);
  }

  if (isArticleBlockType("file", block)) {
    const file = post.body.fileMap[block.fileId];
    return new FileContent(file);
  }

  if (isArticleBlockType("url_embed", block)) {
    return handleUrlEmbedBlock(block, post.body.urlEmbedMap);
  }

  if (isArticleBlockType("embed", block)) {
    return handleEmbedBlock(block, post.body.embedMap);
  }

  if (isArticleBlockType("p", block) || isArticleBlockType("header", block)) {
    return new TextContent(block);
  }

  // TODO: warn unknown article block type
  return null;
}

function isArticleBlockType<T extends keyof TypeMap>(
  type: T,
  item: ArticleBlock,
): item is TypeMap[T] {
  return item.type === type;
}

function isContent(content: Content | null): content is Content {
  return content !== null;
}
