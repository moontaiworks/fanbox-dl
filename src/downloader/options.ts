import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

export interface DownloadOptions {
  concurrency: number;
  cookie?: string;
  creatorIds: string[];
  following: boolean;
  ignoreCreatorIds: string[];
  logFormat: "json" | "pretty";
  maxRetries: number;
  output: string;
  rateLimitPauseMs: number;
  requestIntervalMs: number;
  supporting: boolean;
  verifyAssets: boolean;
}

export class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export function parseDownloadOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): DownloadOptions {
  if (args[0] !== "download") {
    throw new CliUsageError("expected the download command");
  }

  const { values } = parseArgs({
    allowPositionals: false,
    args: args.slice(1),
    options: {
      concurrency: { default: "3", type: "string" },
      cookie: { type: "string" },
      "cookie-file": { type: "string" },
      creator: { multiple: true, type: "string" },
      following: { default: false, type: "boolean" },
      "ignore-creator": { multiple: true, type: "string" },
      "log-format": { default: "json", type: "string" },
      "max-retries": { default: "5", type: "string" },
      output: { default: "fanbox-downloads", type: "string" },
      "rate-limit-pause-ms": { default: "60000", type: "string" },
      "request-interval-ms": { default: "0", type: "string" },
      supporting: { default: false, type: "boolean" },
      "verify-assets": { default: false, type: "boolean" },
    },
    strict: true,
  });
  const creatorIds = values.creator ?? [];
  if (creatorIds.length === 0 && !values.following && !values.supporting) {
    throw new CliUsageError("at least one creator selector is required");
  }
  if (values["log-format"] !== "json" && values["log-format"] !== "pretty") {
    throw new CliUsageError("log-format must be json or pretty");
  }

  const cookieFile = values["cookie-file"];
  const cookie = normalizeCookie(
    values.cookie ??
      (cookieFile === undefined
        ? undefined
        : readFileSync(cookieFile, "utf8")) ??
      env.FANBOX_SESSION_ID,
  );

  return {
    concurrency: parsePositiveInteger("concurrency", values.concurrency),
    cookie,
    creatorIds,
    following: values.following,
    ignoreCreatorIds: values["ignore-creator"] ?? [],
    logFormat: values["log-format"],
    maxRetries: parseNonNegativeInteger("max-retries", values["max-retries"]),
    output: values.output,
    rateLimitPauseMs: parseNonNegativeInteger(
      "rate-limit-pause-ms",
      values["rate-limit-pause-ms"],
    ),
    requestIntervalMs: parseNonNegativeInteger(
      "request-interval-ms",
      values["request-interval-ms"],
    ),
    supporting: values.supporting,
    verifyAssets: values["verify-assets"],
  };
}

function normalizeCookie(cookie?: string): string | undefined {
  const value = cookie?.trim();
  if (!value) {
    return undefined;
  }

  return value.includes("=") ? value : `FANBOXSESSID=${value}`;
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
