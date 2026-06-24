#!/usr/bin/env node

import * as Downloader from "./downloader/cli/index.js";
import { logger } from "./logger.js";
import { CliUsageError } from "./usage.js";

interface Command {
  exec(args: string[]): Promise<number>;
  help(): void;
}

const commands: Partial<Record<string, Command>> = {
  download: Downloader,
};

const [cmd, ...args] = process.argv.slice(2);

const command = commands[cmd];
if (!command) {
  logger.raw(
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

void command
  .exec(args)
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    const isMisUsage = error instanceof CliUsageError;
    const message = String(error);
    if (isMisUsage) {
      command.help();
      process.exit(2);
    }

    logger.raw(
      JSON.stringify({
        event: "cli.failed",
        level: "error",
        msg: message,
        time: new Date().toISOString(),
      }),
    );

    throw error;
  });
