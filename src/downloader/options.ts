import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import type { LogLevel } from "./logger.js";

export interface DownloadOptions {
  concurrency: number;
  cookie?: string;
  creatorIds: string[];
  dryRun: boolean;
  flatPosts: boolean;
  following: boolean;
  ignoreCreatorIds: string[];
  logFormat: "json" | "pretty";
  logLevel: LogLevel;
  maxRetries: number;
  output: string;
  rateLimitPauseMs: number;
  requestIntervalMs: number;
  supporting: boolean;
  userAgent?: string;
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
  const { values } = parseDownloadArgs(args);
  const creatorIds = values.creator ?? [];
  if (creatorIds.length === 0 && !values.following && !values.supporting) {
    throw new CliUsageError("at least one creator selector is required");
  }
  if (values["log-format"] !== "json" && values["log-format"] !== "pretty") {
    throw new CliUsageError("log-format must be json or pretty");
  }
  if (!isLogLevel(values["log-level"])) {
    throw new CliUsageError("log-level must be debug, info, warn, or error");
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
    dryRun: values["dry-run"],
    flatPosts: values["flat-posts"],
    following: values.following,
    ignoreCreatorIds: values["ignore-creator"] ?? [],
    logFormat: values["log-format"],
    logLevel: values["log-level"],
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
    userAgent: values["user-agent"],
    verifyAssets: values["verify-assets"],
  };
}

function isFanboxCookieDomain(domain: string): boolean {
  const normalized = domain.replace(/^\./, "").toLowerCase();
  return normalized === "fanbox.cc" || normalized.endsWith(".fanbox.cc");
}

function isLogLevel(value: string): value is LogLevel {
  return (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
  );
}

function normalizeCookie(cookie?: string): string | undefined {
  const value = cookie?.trim();
  if (!value) {
    return undefined;
  }
  const cookies = parseNetscapeCookies(value);
  if (cookies.length > 0) {
    return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  }

  return value.includes("=") ? value : `FANBOXSESSID=${value}`;
}

function parseDownloadArgs(args: string[]) {
  try {
    return parseArgs({
      allowPositionals: false,
      args: args.slice(1),
      options: {
        concurrency: { default: "3", type: "string" },
        cookie: { type: "string" },
        "cookie-file": { type: "string" },
        creator: { multiple: true, type: "string" },
        "dry-run": { default: false, type: "boolean" },
        "flat-posts": { default: false, type: "boolean" },
        following: { default: false, type: "boolean" },
        "ignore-creator": { multiple: true, type: "string" },
        "log-format": { default: "json", type: "string" },
        "log-level": { default: "info", type: "string" },
        "max-retries": { default: "5", type: "string" },
        output: { default: "fanbox-downloads", type: "string" },
        "rate-limit-pause-ms": { default: "60000", type: "string" },
        "request-interval-ms": { default: "500", type: "string" },
        supporting: { default: false, type: "boolean" },
        "user-agent": { type: "string" },
        "verify-assets": { default: false, type: "boolean" },
      },
      strict: true,
    });
  } catch (error) {
    throw new CliUsageError((error as Error).message);
  }
}

function parseNetscapeCookies(value: string): {
  name: string;
  value: string;
}[] {
  const cookies: { name: string; value: string }[] = [];
  for (const line of value.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    const columns = line.split("\t");
    if (columns.length < 7) {
      continue;
    }
    const [domain, , , , , name, cookieValue] = columns;
    if (!isFanboxCookieDomain(domain)) {
      continue;
    }
    cookies.push({ name, value: cookieValue });
  }

  return cookies;
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
