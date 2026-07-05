import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import type { Logger } from "pino";

import { CliUsageError } from "../../usage.js";
import { normalizeCookie } from "./cookie.js";

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

Download:
  --output <path>           Output directory. Default: fanbox-downloads.
  --flat-posts              Store post files directly under each creator.
  --max-filename-bytes <n>  Max filename bytes including .part temp suffix. Default: 255.
  --flat-parent-min-bytes <n>
                            Min optional parent/post name bytes to preserve in flat-posts filenames. Default: 35.
  --verify                  Verify skipped complete posts against local files.

Requests:
  --concurrency <n>         Concurrent requests. Default: 10.
  --http2-session-multiplier <n>
                            HTTP/2 sessions per origin multiplier based on concurrency. Default: 10.
  --request-interval-ms <n> Delay between request starts. Default: 500.
  --rate-limit-pause-ms <n> Force overwrite pause ms when 429.
  --max-retries <n>         Retry attempts. Default: 3.

Output:
  --log-level <level>       fatal|error|warn|info|debug|trace|silent. Default: info.
  --help                    Show this help.
`;

export interface DownloadOptions {
  concurrency: number;
  cookie?: string;
  creatorIds: string[];
  flatParentMinBytes: number;
  flatPosts: boolean;
  following: boolean;
  http2SessionMultiplier: number;
  ignoreCreatorIds: string[];
  maxFilenameBytes: number;
  maxRetries: number;
  output: string;
  rateLimitPauseMs?: number;
  requestIntervalMs: number;
  supporting: boolean;
  userAgent?: string;
  verify: boolean;
}

interface ParseDownloadOptionsDeps {
  logger: Logger;
}

export function parseDownloadOptions(
  { logger }: ParseDownloadOptionsDeps,
  args: string[],
): DownloadOptions {
  logger.trace({ args }, "Parsing download options");
  const { values } = parseDownloadArgs(args);
  const creatorIds = values.creator ?? [];
  if (creatorIds.length === 0 && !values.following && !values.supporting)
    throw new CliUsageError("at least one creator selector is required");

  const cookie = parseCookie({ logger }, values);

  return {
    concurrency: parsePositiveInteger("concurrency", values.concurrency),
    cookie,
    creatorIds,
    flatParentMinBytes: parsePositiveInteger(
      "flat-parent-min-bytes",
      values["flat-parent-min-bytes"],
    ),
    flatPosts: values["flat-posts"],
    following: values.following,
    http2SessionMultiplier: parsePositiveInteger(
      "http2-session-multiplier",
      values["http2-session-multiplier"],
    ),
    ignoreCreatorIds: values["ignore-creator"] ?? [],
    maxFilenameBytes: parsePositiveInteger(
      "max-filename-bytes",
      values["max-filename-bytes"],
    ),
    maxRetries: parseNonNegativeInteger("max-retries", values["max-retries"]),
    output: values.output,
    rateLimitPauseMs: values["rate-limit-pause-ms"]
      ? parseNonNegativeInteger(
          "rate-limit-pause-ms",
          values["rate-limit-pause-ms"],
        )
      : undefined,
    requestIntervalMs: parseNonNegativeInteger(
      "request-interval-ms",
      values["request-interval-ms"],
    ),
    supporting: values.supporting,
    userAgent: values["user-agent"],
    verify: values.verify,
  };
}

function parseCookie(
  { logger }: ParseDownloadOptionsDeps,
  values: ReturnType<typeof parseDownloadArgs>["values"],
) {
  const cookieFile = values["cookie-file"];
  if (values.cookie) {
    logger.trace({ cookie: values.cookie }, "Using cookie from CLI option");
    return normalizeCookie(values.cookie);
  }

  if (cookieFile) {
    logger.trace({ cookieFile }, "Using cookie from file");
    return normalizeCookie(readFileSync(cookieFile, "utf8"));
  }

  if (process.env.FANBOX_SESSION_ID) {
    logger.trace(
      { FANBOX_SESSION_ID: process.env.FANBOX_SESSION_ID },
      "Using cookie from environment",
    );
    return normalizeCookie(process.env.FANBOX_SESSION_ID);
  }

  logger.trace("No cookie provided");
  return undefined;
}

function parseDownloadArgs(args: string[]) {
  try {
    return parseArgs({
      allowPositionals: false,
      args,
      options: {
        concurrency: { default: "10", type: "string" },
        cookie: { type: "string" },
        "cookie-file": { type: "string" },
        creator: { multiple: true, type: "string" },
        "dry-run": { default: false, type: "boolean" },
        "flat-parent-min-bytes": { default: "35", type: "string" },
        "flat-posts": { default: false, type: "boolean" },
        following: { default: false, type: "boolean" },
        "http2-session-multiplier": { default: "10", type: "string" },
        "ignore-creator": { multiple: true, type: "string" },
        "log-level": { default: "info", type: "string" },
        "max-filename-bytes": { default: "255", type: "string" },
        "max-retries": { default: "3", type: "string" },
        output: { default: "fanbox-downloads", type: "string" },
        "rate-limit-pause-ms": { type: "string" },
        "request-interval-ms": { default: "500", type: "string" },
        supporting: { default: false, type: "boolean" },
        "user-agent": { type: "string" },
        verify: { default: false, type: "boolean" },
      },
      strict: true,
    });
  } catch (error) {
    throw new CliUsageError((error as Error).message);
  }
}

function parseNonNegativeInteger(name: string, value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new CliUsageError(`${name} must be a non-negative integer`);
  }

  return number;
}

function parsePositiveInteger(name: string, value: string): number {
  const number = parseNonNegativeInteger(name, value);
  if (number === 0) {
    throw new CliUsageError(`${name} must be a positive integer`);
  }

  return number;
}
