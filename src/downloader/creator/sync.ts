import type { Logger } from "pino";

import type { FanboxClient } from "../../client/client.js";
import type { HttpTransport } from "../../transport/http2.js";
import type { PathManager } from "../fs/path-manager.js";
import type { CreatorManifest, PostManifestData } from "../manifest/creator.js";
import { syncPost } from "../post/sync.js";
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
  logger.debug(
    `Discovered total ${postSummaries.length} posts for creator ${manifest.creatorId}`,
  );

  let index = 0;
  for (const postSummary of postSummaries) {
    logger.debug(
      `Syncing ${++index}/${postSummaries.length} post ${postSummary.id} for creator ${manifest.creatorId}`,
    );
    const postPathManager = pathManager.post(postSummary);
    manifest.posts[postSummary.id] = await syncPost(
      {
        client,
        headers,
        logger,
        manifest,
        pathManager: postPathManager,
        transport,
      },
      postSummary,
    ).catch((err: unknown): PostManifestData => {
      const manifest = {
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
      return manifest;
    });
  }
}
