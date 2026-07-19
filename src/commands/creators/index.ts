import type { Logger } from "pino";

import { COMMON_CLI_HELP } from "../../cli/options.js";
import { FanboxClient } from "../../client/client.js";
import { createFanboxRequestHeaders } from "../../client/fanbox-headers.js";
import { syncCreator } from "../../downloader/creator/sync.js";
import { PathManager } from "../../downloader/fs/path-manager.js";
import { CreatorManifestManager } from "../../downloader/manifest/creator-manager.js";
import type { HttpTransport } from "../../transport/http2.js";
import { RequestWorker } from "../../transport/worker.js";
import { parseDownloadCreatorsOptions } from "./options.js";
import { resolveCreatorIds } from "./resolve-creators.js";

export const help = () => {
  console.log(`Usage: fanbox-dl download-creators [options]

Download FANBOX posts for selected creators.

Selectors:
  --creator <id>            Add a creator ID. Can be repeated.
  --following               Add all followed creators.
  --supporting              Add all supporting creators.
  --ignore-creator <id>     Exclude a creator ID. Can be repeated.

Download:
  --verify                  Verify skipped complete posts against local files.

=== Global Options ===
${COMMON_CLI_HELP}`);
};

interface RunCliDependencies {
  logger: Logger;
  transport?: HttpTransport;
}

export async function exec(
  { logger, transport: customTransport }: RunCliDependencies,
  args: string[],
): Promise<number> {
  const options = parseDownloadCreatorsOptions({ logger }, args);
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
      verify: options.verify,
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
  const failedCreatorIds = creatorManifestManager.getFailedCreatorIds();

  logger.info(
    { failedCreatorIds },
    `Download completed for ${creatorIds.length} creators, with ${failedCreatorIds.length} failures.`,
  );

  const hasFailedCreators = failedCreatorIds.length > 0;
  return hasFailedCreators ? 1 : 0;
}
