import { download, type RunCliDependencies } from "../index.js";
import { DOWNLOAD_HELP, parseDownloadOptions } from "./options.js";

export async function exec(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const options = parseDownloadOptions(args, env);

  const failed = await download(options, dependencies);

  return failed ? 1 : 0;
}

export function help() {
  console.log(DOWNLOAD_HELP);
}
