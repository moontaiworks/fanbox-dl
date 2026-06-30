import { download, type RunCliDependencies } from "../index.js";
import { DOWNLOAD_HELP, parseDownloadOptions } from "./options.js";

export async function exec(
  { logger, transport }: RunCliDependencies,
  args: string[],
): Promise<number> {
  const options = parseDownloadOptions({ logger }, args);

  const failed = await download({ logger, transport }, options);

  return failed ? 1 : 0;
}

export function help() {
  console.log(DOWNLOAD_HELP);
}
