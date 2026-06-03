import { mkdtemp, readFile } from "node:fs/promises";
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
    await expect(
      runCli(["download"], {}, { write: () => undefined }),
    ).resolves.toBe(2);
  });
});
