import { FanboxClient } from "../client.js";
import { AssetDownloader } from "./asset.js";
import { createLogger } from "./logger.js";
import { CliUsageError, parseDownloadOptions } from "./options.js";
import { assertPathBudget } from "./path.js";
import { resolveCreatorIds } from "./resolver.js";
import { RequestScheduler } from "./scheduler.js";
import { syncCreator } from "./sync.js";

export interface RunCliDependencies {
  fetch?: typeof globalThis.fetch;
  write?: (line: string) => void;
}

export async function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  try {
    const options = parseDownloadOptions(args, env);
    assertPathBudget(options.output);
    const logger = createLogger({
      format: options.logFormat,
      write: dependencies.write,
    });
    const fetch = dependencies.fetch ?? globalThis.fetch;
    const scheduler = new RequestScheduler({
      concurrency: options.concurrency,
      logger,
      maxRetries: options.maxRetries,
      rateLimitPauseMs: options.rateLimitPauseMs,
      requestIntervalMs: options.requestIntervalMs,
    });
    const client = new FanboxClient({
      cookie: options.cookie,
      fetch: (input, init) => scheduler.fetch(input, fetch, init),
    });
    const assetDownloader = new AssetDownloader({ fetch, scheduler });
    const creatorIds = await resolveCreatorIds(client, options);
    let failed = false;
    for (const creatorId of creatorIds) {
      logger.info("creator.sync.start", "Creator sync started", { creatorId });
      try {
        const manifest = await syncCreator({
          assetDownloader,
          client,
          creatorId,
          logger,
          outputDirectory: options.output,
          verifyAssets: options.verifyAssets,
        });
        failed ||= hasFailures(manifest);
        logger.info("creator.sync.complete", "Creator sync completed", {
          creatorId,
        });
      } catch (error) {
        failed = true;
        logger.error("creator.sync.failed", "Creator sync failed", {
          creatorId,
          error: String(error),
        });
      }
    }

    return failed ? 1 : 0;
  } catch (error) {
    const usage = error instanceof CliUsageError;
    const write =
      dependencies.write ??
      ((line: string) => process.stderr.write(`${line}\n`));
    write(
      JSON.stringify({
        event: usage ? "cli.usage.error" : "cli.failed",
        level: "error",
        msg: String(error),
        time: new Date().toISOString(),
      }),
    );
    return usage ? 2 : 1;
  }
}

function hasFailures(
  manifest: Awaited<ReturnType<typeof syncCreator>>,
): boolean {
  return Object.values(manifest.posts).some(
    (post) => post?.status === "failed",
  );
}
