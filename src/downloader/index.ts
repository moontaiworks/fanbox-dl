import { FanboxClient } from "../client/client.js";
import { createFanboxRequestHeaders } from "../client/fanbox-headers.js";
import { logger } from "../logger.js";
import type { HttpTransport } from "../transport/http2.js";
import { RequestWorker } from "../transport/worker.js";
import type { DownloadOptions } from "./cli/options.js";
import { resolveCreatorIds } from "./cli/resolver.js";
import { syncCreator } from "./creator/sync.js";
import { PathManager } from "./fs/path-manager.js";
import { CreatorManifestManager } from "./manifest/creator-manager.js";
import type { CreatorManifest } from "./manifest/creator.js";

export interface RunCliDependencies {
  transport?: HttpTransport;
}

export async function download(
  options: DownloadOptions,
  dependencies: RunCliDependencies,
) {
  const headers = createFanboxRequestHeaders({
    cookie: options.cookie,
    userAgent: options.userAgent,
  });
  const transport = new RequestWorker({
    concurrency: options.concurrency,
    intervalMs: options.requestIntervalMs,
    maxRetries: options.maxRetries,
    rateLimitPauseMs: options.rateLimitPauseMs,
    transport: dependencies.transport,
  });
  const pathManager = new PathManager({
    flatPosts: options.flatPosts,
    rootPath: options.output,
  });
  const client = new FanboxClient({ headers, transport });

  let failed = false;
  const creatorIds = await resolveCreatorIds(client, options);
  const creatorManifestManager = new CreatorManifestManager({
    pathManager,
  });

  for (const creatorId of creatorIds) {
    logger.info("creator.sync.start", undefined, { creatorId });
    const creatorManifest = await creatorManifestManager.load(creatorId);

    await syncCreator({
      client,
      headers,
      manifest: creatorManifest,
      pathManager,
      transport,
    }).catch((error: unknown) => {
      logger.error("creator.sync.error", undefined, { creatorId, error });
      failed = true;
    });

    const success = !hasFailures(creatorManifest);
    failed ||= !success;
    logger.info("creator.sync.done", undefined, { creatorId, success });
    await creatorManifest.save();
  }

  return failed;
}

function hasFailures(manifest: CreatorManifest): boolean {
  return Object.values(manifest.posts).some(
    (post) => post?.status === "failed",
  );
}
