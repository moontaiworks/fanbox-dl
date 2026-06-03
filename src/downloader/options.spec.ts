import { describe, expect, it } from "vitest";

import { CliUsageError, parseDownloadOptions } from "./options.js";

describe("parseDownloadOptions", () => {
  it("parses repeated selectors and configured defaults", () => {
    const options = parseDownloadOptions(
      [
        "download",
        "--creator",
        "alpha",
        "--creator",
        "beta",
        "--following",
        "--ignore-creator",
        "beta",
      ],
      {},
    );

    expect(options).toMatchObject({
      concurrency: 3,
      creatorIds: ["alpha", "beta"],
      dryRun: false,
      following: true,
      ignoreCreatorIds: ["beta"],
      logFormat: "json",
      maxRetries: 5,
      output: "fanbox-downloads",
      rateLimitPauseMs: 60_000,
      requestIntervalMs: 0,
      supporting: false,
      verbose: false,
      verifyAssets: false,
    });
  });

  it("parses dry run and verbose flags", () => {
    const options = parseDownloadOptions(
      ["download", "--creator", "alpha", "--dry-run", "--verbose"],
      {},
    );

    expect(options).toMatchObject({
      dryRun: true,
      verbose: true,
    });
  });

  it("prefers explicit cookie over cookie file and environment", () => {
    const options = parseDownloadOptions(
      ["download", "--creator", "alpha", "--cookie", "explicit"],
      { FANBOX_SESSION_ID: "environment" },
    );

    expect(options.cookie).toBe("FANBOXSESSID=explicit");
  });

  it("rejects a download without creator selectors", () => {
    expect(() => parseDownloadOptions(["download"], {})).toThrow(CliUsageError);
  });

  it("rejects zero concurrency", () => {
    expect(() =>
      parseDownloadOptions(
        ["download", "--creator", "alpha", "--concurrency", "0"],
        {},
      ),
    ).toThrow(CliUsageError);
  });
});
