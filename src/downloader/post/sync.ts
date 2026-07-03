import { writeFile } from "node:fs/promises";
import { extname } from "node:path";

import type { Logger } from "pino";

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
import type { Content, MediaContent } from "./content.js";
import { formatPostContents } from "./contents.js";

interface PreSyncPostCheckDeps {
  logger: Logger;
  manifest: CreatorManifest;
}
interface SyncPostDeps {
  headers?: Record<string, string>;
  logger: Logger;
  pathManager: PathManager;
  transport: HttpTransport;
}

export function preSyncPostCheck(
  { logger, manifest }: PreSyncPostCheckDeps,
  postSummary: PostSummary,
): PostManifestData {
  if (postSummary.isRestricted) {
    // Not available for download, skip
    logger.debug(`Post ${postSummary.id} is restricted, skipping download.`);
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

  return {
    assets: {},
    id: postSummary.id,
    restricted: false,
    status: "pending",
    updatedDatetime: postSummary.updatedDatetime,
  };
}

export async function syncPost(
  { headers, logger, pathManager, transport }: SyncPostDeps,
  post: Post,
): Promise<PostManifestData> {
  logger.info(
    `Downloading post ${post.id} updated at ${post.updatedDatetime} of creator ${post.creatorId}: ${post.title}`,
  );
  const contents = formatPostContents({ logger }, post);
  if (post.coverImageUrl) contents.unshift(formatCoverImage(post));

  let hasUnknownContent = false;
  const assetManifestData: Record<string, AssetManifestData> = {};

  const totalDigits = contents.length.toString().length;
  const results = await Promise.allSettled(
    contents.map(async (content, index) => {
      const indexPadded = index.toString().padStart(totalDigits, "0");

      if (isMediaContent(content)) {
        return syncMediaContent(
          { assetManifestData, headers, logger, pathManager, transport },
          {
            content,
            fallbackDateTime: post.updatedDatetime,
            indexPadded,
          },
        );
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
  const hasFailedContent = results.some(
    (result) => result.status === "rejected",
  );

  const markdownContent = results.map((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    const err = String(result.reason);
    return `<!-- Error occurred while processing content: ${err} -->`;
  });

  await writeFile(
    pathManager.asset(
      [
        { context: "0".padStart(totalDigits, "0"), required: true },
        { context: "content", required: true },
      ],
      "md",
    ),
    markdownContent.join("\n\n"),
  );

  return {
    assets: assetManifestData,
    id: post.id,
    restricted: false,
    // false positive
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    status: hasUnknownContent || hasFailedContent ? "partial" : "complete",
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

function formatMediaAsset(content: MediaContent, destination: string) {
  if (content instanceof ImageContent) {
    return formatImageAsset({ assetPath: destination });
  }

  return formatFileAsset({ assetPath: destination });
}

function isMediaContent(
  content: Content,
): content is FileContent | ImageContent {
  return content instanceof FileContent || content instanceof ImageContent;
}

function mediaAssetSegments(content: MediaContent, indexPadded: string) {
  if (content instanceof FileContent) {
    return [
      { context: indexPadded, required: true },
      { context: content.name, required: false },
      { context: content.id, required: true },
    ];
  }

  return [
    { context: indexPadded, required: true },
    { context: content.id, required: true },
  ];
}

async function syncMediaContent(
  {
    assetManifestData,
    headers,
    logger,
    pathManager,
    transport,
  }: {
    assetManifestData: Record<string, AssetManifestData>;
    headers?: Record<string, string>;
    logger: Logger;
    pathManager: PathManager;
    transport: HttpTransport;
  },
  {
    content,
    fallbackDateTime,
    indexPadded,
  }: {
    content: FileContent | ImageContent;
    fallbackDateTime: string;
    indexPadded: string;
  },
) {
  const destination = pathManager.asset(
    mediaAssetSegments(content, indexPadded),
    content.extension,
  );
  const { bytes, sha256 } = await downloadAsset(
    { headers, logger, transport },
    {
      destination,
      fallbackDateTime,
      mediaContent: content,
    },
  ).catch((err: unknown) => {
    logger.error(
      { err },
      `Error occurred while downloading ${content.type} asset ${content.id}, skipping.`,
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

  return formatMediaAsset(content, destination);
}
