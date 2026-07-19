import { readFileSync } from "node:fs";

import type { Logger } from "pino";

import { CliUsageError } from "../usage.js";
import { normalizeCookie } from "./cookie.js";

export const COMMON_CLI_OPTIONS = {
  concurrency: { default: "10", type: "string" },
  cookie: { type: "string" },
  "cookie-file": { type: "string" },
  "flat-parent-min-bytes": { default: "35", type: "string" },
  "flat-posts": { default: false, type: "boolean" },
  "http2-session-multiplier": { default: "10", type: "string" },
  "max-filename-bytes": { default: "255", type: "string" },
  "max-retries": { default: "3", type: "string" },
  output: { default: "fanbox-downloads", type: "string" },
  "rate-limit-pause-ms": { type: "string" },
  "request-interval-ms": { default: "1000", type: "string" },
  "user-agent": { type: "string" },
} as const;

export const GLOBAL_CLI_OPTIONS = {
  "log-level": { default: "info", type: "string" },
} as const;

export const COMMON_CLI_HELP = `Auth:
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

Requests:
  --concurrency <n>         Concurrent requests. Default: 10.
  --http2-session-multiplier <n>
                            HTTP/2 sessions per origin multiplier based on concurrency. Default: 10.
  --request-interval-ms <n> Delay between request starts. Default: 1000.
  --rate-limit-pause-ms <n> Force overwrite pause ms when 429.
  --max-retries <n>         Retry attempts. Default: 3.

Output:
  --log-level <level>       fatal|error|warn|info|debug|trace|silent. Default: info.
  --help                    Show this help.`;

export interface CommonCliOptions {
  concurrency: number;
  cookie?: string;
  flatParentMinBytes: number;
  flatPosts: boolean;
  http2SessionMultiplier: number;
  maxFilenameBytes: number;
  maxRetries: number;
  output: string;
  rateLimitPauseMs?: number;
  requestIntervalMs: number;
  userAgent?: string;
}

export interface CommonCliValues {
  concurrency: string;
  cookie?: string;
  "cookie-file"?: string;
  "flat-parent-min-bytes": string;
  "flat-posts": boolean;
  "http2-session-multiplier": string;
  "max-filename-bytes": string;
  "max-retries": string;
  output: string;
  "rate-limit-pause-ms"?: string;
  "request-interval-ms": string;
  "user-agent"?: string;
}

export function parseCliArgs<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof CliUsageError) throw error;
    throw new CliUsageError((error as Error).message);
  }
}

export function parseCommonCliOptions(
  { logger }: { logger: Logger },
  values: CommonCliValues,
): CommonCliOptions {
  return {
    concurrency: parsePositiveInteger("concurrency", values.concurrency),
    cookie: parseCookie({ logger }, values),
    flatParentMinBytes: parsePositiveInteger(
      "flat-parent-min-bytes",
      values["flat-parent-min-bytes"],
    ),
    flatPosts: values["flat-posts"],
    http2SessionMultiplier: parsePositiveInteger(
      "http2-session-multiplier",
      values["http2-session-multiplier"],
    ),
    maxFilenameBytes: parsePositiveInteger(
      "max-filename-bytes",
      values["max-filename-bytes"],
    ),
    maxRetries: parseNonNegativeInteger("max-retries", values["max-retries"]),
    output: values.output,
    rateLimitPauseMs:
      values["rate-limit-pause-ms"] === undefined
        ? undefined
        : parseNonNegativeInteger(
            "rate-limit-pause-ms",
            values["rate-limit-pause-ms"],
          ),
    requestIntervalMs: parseNonNegativeInteger(
      "request-interval-ms",
      values["request-interval-ms"],
    ),
    userAgent: values["user-agent"],
  };
}

function parseCookie(
  { logger }: { logger: Logger },
  values: Pick<CommonCliValues, "cookie" | "cookie-file">,
) {
  const cookieFile = values["cookie-file"];
  const cookie = values.cookie;
  if (cookie) {
    logger.trace({ cookie }, "Using cookie from CLI option");
    return normalizeCookie(cookie);
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

function parseNonNegativeInteger(name: string, value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new CliUsageError(`${name} must be a non-negative integer`);
  }
  return number;
}

function parsePositiveInteger(name: string, value: string): number {
  const number = parseNonNegativeInteger(name, value);
  if (number === 0)
    throw new CliUsageError(`${name} must be a positive integer`);
  return number;
}
