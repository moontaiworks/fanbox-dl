import { FanboxClient } from "../client.js";
import { Http2Transport, type HttpTransport } from "../http.js";
import { AssetDownloader } from "./asset.js";
import { discoverCreatorPosts } from "./discovery.js";
import { logDebugErrorResponse } from "./errors.js";
import { createLogger, type Logger } from "./logger.js";
import { CliUsageError, parseDownloadOptions } from "./options.js";
import { assertPathBudget } from "./path.js";
import { resolveCreatorIds } from "./resolver.js";
import { RequestScheduler } from "./scheduler.js";
import { syncCreator } from "./sync.js";

export interface RunCliDependencies {
  transport?: HttpTransport;
  write?: (line: string) => void;
}

export const DOWNLOAD_HELP = `Usage: fanbox-dl download [options]

Download FANBOX posts for selected creators.

Selectors:
  --creator <id>            Add a creator ID. Can be repeated.
  --following               Add all followed creators.
  --supporting              Add all supporting creators.
  --ignore-creator <id>     Exclude a creator ID. Can be repeated.

Auth:
  --cookie <value>          Raw session ID or FANBOXSESSID=... cookie.
  --cookie-file <path>      Read raw cookie or Netscape cookies.txt.
  --user-agent <value>      Send the User-Agent from your logged-in browser.
  FANBOX_SESSION_ID         Environment fallback.
  FANBOX_USER_AGENT         User-Agent environment fallback.

Download:
  --output <path>           Output directory. Default: fanbox-downloads.
  --dry-run                 List creators/posts without downloading or writing.
  --verify-assets           Verify existing asset size and SHA-256 locally.

Requests:
  --concurrency <n>         Concurrent requests. Default: 3.
  --request-interval-ms <n> Delay between request starts. Default: 0.
  --rate-limit-pause-ms <n> Pause after 429 without Retry-After. Default: 60000.
  --max-retries <n>         Retry attempts. Default: 5.

Output:
  --log-format json|pretty  Default: json.
  --verbose                 Enable debug logs.
  --help                    Show this help.
`;

export async function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const write =
    dependencies.write ?? ((line: string) => process.stderr.write(`${line}\n`));
  if (args.includes("--help") || args.includes("-h")) {
    write(DOWNLOAD_HELP);
    return 0;
  }

  let logger: Logger | undefined;
  let transportToClose: HttpTransport | undefined;
  try {
    const options = parseDownloadOptions(args, env);
    assertPathBudget(options.output);
    logger = createLogger({
      format: options.logFormat,
      level: options.verbose ? "debug" : "info",
      write: dependencies.write,
    });
    const transport = dependencies.transport ?? new Http2Transport();
    transportToClose = dependencies.transport ? undefined : transport;
    const scheduler = new RequestScheduler({
      concurrency: options.concurrency,
      logger,
      maxRetries: options.maxRetries,
      rateLimitPauseMs: options.rateLimitPauseMs,
      requestIntervalMs: options.requestIntervalMs,
    });
    const client = new FanboxClient({
      cookie: options.cookie,
      transport: {
        close: () => transport.close(),
        request: (request) =>
          scheduler.request(() => transport.request(request)),
      },
      userAgent: options.userAgent,
    });
    const creatorIds = await resolveCreatorIds(client, options);
    if (options.dryRun) {
      for (const creatorId of creatorIds) {
        logger.info("dry-run.creator", "Dry-run creator selected", {
          creatorId,
        });
        for (const post of await discoverCreatorPosts(client, creatorId, {
          logger,
        })) {
          logger.info("dry-run.post", "Dry-run post discovered", {
            creatorId,
            postId: post.id,
            restricted: post.isRestricted,
            title: post.title,
            updatedDatetime: post.updatedDatetime,
          });
        }
      }

      return 0;
    }

    const assetDownloader = new AssetDownloader({ scheduler, transport });
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
        logDebugErrorResponse(logger, error);
        logger.error("creator.sync.failed", "Creator sync failed", {
          creatorId,
          error: String(error),
        });
      }
    }

    return failed ? 1 : 0;
  } catch (error) {
    const usage = error instanceof CliUsageError;
    const message = String(error);
    if (usage) {
      write(`${message}\n\n${DOWNLOAD_HELP}`);
    } else {
      if (logger) {
        logDebugErrorResponse(logger, error);
      }
      write(
        JSON.stringify({
          event: "cli.failed",
          level: "error",
          msg: message,
          time: new Date().toISOString(),
        }),
      );
    }
    return usage ? 2 : 1;
  } finally {
    await transportToClose?.close();
  }
}

function hasFailures(
  manifest: Awaited<ReturnType<typeof syncCreator>>,
): boolean {
  return Object.values(manifest.posts).some(
    (post) => post?.status === "failed",
  );
}
