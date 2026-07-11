import { COMMON_CLI_HELP } from "../../cli/options.js";
import { download, type RunCliDependencies } from "../../downloader/index.js";
import { parseDownloadCreatorsOptions } from "./options.js";

export const help = () => {
  console.log(`Usage: fanbox-dl download-creators [options]

Download FANBOX posts for selected creators.

Selectors:
  --creator <id>            Add a creator ID. Can be repeated.
  --following               Add all followed creators.
  --supporting              Add all supporting creators.
  --ignore-creator <id>     Exclude a creator ID. Can be repeated.

Download:
  --verify                  Verify skipped complete posts against local files.

=== Global Options ===
${COMMON_CLI_HELP}`);
};

export async function exec(
  { logger, transport }: RunCliDependencies,
  args: string[],
): Promise<number> {
  const options = parseDownloadCreatorsOptions({ logger }, args);
  const failed = await download({ logger, transport }, options);
  return failed ? 1 : 0;
}
