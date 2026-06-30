import { writeFile } from "node:fs/promises";
import { extname } from "node:path";

import type { Logger } from "pino";

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
  logger: Logger;
  manifest: CreatorManifest;
  pathManager: PathManager;
  transport: HttpTransport;
}

export async function syncPost(
  { client, headers, logger, manifest, pathManager, transport }: SyncPostDeps,
  postSummary: PostSummary,
): Promise<PostManifestData> {
  if (postSummary.isRestricted) {
    // Not available for download, skip
    logger.warn(`Post ${postSummary.id} is restricted, skipping download.`);
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
    logger.debug(`Post ${postSummary.id} has no changes, skipping download.`);
    return existingPost;
  }

  // need to download or update the local copy of the post
  logger.debug(
    `Downloading post ${postSummary.id} updated at ${postSummary.updatedDatetime}: ${postSummary.title}`,
  );
  const post = await client.getPost({ postId: postSummary.id });
  const contents = formatPostContents({ logger }, post);
  if (post.coverImageUrl) contents.unshift(formatCoverImage(post));

  let hasUnknownContent = false;
  const assetManifestData: Record<string, AssetManifestData> = {};
  const download = downloadAsset.bind(undefined, {
    headers,
    logger,
    transport,
  });

  const totalDigits = contents.length.toString().length;
  const results = await Promise.allSettled(
    contents.map(async (content, index) => {
      const indexPadded = index.toString().padStart(totalDigits, "0");

      if (content instanceof ImageContent) {
        const destination = pathManager.asset(
          indexPadded,
          content.id,
          content.extension,
        );

        const { bytes, sha256 } = await download({
          destination,
          fallbackDateTime: post.updatedDatetime,
          mediaContent: content,
        }).catch((err: unknown) => {
          logger.error(
            { err },
            `Error occurred while downloading image asset ${content.id}, skipping.`,
          );

          assetManifestData[content.id] = {
            path: destination,
            status: "failed",
            url: content.url,
          };

          throw err;
        });

        assetManifestData[content.id] = {
          bytes,
          path: destination,
          sha256,
          status: "complete",
          url: content.url,
        };

        return formatImageAsset({
          assetPath: pathManager.path,
          contentPath: destination,
        });
      }

      if (content instanceof FileContent) {
        const destination = pathManager.asset(
          indexPadded,
          `${content.name}-${content.id}`,
          content.extension,
        );

        const { bytes, sha256 } = await download({
          destination,
          fallbackDateTime: post.updatedDatetime,
          mediaContent: content,
        }).catch((err: unknown) => {
          logger.error(
            { err },
            `Error occurred while downloading file asset ${content.id}, skipping.`,
          );

          assetManifestData[content.id] = {
            path: destination,
            status: "failed",
            url: content.url,
          };

          throw err;
        });

        assetManifestData[content.id] = {
          bytes,
          path: destination,
          sha256,
          status: "complete",
          url: content.url,
        };

        return formatFileAsset({
          assetPath: pathManager.path,
          contentPath: destination,
        });
      }

      if (content instanceof TextContent) {
        return formatTextContent(content);
      }

      logger.warn(
        `Post ${post.id} has unhandled content type ${content.type}, skipping.`,
      );
      hasUnknownContent = true;
    }),
  );

  const markdownContent = results.map((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    const err = String(result.reason);
    return `<!-- Error occurred while processing content: ${err} -->`;
  });

  await writeFile(
    pathManager.asset("0".padStart(totalDigits, "0"), "content", "md"),
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
