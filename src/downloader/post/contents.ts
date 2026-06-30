import type { Logger } from "pino";

import type {
  ArticlePost,
  FilePost,
  ImagePost,
  Post,
  TextPost,
  VideoPost,
} from "../../client/models/post.js";
import { formatArticleContents } from "./article.js";
import type { Content } from "./content.js";
import {
  FileContent,
  ImageContent,
  TextContent,
  UnknownContent,
} from "./content.js";

interface FormatPostContentsDeps {
  logger: Logger;
}

interface TypeMap {
  article: ArticlePost;
  file: FilePost;
  image: ImagePost;
  text: TextPost;
  video: VideoPost;
}

export function formatPostContents(
  { logger }: FormatPostContentsDeps,
  post: Post,
): Content[] {
  if (isPostType("image", post)) {
    const assets = post.body.images.map((image) => new ImageContent(image));

    if (post.body.text) return [...assets, new TextContent(post.body)];
    return assets;
  }

  if (isPostType("file", post)) {
    const assets = post.body.files.map((file) => new FileContent(file));

    if (post.body.text) return [...assets, new TextContent(post.body)];
    return assets;
  }

  if (isPostType("video", post)) {
    logger.warn(
      `Post ${post.id} has unknown video provider ${post.body.video.serviceProvider}, skipping video content.`,
    );
    const assets = [new UnknownContent(post.body.video)];

    if (post.body.text) return [...assets, new TextContent(post.body)];
    return assets;
  }

  if (isPostType("text", post)) return [new TextContent(post.body)];

  if (isPostType("article", post)) return formatArticleContents(post);

  logger.warn(`Post ${post.id} has unknown type ${post.type}, skipping.`);
  return [new UnknownContent(post.body)];
}

function isPostType<T extends keyof TypeMap>(
  type: T,
  post: Post,
): post is TypeMap[T] {
  return post.type === type;
}
