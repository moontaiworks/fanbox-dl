#!/usr/bin/env node

import { parseArgs } from "node:util";

import type { LevelWithSilent, Logger } from "pino";
import { pino } from "pino";

import * as Downloader from "./downloader/cli/index.js";
import { CliUsageError } from "./usage.js";

interface Command {
  exec(deps: { logger: Logger }, args: string[]): Promise<number>;
  help(): void;
}

const commands: Partial<Record<string, Command>> = {
  download: Downloader,
};

const [cmd, ...args] = process.argv.slice(2);

const command = commands[cmd];
if (!command) {
  console.warn(
    [
      `Unknown command: ${cmd}`,
      `Available commands: ${Object.keys(commands).join(", ")}`,
    ].join("\n"),
  );
  process.exit(1);
}

if (args.includes("--help") || args.includes("-h")) {
  command.help();
  process.exit(0);
}

const { "log-level": logLevel = "info" } = parseArgs({
  options: { "log-level": { type: "string" } },
  strict: false,
}).values;
function isLogLevel(level: unknown): level is LevelWithSilent {
  const availableLevel = [
    "debug",
    "error",
    "fatal",
    "info",
    "silent",
    "trace",
    "warn",
  ];

  return typeof level === "string" && availableLevel.includes(level);
}

if (!isLogLevel(logLevel)) {
  console.error(
    "log-level must be fatal, error, warn, info, debug, trace or silent",
  );
  process.exit(1);
}

const logger = pino({
  base: {},
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
});

void command
  .exec({ logger }, args)
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((err: unknown) => {
    const isMisUsage = err instanceof CliUsageError;
    if (isMisUsage) {
      console.error(`Error: ${err.message}\n`);
      command.help();
      process.exit(2);
    }

    logger.error({ err, event: "cli.failed" });

    throw err;
  });
