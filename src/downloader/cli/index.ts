import { logger } from "../../logger.js";
import type { RunCliDependencies } from "../index.js";
import { Downloader } from "../index.js";
import { DOWNLOAD_HELP, parseDownloadOptions } from "./options.js";

export async function exec(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const options = parseDownloadOptions(args, env);
  logger.configure({ format: options.logFormat, level: options.logLevel });

  const downloader = new Downloader(options, dependencies);
  const failed = await downloader.start();

  return failed ? 1 : 0;
}

export function help() {
  logger.raw(DOWNLOAD_HELP);
}
