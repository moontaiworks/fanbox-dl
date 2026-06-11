#!/usr/bin/env node

import { runCli } from "./downloader/cli.js";
import { logger } from "./logger.js";

const commands: Partial<Record<string, (args: string[]) => Promise<number>>> = {
  download: runCli,
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

void command(args).then((exitCode) => {
  process.exitCode = exitCode;
});
