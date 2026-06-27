import { FanboxClient } from "../client/client.js";
import { createFanboxRequestHeaders } from "../client/fanbox-headers.js";
import { logger } from "../logger.js";
import type { HttpTransport } from "../transport/http2.js";
import { RequestWorker } from "../transport/worker.js";
import { AssetDownloader } from "./asset.js";
import type { DownloadOptions } from "./cli/options.js";
import { resolveCreatorIds } from "./cli/resolver.js";
import { PathManager } from "./fs/path-manager.js";
import { CreatorManifestManager } from "./manifest/creator-manager.js";
import type { CreatorManifest } from "./manifest/creator.js";
import { syncCreator } from "./sync.js";

export interface RunCliDependencies {
  transport?: HttpTransport;
}

export class Downloader {
  #assetDownloader: AssetDownloader;
  #client: FanboxClient;
  #pathManager: PathManager;
  #requestWorker: RequestWorker;

  constructor(
    private options: DownloadOptions,
    dependencies: RunCliDependencies,
  ) {
    const requestHeaders = createFanboxRequestHeaders({
      cookie: options.cookie,
      userAgent: options.userAgent,
    });
    this.#requestWorker = new RequestWorker({
      concurrency: options.concurrency,
      intervalMs: options.requestIntervalMs,
      maxRetries: options.maxRetries,
      rateLimitPauseMs: options.rateLimitPauseMs,
      transport: dependencies.transport,
    });
    this.#client = new FanboxClient({
      headers: requestHeaders,
      transport: this.#requestWorker,
    });
    this.#assetDownloader = new AssetDownloader({
      headers: requestHeaders,
      transport: this.#requestWorker,
    });
    this.#pathManager = new PathManager({
      rootPath: options.output,
    });
  }

  async start() {
    const { output: rootPath } = this.options;
    let failed = false;
    const creatorIds = await resolveCreatorIds(this.#client, this.options);
    const creatorManifestManager = new CreatorManifestManager({
      pathManager: this.#pathManager,
    });

    for (const creatorId of creatorIds) {
      logger.info("creator.sync.start", undefined, { creatorId });
      const creatorManifest = await creatorManifestManager.load(creatorId);

      await syncCreator({
        assetDownloader: this.#assetDownloader,
        client: this.#client,
        creatorId,
        flatPosts: this.options.flatPosts,
        manifest: creatorManifest,
        outputDirectory: rootPath,
        verifyAssets: this.options.verifyAssets,
      });
      const success = !hasFailures(creatorManifest);
      failed ||= !success;
      logger.info("creator.sync.complete", undefined, { creatorId, success });
      await creatorManifest.save();
    }

    return failed;
  }
}

function hasFailures(manifest: CreatorManifest): boolean {
  return Object.values(manifest.posts).some(
    (post) => post?.status === "failed",
  );
}
