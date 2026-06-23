import { FanboxClient } from "../client.js";
import { createFanboxRequestHeaders } from "../fanbox-headers.js";
import { logger } from "../logger.js";
import type { HttpTransport } from "../transport/http2.js";
import { RequestWorker } from "../transport/worker.js";
import { AssetDownloader } from "./asset.js";
import { CreatorManifestManager } from "./manifest/creator-manager.js";
import type { CreatorManifest } from "./manifest/creator.js";
import type { DownloadOptions } from "./options.js";
import { DOWNLOAD_HELP, parseDownloadOptions } from "./options.js";
import { resolveCreatorIds } from "./resolver.js";
import { syncCreator } from "./sync.js";

export interface RunCliDependencies {
  transport?: HttpTransport;
}

class Downloader {
  #assetDownloader: AssetDownloader;
  #client: FanboxClient;
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
  }

  async start() {
    const { output: rootPath } = this.options;
    let failed = false;
    const creatorIds = await resolveCreatorIds(this.#client, this.options);
    const creatorManifestManager = new CreatorManifestManager({ rootPath });

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

export async function exec(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const options = parseDownloadOptions(args, env);
  logger.configure({ format: options.logFormat, level: options.logLevel });

  const downloader = new Downloader(options, dependencies);
  const failed = await downloader.start();

  return failed ? 1 : 0;
}

export function help() {
  logger.raw(DOWNLOAD_HELP);
}

function hasFailures(manifest: CreatorManifest): boolean {
  return Object.values(manifest.posts).some(
    (post) => post?.status === "failed",
  );
}
