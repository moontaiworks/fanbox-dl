import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
      flatPosts: false,
      following: true,
      ignoreCreatorIds: ["beta"],
      logFormat: "json",
      logLevel: "info",
      maxRetries: 5,
      output: "fanbox-downloads",
      rateLimitPauseMs: 60_000,
      requestIntervalMs: 500,
      supporting: false,
      userAgent: undefined,
      verifyAssets: false,
    });
  });

  it("parses dry run and log level", () => {
    const options = parseDownloadOptions(
      ["download", "--creator", "alpha", "--dry-run", "--log-level", "debug"],
      {},
    );

    expect(options).toMatchObject({
      dryRun: true,
      logLevel: "debug",
    });
  });

  it("rejects an unknown log level", () => {
    expect(() =>
      parseDownloadOptions(
        ["download", "--creator", "alpha", "--log-level", "trace"],
        {},
      ),
    ).toThrow(CliUsageError);
  });

  it("parses flat posts mode", () => {
    const options = parseDownloadOptions(
      ["download", "--creator", "alpha", "--flat-posts"],
      {},
    );

    expect(options.flatPosts).toBe(true);
  });

  it("prefers explicit cookie over cookie file and environment", () => {
    const options = parseDownloadOptions(
      ["download", "--creator", "alpha", "--cookie", "explicit"],
      { FANBOX_SESSION_ID: "environment" },
    );

    expect(options.cookie).toBe("FANBOXSESSID=explicit");
  });

  it("loads FANBOX cookies from a Netscape cookies file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-options-"));
    const cookieFile = path.join(directory, "cookies.txt");
    await writeFile(
      cookieFile,
      [
        "# Netscape HTTP Cookie File",
        ".fanbox.cc\tTRUE\t/\tTRUE\t2147483647\tcf_clearance\tclearance",
        "www.fanbox.cc\tFALSE\t/\tTRUE\t2147483647\tFANBOXSESSID\tsession",
        ".example.test\tTRUE\t/\tTRUE\t2147483647\tignored\tnope",
      ].join("\n"),
    );

    const options = parseDownloadOptions(
      ["download", "--creator", "alpha", "--cookie-file", cookieFile],
      {},
    );

    expect(options.cookie).toBe("cf_clearance=clearance; FANBOXSESSID=session");
  });

  it("parses user agent from option", () => {
    const options = parseDownloadOptions([
      "download",
      "--creator",
      "alpha",
      "--user-agent",
      "cli agent",
    ]);

    expect(options.userAgent).toBe("cli agent");
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
