import { FanboxClient } from "../client.js";
import { createFanboxRequestHeaders } from "../fanbox-headers.js";
import { logger } from "../logger.js";
import type { HttpTransport } from "../transport/http2.js";
import { RequestWorker } from "../transport/worker.js";
import { AssetDownloader } from "./asset.js";
import { logDebugErrorResponse } from "./errors.js";
import type { DownloadOptions } from "./options.js";
import {
  CliUsageError,
  DOWNLOAD_HELP,
  parseDownloadOptions,
} from "./options.js";
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
    let failed = false;
    const creatorIds = await resolveCreatorIds(this.#client, this.options);
    for (const creatorId of creatorIds) {
      logger.info("creator.sync.start", undefined, { creatorId });
      try {
        const manifest = await syncCreator({
          assetDownloader: this.#assetDownloader,
          client: this.#client,
          creatorId,
          flatPosts: this.options.flatPosts,
          outputDirectory: this.options.output,
          verifyAssets: this.options.verifyAssets,
        });
        failed ||= hasFailures(manifest);
        logger.info("creator.sync.complete", undefined, { creatorId });
      } catch (error) {
        failed = true;
        logDebugErrorResponse(logger, error);
        logger.error("creator.sync.failed", undefined, {
          creatorId,
          error: String(error),
        });
      }
    }
    return failed;
  }
}

export async function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    logger.raw(DOWNLOAD_HELP);
    return 0;
  }

  try {
    const options = parseDownloadOptions(args, env);
    logger.configure({ format: options.logFormat, level: options.logLevel });

    const downloader = new Downloader(options, dependencies);
    const failed = await downloader.start();

    return failed ? 1 : 0;
  } catch (error) {
    const isMisUsage = error instanceof CliUsageError;
    const message = String(error);
    if (isMisUsage) {
      logger.raw(`${message}\n\n${DOWNLOAD_HELP}`);
      return 2;
    }

    logDebugErrorResponse(logger, error);
    logger.raw(
      JSON.stringify({
        event: "cli.failed",
        level: "error",
        msg: message,
        time: new Date().toISOString(),
      }),
    );
    return 1;
  }
}

function hasFailures(
  manifest: Awaited<ReturnType<typeof syncCreator>>,
): boolean {
  return Object.values(manifest.posts).some(
    (post) => post?.status === "failed",
  );
}
