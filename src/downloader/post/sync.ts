import { writeFile } from "node:fs/promises";
import { extname } from "node:path";

import type { FanboxClient } from "../../client/client.js";
import type { Post, PostSummary } from "../../client/types.js";
import type { HttpTransport } from "../../transport/http2.js";
import { downloadAsset } from "../asset/download.js";
import type { PathManager } from "../fs/path-manager.js";
import type {
  AssetManifestData,
  CreatorManifest,
  PostManifestData,
} from "../manifest/creator.js";
import {
  formatFileAsset,
  formatImageAsset,
  formatTextContent,
} from "../markdown/asset.js";
import { FileContent, ImageContent, TextContent } from "./content.js";
import { formatPostContents } from "./contents.js";

interface SyncPostDeps {
  client: FanboxClient;
  headers?: Record<string, string>;
  manifest: CreatorManifest;
  pathManager: PathManager;
  transport: HttpTransport;
}

export async function syncPost(
  { client, headers, manifest, pathManager, transport }: SyncPostDeps,
  postSummary: PostSummary,
): Promise<PostManifestData> {
  if (postSummary.isRestricted) {
    // Not available for download, skip
    return {
      assets: {},
      id: postSummary.id,
      restricted: true,
      status: "skipped",
      updatedDatetime: postSummary.updatedDatetime,
    };
  }
  const existingPost = manifest.posts[postSummary.id];
  if (
    existingPost?.status === "complete" &&
    postSummary.updatedDatetime === existingPost.updatedDatetime
  ) {
    // No changes since last download, skip
    return existingPost;
  }

  // need to download or update the local copy of the post
  const post = await client.getPost({ postId: postSummary.id });
  const contents = formatPostContents(post);
  if (post.coverImageUrl) contents.unshift(formatCoverImage(post));

  let hasUnknownContent = false;
  const assetManifestData: Record<string, AssetManifestData> = {};
  const download = downloadAsset.bind(undefined, {
    headers,
    pathManager,
    transport,
  });

  const markdownContent: string[] = [];

  await Promise.all(
    contents.map(async (content, index) => {
      if (content instanceof ImageContent) {
        const destination = pathManager.asset(
          index,
          content.id,
          content.extension,
        );

        const { bytes, sha256 } = await download({
          destination,
          fallbackDateTime: post.updatedDatetime,
          mediaContent: content,
        });

        assetManifestData[content.id] = {
          bytes,
          path: destination,
          sha256,
          status: "complete",
          url: content.url,
        };

        markdownContent.push(
          formatImageAsset({
            assetPath: pathManager.path,
            contentPath: destination,
          }),
        );
      }

      if (content instanceof FileContent) {
        const destination = pathManager.asset(
          index,
          `${content.name}-${content.id}`,
          content.extension,
        );

        const { bytes, sha256 } = await download({
          destination,
          fallbackDateTime: post.updatedDatetime,
          mediaContent: content,
        });

        assetManifestData[content.id] = {
          bytes,
          path: destination,
          sha256,
          status: "complete",
          url: content.url,
        };

        markdownContent.push(
          formatFileAsset({
            assetPath: pathManager.path,
            contentPath: destination,
          }),
        );
      }

      if (content instanceof TextContent) {
        markdownContent.push(formatTextContent(content));
      }

      // TODO: warn unhandled content types
      hasUnknownContent = true;
    }),
  );

  await writeFile(
    pathManager.asset(0, "content", "md"),
    markdownContent.join("\n\n"),
  );

  return {
    assets: assetManifestData,
    id: post.id,
    restricted: false,
    // false positive
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    status: hasUnknownContent ? "partial" : "complete",
    updatedDatetime: post.updatedDatetime,
  };
}

function formatCoverImage(post: Post): ImageContent {
  if (!post.coverImageUrl) throw new Error("Post does not have a cover image");

  const extension =
    extname(new URL(post.coverImageUrl).pathname).slice(1) || "jpg";

  return new ImageContent({
    extension,
    id: "cover",
    originalUrl: post.coverImageUrl,
  });
}
