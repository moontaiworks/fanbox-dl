import type { Logger } from "pino";

import type { FanboxClient } from "../../client/client.js";
import type { HttpTransport } from "../../transport/http2.js";
import type { PathManager } from "../fs/path-manager.js";
import type { CreatorManifest, PostManifestData } from "../manifest/creator.js";
import { preSyncPostCheck, syncPost } from "../post/sync.js";
import { discoverCreatorPosts } from "./discover-posts.js";

interface SyncCreatorDeps {
  client: FanboxClient;
  headers?: Record<string, string>;
  logger: Logger;
  manifest: CreatorManifest;
  pathManager: PathManager;
  transport: HttpTransport;
}

export async function syncCreator({
  client,
  headers,
  logger,
  manifest,
  pathManager,
  transport,
}: SyncCreatorDeps) {
  const postSummaries = await discoverCreatorPosts(
    { client, logger },
    { creatorId: manifest.creatorId },
  );
  logger.info(
    `Discovered total ${postSummaries.length} posts for creator ${manifest.creatorId}`,
  );

  const processingPosts: Promise<void>[] = [];

  let index = 0;
  for (const postSummary of postSummaries) {
    logger.debug(
      `Initializing ${++index}/${postSummaries.length} post ${postSummary.id} for creator ${manifest.creatorId}`,
    );
    const preCheckResult = preSyncPostCheck({ logger, manifest }, postSummary);
    if (preCheckResult.status !== "pending") {
      manifest.posts[postSummary.id] = preCheckResult;
      continue;
    }

    // if we should download, start it but not await it yet, so we can do
    // multiple downloads in parallel.

    const postPathManager = pathManager.post(postSummary);
    const post = await client
      .getPost({ postId: postSummary.id })
      .catch(async (err: unknown) => {
        manifest.posts[postSummary.id] = {
          assets: {},
          error: String(err),
          id: postSummary.id,
          restricted: postSummary.isRestricted,
          status: "failed",
          updatedDatetime: postSummary.updatedDatetime,
        } satisfies PostManifestData;
        logger.error(
          { err },
          `Error occurred while syncing ${index}/${postSummaries.length} post ${postSummary.id}, skipping.`,
        );
        await manifest.save();
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
        manifest.posts[postSummary.id] = {
          assets: {},
          error: String(err),
          id: postSummary.id,
          restricted: postSummary.isRestricted,
          status: "failed",
          updatedDatetime: postSummary.updatedDatetime,
        } satisfies PostManifestData;
        logger.error(
          { err },
          `Error occurred while syncing ${index}/${postSummaries.length} post ${postSummary.id}, skipping.`,
        );
        return manifest.save();
      });

    processingPosts.push(syncPostPromise);
  }

  await Promise.all(processingPosts);
}
