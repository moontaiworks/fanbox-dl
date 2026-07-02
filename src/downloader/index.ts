import type { Logger } from "pino";

import { FanboxClient } from "../client/client.js";
import { createFanboxRequestHeaders } from "../client/fanbox-headers.js";
import type { HttpTransport } from "../transport/http2.js";
import { RequestWorker } from "../transport/worker.js";
import type { DownloadOptions } from "./cli/options.js";
import { resolveCreatorIds } from "./cli/resolver.js";
import { syncCreator } from "./creator/sync.js";
import { PathManager } from "./fs/path-manager.js";
import { CreatorManifestManager } from "./manifest/creator-manager.js";
import type { CreatorManifest } from "./manifest/creator.js";

export interface RunCliDependencies {
  logger: Logger;
  transport?: HttpTransport;
}

export async function download(
  { logger, transport: customTransport }: RunCliDependencies,
  options: DownloadOptions,
) {
  logger.debug({ options }, "Starting download with options");
  const headers = createFanboxRequestHeaders({
    cookie: options.cookie,
    userAgent: options.userAgent,
  });
  logger.debug({ headers }, "Initialized request headers");
  const transport = new RequestWorker(
    { logger },
    {
      concurrency: options.concurrency,
      http2SessionMultiplier: options.http2SessionMultiplier,
      intervalMs: options.requestIntervalMs,
      maxRetries: options.maxRetries,
      rateLimitPauseMs: options.rateLimitPauseMs,
      transport: customTransport,
    },
  );
  const pathManager = new PathManager({
    flatPosts: options.flatPosts,
    rootPath: options.output,
  });
  const client = new FanboxClient({ headers, transport });

  const failed: string[] = [];
  const creatorIds = await resolveCreatorIds({ client, logger }, options);
  const creatorManifestManager = new CreatorManifestManager({
    logger,
    pathManager,
  });

  const processingCreators: Promise<void>[] = [];

  for (const creatorId of creatorIds) {
    logger.debug(`Initializing download for creator ${creatorId}`);
    const creatorManifest = await creatorManifestManager.load(creatorId);
    const creatorPathManager = pathManager.dir(creatorId);

    const syncCreatorPromise = syncCreator({
      client,
      headers,
      logger,
      manifest: creatorManifest,
      pathManager: creatorPathManager,
      transport,
    }).catch(() => {
      logger.error(
        `Error occurred while syncing creator ${creatorId}, skipping.`,
      );
      failed.push(creatorId);
    });
    processingCreators.push(syncCreatorPromise);

    const success = !hasFailures(creatorManifest);
    if (!success) failed.push(creatorId);
  }

  logger.info(
    `All ${creatorIds.length} creators have been initialized for download, waiting for all to complete...`,
  );

  await Promise.all(processingCreators);
  await creatorManifestManager.saveAll();

  logger.info(
    { failed },
    `Download completed for ${creatorIds.length} creators, with ${failed.length} failures.`,
  );

  return failed;
}

function hasFailures(manifest: CreatorManifest): boolean {
  return Object.values(manifest.posts).some(
    (post) => post?.status === "failed",
  );
}
