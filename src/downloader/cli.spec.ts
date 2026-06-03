import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "./cli.js";

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

function summary() {
  return {
    commentCount: 0,
    cover: null,
    creatorId: "creator",
    excerpt: "",
    feeRequired: 0,
    hasAdultContent: false,
    id: "123",
    isCommentingRestricted: false,
    isLiked: false,
    isPinned: false,
    isRestricted: false,
    likeCount: 0,
    publishedDatetime: "2026-05-27T21:17:41+09:00",
    tags: [],
    title: "Title",
    updatedDatetime: "2026-05-27T21:17:41+09:00",
    user: { iconUrl: "", name: "Creator", userId: "1" },
  };
}

describe("runCli", () => {
  it("prints help and exits successfully", async () => {
    const lines: string[] = [];

    await expect(
      runCli(["--help"], {}, { write: (line) => lines.push(line) }),
    ).resolves.toBe(0);

    expect(lines.join("\n")).toContain("Usage: fanbox-dl download [options]");
    expect(lines.join("\n")).toContain("--dry-run");
  });

  it("prints usage guidance for empty input", async () => {
    const lines: string[] = [];

    await expect(
      runCli([], {}, { write: (line) => lines.push(line) }),
    ).resolves.toBe(2);

    expect(lines.join("\n")).toContain("Usage: fanbox-dl download [options]");
    expect(lines.join("\n")).toContain("expected the download command");
  });

  it("downloads a selected creator with the command entrypoint", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-cli-"));
    const fetch: typeof globalThis.fetch = (input) => {
      const url = new URL(requestUrl(input));
      if (url.pathname.endsWith("/post.listCreator")) {
        return Promise.resolve(Response.json({ body: [summary()] }));
      }
      if (url.pathname.endsWith("/post.info")) {
        return Promise.resolve(
          Response.json({
            body: {
              ...summary(),
              body: { text: "Hello" },
              coverImageUrl: null,
              imageForShare: null,
              nextPost: null,
              prevPost: null,
              type: "text",
            },
          }),
        );
      }

      throw new Error(`Unexpected request: ${url.href}`);
    };

    await expect(
      runCli(
        ["download", "--creator", "creator", "--output", directory],
        {},
        { fetch },
      ),
    ).resolves.toBe(0);
    await expect(
      readFile(
        path.join(
          directory,
          "creator",
          "posts",
          "2026-05-27_123_Title",
          "content.md",
        ),
        "utf8",
      ),
    ).resolves.toContain("Hello");
  });

  it("returns exit code two for invalid usage", async () => {
    const lines: string[] = [];

    await expect(
      runCli(["download"], {}, { write: (line) => lines.push(line) }),
    ).resolves.toBe(2);

    expect(lines.join("\n")).toContain("at least one creator selector");
  });

  it("dry-runs selected creators without fetching post details or writing files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-cli-"));
    let postInfoCalls = 0;
    const lines: string[] = [];
    const fetch: typeof globalThis.fetch = (input) => {
      const url = new URL(requestUrl(input));
      if (url.pathname.endsWith("/post.listCreator")) {
        return Promise.resolve(Response.json({ body: [summary()] }));
      }
      if (url.pathname.endsWith("/post.info")) {
        postInfoCalls += 1;
      }

      throw new Error(`Unexpected request: ${url.href}`);
    };

    await expect(
      runCli(
        [
          "download",
          "--creator",
          "creator",
          "--output",
          directory,
          "--dry-run",
        ],
        {},
        { fetch, write: (line) => lines.push(line) },
      ),
    ).resolves.toBe(0);

    expect(postInfoCalls).toBe(0);
    await expect(stat(path.join(directory, "creator"))).rejects.toThrow();
    expect(lines.join("\n")).toContain("dry-run.post");
    expect(lines.join("\n")).toContain('"postId":"123"');
  });

  it("writes response debug logs for API errors when verbose is enabled", async () => {
    const lines: string[] = [];
    const fetch: typeof globalThis.fetch = () =>
      Promise.resolve(
        Response.json(
          { error: "nope" },
          { status: 500, statusText: "Internal Server Error" },
        ),
      );

    await expect(
      runCli(
        ["download", "--creator", "creator", "--dry-run", "--verbose"],
        {},
        { fetch, write: (line) => lines.push(line) },
      ),
    ).resolves.toBe(1);

    expect(lines.join("\n")).toContain('"level":"debug"');
    expect(lines.join("\n")).toContain('"status":500');
    expect(lines.join("\n")).toContain('"body":{"error":"nope"}');
  });
});
