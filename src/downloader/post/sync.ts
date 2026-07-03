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

type DownloadResult =
  | {
      bytes: number;
      failed: false;
      sha256: string;
    }
  | {
      error: unknown;
      failed: true;
    };
interface PreSyncPostCheckDeps {
  logger: Logger;
  manifest: CreatorManifest;
}

interface ProcessContentDeps extends SyncPostDeps {
  post: Post;
}

interface ProcessContentOptions {
  content: Content;
  indexPadded: string;
}

interface ProcessedContent {
  assets?: [string, AssetManifestData][];
  failed?: boolean;
  markdown?: string;
  unknown?: boolean;
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

  const totalDigits = contents.length.toString().length;
  const results = await Promise.allSettled(
    contents.map((content, index) =>
      processContent(
        { headers, logger, pathManager, post, transport },
        { content, indexPadded: index.toString().padStart(totalDigits, "0") },
      ),
    ),
  );
  const hasRejectedContent = results.some(
    (result) => result.status === "rejected",
  );
  const fulfilled = fulfilledResults(results);
  const hasUnknownContent = fulfilled.some((result) => result.unknown);
  const hasFailedContent = fulfilled.some((result) => result.failed);
  const assetManifestData = collectAssetManifestData(fulfilled);
  const markdownContent = formatMarkdownContent(results);

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
    status:
      hasUnknownContent || hasFailedContent || hasRejectedContent
        ? "partial"
        : "complete",
    updatedDatetime: post.updatedDatetime,
  };
}

function collectAssetManifestData(
  contents: ProcessedContent[],
): Record<string, AssetManifestData> {
  return Object.fromEntries(
    contents.flatMap((content) => content.assets ?? []),
  );
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

function formatMarkdownContent(
  results: PromiseSettledResult<ProcessedContent>[],
): (string | undefined)[] {
  return results.map((result) => {
    if (result.status === "fulfilled") {
      return result.value.markdown;
    }

    const err = String(result.reason);
    return `<!-- Error occurred while processing content: ${err} -->`;
  });
}

function formatMediaAsset(content: MediaContent, destination: string) {
  if (content instanceof ImageContent) {
    return formatImageAsset({ assetPath: destination });
  }

  return formatFileAsset({ assetPath: destination });
}

function fulfilledResults(
  results: PromiseSettledResult<ProcessedContent>[],
): ProcessedContent[] {
  return results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
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

async function processContent(
  { headers, logger, pathManager, post, transport }: ProcessContentDeps,
  { content, indexPadded }: ProcessContentOptions,
): Promise<ProcessedContent> {
  if (isMediaContent(content)) {
    return syncMediaContent(
      { headers, logger, pathManager, transport },
      {
        content,
        fallbackDateTime: post.updatedDatetime,
        indexPadded,
      },
    );
  }

  if (content instanceof TextContent) {
    return { markdown: formatTextContent(content) };
  }

  logger.warn(
    `Post ${post.id} has unhandled content type ${content.type}, skipping.`,
  );
  return { unknown: true };
}

async function syncMediaContent(
  {
    headers,
    logger,
    pathManager,
    transport,
  }: {
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
  const downloadResult: DownloadResult = await downloadAsset(
    { headers, logger, transport },
    {
      destination,
      fallbackDateTime,
      mediaContent: content,
    },
  )
    .then(({ bytes, sha256 }) => ({ bytes, failed: false, sha256 }) as const)
    .catch((err: unknown) => {
      logger.error(
        { err },
        `Error occurred while downloading ${content.type} asset ${content.id}, skipping.`,
      );

      return { error: err, failed: true } as const;
    });

  if (downloadResult.failed) {
    return {
      assets: [
        [
          content.id,
          {
            path: destination,
            status: "failed",
            url: content.url,
          },
        ],
      ],
      failed: true,
      markdown: `<!-- Error occurred while processing content: ${String(downloadResult.error)} -->`,
    } satisfies ProcessedContent;
  }

  return {
    assets: [
      [
        content.id,
        {
          bytes: downloadResult.bytes,
          path: destination,
          sha256: downloadResult.sha256,
          status: "complete",
          url: content.url,
        },
      ],
    ],
    markdown: formatMediaAsset(content, destination),
  } satisfies ProcessedContent;
}
