#!/usr/bin/env node

import { runCli } from "./downloader/cli.js";

void runCli(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode;
});
