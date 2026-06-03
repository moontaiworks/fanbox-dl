import type {
  ArticlePost,
  FilePost,
  ImagePost,
  Post,
  TextPost,
  VideoPost,
} from "../types.js";

export type AssetPathMap = ReadonlyMap<string, string>;

export function renderPostMarkdown(post: Post, paths: AssetPathMap): string {
  let content: string;
  switch (post.type) {
    case "article":
      content = renderArticle(post as ArticlePost, paths);
      break;
    case "file": {
      const filePost = post as FilePost;
      content = [
        filePost.body.text,
        ...filePost.body.files.map(
          (file) => `[${file.name}](${assetLink(paths, `file:${file.id}`)})`,
        ),
      ].join("\n\n");
      break;
    }
    case "image": {
      const imagePost = post as ImagePost;
      content = [
        imagePost.body.text,
        ...imagePost.body.images.map(
          (image) => `![${image.id}](${assetLink(paths, `image:${image.id}`)})`,
        ),
      ].join("\n\n");
      break;
    }
    case "text":
      content = (post as TextPost).body.text;
      break;
    case "video": {
      const videoPost = post as VideoPost;
      content = `${videoPost.body.text}\n\n${videoPost.body.video.serviceProvider}: ${videoPost.body.video.videoId}`;
      break;
    }
    default:
      content = `[unsupported post type: ${post.type}]`;
  }

  return `# ${post.title}\n\n${content.trim()}\n`;
}

function assetLink(paths: AssetPathMap, key: string): string {
  return paths.get(key) ?? `[missing asset: ${key}]`;
}

function renderArticle(post: ArticlePost, paths: AssetPathMap): string {
  return post.body.blocks
    .map((block) => {
      switch (block.type) {
        case "file":
          return `[${String(block.fileId)}](${assetLink(paths, `file:${String(block.fileId)}`)})`;
        case "header":
          return `# ${String(block.text)}`;
        case "image":
          return `![${String(block.imageId)}](${assetLink(paths, `image:${String(block.imageId)}`)})`;
        case "p":
          return String(block.text);
        case "url_embed":
          return String(
            post.body.urlEmbedMap[String(block.urlEmbedId)] ?? block.urlEmbedId,
          );
        default:
          return `[unsupported block: ${block.type}]`;
      }
    })
    .join("\n\n");
}
