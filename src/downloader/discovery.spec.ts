import { afterEach, describe, expect, it } from "vitest";

import { FanboxApiError } from "../client.js";
import { logger } from "../logger.js";
import type { PostSummary } from "../types.js";
import { discoverCreatorPosts } from "./discovery.js";

function captureLogs(entries: unknown[]): void {
  logger.configure({
    level: "debug",
    write: (line) => entries.push(JSON.parse(line) as unknown),
  });
}

function summary(id: string): PostSummary {
  return {
    commentCount: 0,
    cover: null,
    creatorId: "creator",
    excerpt: "",
    feeRequired: 0,
    hasAdultContent: false,
    id,
    isCommentingRestricted: false,
    isLiked: false,
    isPinned: false,
    isRestricted: false,
    likeCount: 0,
    publishedDatetime: `2026-05-${id.padStart(2, "0")}T00:00:00+09:00`,
    tags: [],
    title: id,
    updatedDatetime: `2026-05-${id.padStart(2, "0")}T00:00:00+09:00`,
    user: { iconUrl: "", name: "Creator", userId: "1" },
  };
}

describe("discoverCreatorPosts", () => {
  afterEach(() => {
    logger.configure({ level: "silent", write: () => undefined });
  });

  it("uses an inclusive direct cursor and deduplicates the anchor", async () => {
    const calls: { firstId?: string }[] = [];
    const client = {
      listCreatorPosts: (params: { firstId?: string }) => {
        calls.push(params);
        if (params.firstId === "1") {
          return Promise.resolve([summary("1")]);
        }

        return Promise.resolve(
          params.firstId
            ? [summary("2"), summary("1")]
            : [summary("3"), summary("2")],
        );
      },
      paginateCreatorPosts: () => Promise.resolve([]),
    };

    const posts = await discoverCreatorPosts(client, "creator", {
      pageSize: 2,
    });

    expect(posts.map((post) => post.id)).toEqual(["3", "2", "1"]);
    expect(calls).toHaveLength(3);
  });

  it("falls back to paginateCreator when a direct cursor makes no progress", async () => {
    let paginateCalls = 0;
    const client = {
      listCreatorPosts: (params: { firstId?: string }) =>
        Promise.resolve(
          params.firstId === "1"
            ? [summary("1")]
            : [summary("3"), summary("2")],
        ),
      paginateCreatorPosts: () => {
        paginateCalls += 1;
        return Promise.resolve([
          "https://api.fanbox.cc/post.listCreator?creatorId=creator&firstPublishedDatetime=2026-05-02%2000%3A00%3A00&firstId=2&sort=newest&limit=2",
          "https://api.fanbox.cc/post.listCreator?creatorId=creator&firstPublishedDatetime=2026-05-01%2000%3A00%3A00&firstId=1&sort=newest&limit=2",
        ]);
      },
    };

    const posts = await discoverCreatorPosts(client, "creator", {
      pageSize: 2,
    });

    expect(posts.map((post) => post.id)).toEqual(["3", "2", "1"]);
    expect(paginateCalls).toBe(1);
  });

  it("debug logs direct cursor API error responses before fallback", async () => {
    const entries: unknown[] = [];
    let directCalls = 0;
    captureLogs(entries);
    const client = {
      listCreatorPosts: () => {
        directCalls += 1;
        if (directCalls === 1) {
          return Promise.reject(
            new FanboxApiError(
              Response.json({ error: "direct failed" }, { status: 500 }),
              { error: "direct failed" },
            ),
          );
        }

        return Promise.resolve([summary("1")]);
      },
      paginateCreatorPosts: () =>
        Promise.resolve([
          "https://api.fanbox.cc/post.listCreator?creatorId=creator&firstId=1",
        ]),
    };

    await discoverCreatorPosts(client, "creator");

    expect(entries).toContainEqual(
      expect.objectContaining({
        body: { error: "direct failed" },
        event: "api.response.error",
        status: 500,
      }),
    );
  });
});
