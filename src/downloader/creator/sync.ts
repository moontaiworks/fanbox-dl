import type { Logger } from "pino";

import type { FanboxClient } from "../../client/client.js";
import type { HttpTransport } from "../../transport/http2.js";
import type { PathManager } from "../fs/path-manager.js";
import type { CreatorManifest, PostManifestData } from "../manifest/creator.js";
import { preSyncPostCheck, syncPost } from "../post/sync.js";
import { discoverCreatorPosts } from "./discover-posts.js";

interface PostManifestSource {
  id: string;
  isRestricted: boolean;
  updatedDatetime: string;
}

interface SyncCreatorDeps {
  client: FanboxClient;
  headers?: Record<string, string>;
  logger: Logger;
  manifest: CreatorManifest;
  pathManager: PathManager;
  transport: HttpTransport;
  verify?: boolean;
}

export async function syncCreator({
  client,
  headers,
  logger,
  manifest,
  pathManager,
  transport,
  verify = false,
}: SyncCreatorDeps) {
  const postSummaries = await discoverCreatorPosts(
    { client, logger },
    { creatorId: manifest.creatorId },
  );
  logger.info(
    `Discovered total ${postSummaries.length} posts for creator ${manifest.creatorId}`,
  );

  const processingPosts: Promise<void>[] = [];

  for (const [index, postSummary] of postSummaries.entries()) {
    const postIndex = index + 1;
    logger.debug(
      `Initializing ${postIndex}/${postSummaries.length} post ${postSummary.id} for creator ${manifest.creatorId}`,
    );
    const preCheckResult = await preSyncPostCheck(
      { logger, manifest, verify },
      postSummary,
    );

    if (
      preCheckResult.status === "complete" ||
      preCheckResult.status === "skipped"
    ) {
      manifest.posts[postSummary.id] = preCheckResult;
      continue;
    }

    // if we should download, start it but not await it yet, so we can do
    // multiple downloads in parallel.

    const postPathManager = pathManager.post(postSummary);
    const post = await client
      .getPost({ postId: postSummary.id })
      .catch(async (err: unknown) => {
        logger.error(
          { err },
          `Error occurred while fetch post manifest of ${postIndex}/${postSummaries.length} post ${postSummary.id}, skipping.`,
        );
        await saveFailedPostManifest(manifest, postSummary, err);
      });
    if (!post) continue;

    const syncPostPromise = syncPost(
      { headers, logger, pathManager: postPathManager, transport },
      post,
    )
      .then(async (result) => {
        manifest.posts[postSummary.id] = result;
        return manifest.save();
      })
      .catch((err: unknown) => {
        logger.error(
          { err },
          `Error occurred while syncing ${postIndex}/${postSummaries.length} post ${postSummary.id}, skipping.`,
        );
        return saveFailedPostManifest(manifest, postSummary, err);
      });

    processingPosts.push(syncPostPromise);
  }

  logger.info(
    `All ${postSummaries.length} posts of creator ${manifest.creatorId} have been initialized for sync, waiting for all to complete...`,
  );

  await Promise.all(processingPosts);
}

function failedPostManifestData(
  postSummary: PostManifestSource,
  err: unknown,
): PostManifestData {
  return {
    assets: {},
    error: String(err),
    id: postSummary.id,
    restricted: postSummary.isRestricted,
    status: "failed",
    updatedDatetime: postSummary.updatedDatetime,
  };
}

async function saveFailedPostManifest(
  manifest: CreatorManifest,
  postSummary: PostManifestSource,
  err: unknown,
): Promise<void> {
  manifest.posts[postSummary.id] = failedPostManifestData(postSummary, err);
  await manifest.save();
}
