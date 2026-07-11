import { parseArgs } from "node:util";

import type { Logger } from "pino";

import {
  COMMON_CLI_OPTIONS,
  type CommonCliOptions,
  GLOBAL_CLI_OPTIONS,
  parseCliArgs,
  parseCommonCliOptions,
} from "../../cli/options.js";
import { CliUsageError } from "../../usage.js";

export interface DownloadCreatorsOptions extends CommonCliOptions {
  creatorIds: string[];
  following: boolean;
  ignoreCreatorIds: string[];
  supporting: boolean;
  verify: boolean;
}

export function parseDownloadCreatorsOptions(
  { logger }: { logger: Logger },
  args: string[],
): DownloadCreatorsOptions {
  logger.trace({ args }, "Parsing download-creators options");
  const { values } = parseDownloadCreatorsArgs(args);

  const creatorIds = values.creator ?? [];
  if (creatorIds.length === 0 && !values.following && !values.supporting) {
    throw new CliUsageError("at least one creator selector is required");
  }

  return {
    ...parseCommonCliOptions({ logger }, values),
    creatorIds,
    following: values.following,
    ignoreCreatorIds: values["ignore-creator"] ?? [],
    supporting: values.supporting,
    verify: values.verify,
  };
}

function parseDownloadCreatorsArgs(args: string[]) {
  return parseCliArgs(() =>
    parseArgs({
      allowPositionals: false,
      args,
      options: {
        ...COMMON_CLI_OPTIONS,
        ...GLOBAL_CLI_OPTIONS,
        creator: { multiple: true, type: "string" },
        following: { default: false, type: "boolean" },
        "ignore-creator": { multiple: true, type: "string" },
        supporting: { default: false, type: "boolean" },
        verify: { default: false, type: "boolean" },
      },
      strict: true,
    }),
  );
}
