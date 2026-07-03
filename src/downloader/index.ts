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
    flatParentMinBytes: options.flatParentMinBytes,
    flatPosts: options.flatPosts,
    maxFilenameBytes: options.maxFilenameBytes,
    rootPath: options.output,
  });
  const client = new FanboxClient({ headers, transport });

  const creatorIds = await resolveCreatorIds({ client, logger }, options);
  const creatorManifestManager = new CreatorManifestManager({
    logger,
    pathManager,
  });
  const processingCreators: Promise<void>[] = [];

  for (const creatorId of creatorIds) {
    logger.debug(`Initializing download for creator ${creatorId}`);
    const creatorManifest = await creatorManifestManager.load(creatorId);

    const syncCreatorPromise = syncCreator({
      client,
      headers,
      logger,
      manifest: creatorManifest,
      pathManager: pathManager.dir([{ context: creatorId, required: true }]),
      transport,
    })
      .then(() => {
        creatorManifestManager.markSucceeded(creatorId);
      })
      .catch((err: unknown) => {
        logger.error(
          { err },
          `Error occurred while syncing creator ${creatorId}, skipping.`,
        );
        creatorManifestManager.markFailed(creatorId, err);
      });
    processingCreators.push(syncCreatorPromise);
  }

  logger.info(
    `All ${creatorIds.length} creators have been initialized for download, waiting for all to complete...`,
  );

  await Promise.all(processingCreators);
  await creatorManifestManager.saveAll();
  const failed = creatorManifestManager.getFailedCreatorIds();

  logger.info(
    { failed },
    `Download completed for ${creatorIds.length} creators, with ${failed.length} failures.`,
  );

  return !!failed.length;
}
