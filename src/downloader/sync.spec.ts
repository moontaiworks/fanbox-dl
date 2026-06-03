import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { FanboxApiError } from "../client.js";
import type { HttpRequest, HttpResponse } from "../http.js";
import type { ImagePost, PostSummary } from "../types.js";
import { AssetDownloader } from "./asset.js";
import type { Logger } from "./logger.js";
import { RequestScheduler } from "./scheduler.js";
import { syncCreator } from "./sync.js";

function post(extension = "png"): ImagePost {
  return {
    ...summary(),
    body: {
      images: [
        {
          extension,
          height: 1,
          id: "image-id",
          originalUrl: "https://example.test/image.png",
          thumbnailUrl: "https://example.test/thumb.jpg",
          width: 1,
        },
      ],
      text: "Hello",
    },
    coverImageUrl: "https://example.test/cover.jpg",
    imageForShare: null,
    nextPost: null,
    prevPost: null,
    type: "image",
  };
}

function requestUrl(input: HttpRequest | string | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

function response(
  body: unknown,
  init: { headers?: Headers | Record<string, string>; status?: number } = {},
): HttpResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const status = init.status ?? 200;

  return {
    body: Readable.from([text]),
    headers: new Headers(init.headers),
    json: () => Promise.resolve(JSON.parse(text) as unknown),
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: () => Promise.resolve(text),
  };
}

function summary(restricted = false, title = "Title"): PostSummary {
  return {
    commentCount: 0,
    cover: { type: "cover_image", url: "https://example.test/cover.jpg" },
    creatorId: "creator",
    excerpt: "",
    feeRequired: 0,
    hasAdultContent: false,
    id: "123",
    isCommentingRestricted: false,
    isLiked: false,
    isPinned: false,
    isRestricted: restricted,
    likeCount: 0,
    publishedDatetime: "2026-05-27T21:17:41+09:00",
    tags: [],
    title,
    updatedDatetime: "2026-05-27T21:17:41+09:00",
    user: { iconUrl: "", name: "Creator", userId: "1" },
  };
}

function testLogger(entries: unknown[]): Logger {
  return {
    debug: (event, _message, fields) => entries.push({ event, ...fields }),
    error: (event, _message, fields) => entries.push({ event, ...fields }),
    info: () => undefined,
    warn: () => undefined,
  };
}

describe("syncCreator", () => {
  it("downloads a post once and skips unchanged content on the next run", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-sync-"));
    let postInfoCalls = 0;
    const client = {
      getPost: () => {
        postInfoCalls += 1;
        return Promise.resolve(post());
      },
      listCreatorPosts: () => Promise.resolve([summary()]),
      paginateCreatorPosts: () => Promise.resolve([]),
    };
    const assetDownloader = new AssetDownloader({
      scheduler: new RequestScheduler({ concurrency: 1 }),
      transport: {
        close: () => Promise.resolve(),
        request: (input) =>
          Promise.resolve(response(requestUrl(input), { status: 200 })),
      },
    });

    await syncCreator({
      assetDownloader,
      client,
      creatorId: "creator",
      outputDirectory: directory,
    });
    await syncCreator({
      assetDownloader,
      client,
      creatorId: "creator",
      outputDirectory: directory,
    });

    expect(postInfoCalls).toBe(1);
    const postDirectory = path.join(
      directory,
      "creator",
      "posts",
      "2026-05-27_123_Title",
    );
    await expect(
      readFile(path.join(postDirectory, "content.md"), "utf8"),
    ).resolves.toContain(
      "![image-id](./2026-05-27_123_Title_01_image_image-id.png)",
    );
    await expect(
      readFile(path.join(postDirectory, "metadata.json"), "utf8"),
    ).resolves.toContain('"type": "image"');
  });

  it("stores a restricted summary without requesting post details", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-sync-"));
    let postInfoCalls = 0;
    const client = {
      getPost: () => {
        postInfoCalls += 1;
        return Promise.resolve(post());
      },
      listCreatorPosts: () => Promise.resolve([summary(true)]),
      paginateCreatorPosts: () => Promise.resolve([]),
    };
    const assetDownloader = new AssetDownloader({
      scheduler: new RequestScheduler({ concurrency: 1 }),
    });

    await syncCreator({
      assetDownloader,
      client,
      creatorId: "creator",
      outputDirectory: directory,
    });

    expect(postInfoCalls).toBe(0);
    await expect(
      readFile(path.join(directory, "creator", "manifest.json"), "utf8"),
    ).resolves.toContain('"status": "skipped"');
  });

  it("redownloads a corrupted asset when verification is requested", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-sync-"));
    let assetCalls = 0;
    let postInfoCalls = 0;
    const client = {
      getPost: () => {
        postInfoCalls += 1;
        return Promise.resolve(post());
      },
      listCreatorPosts: () => Promise.resolve([summary()]),
      paginateCreatorPosts: () => Promise.resolve([]),
    };
    const assetDownloader = new AssetDownloader({
      scheduler: new RequestScheduler({ concurrency: 1 }),
      transport: {
        close: () => Promise.resolve(),
        request: (input) => {
          assetCalls += 1;
          return Promise.resolve(response(requestUrl(input), { status: 200 }));
        },
      },
    });

    await syncCreator({
      assetDownloader,
      client,
      creatorId: "creator",
      outputDirectory: directory,
    });
    const assetPath = path.join(
      directory,
      "creator",
      "posts",
      "2026-05-27_123_Title",
      "2026-05-27_123_Title_01_image_image-id.png",
    );
    await writeFile(assetPath, "corrupted");
    await syncCreator({
      assetDownloader,
      client,
      creatorId: "creator",
      outputDirectory: directory,
      verifyAssets: true,
    });

    expect(postInfoCalls).toBe(2);
    expect(assetCalls).toBe(3);
    await expect(readFile(assetPath, "utf8")).resolves.toBe(
      "https://example.test/image.png",
    );
  });

  it("rewrites asset manifest paths when a renamed post directory moves", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-sync-"));
    let assetCalls = 0;
    let title = "Title";
    const client = {
      getPost: () => Promise.resolve(post()),
      listCreatorPosts: () => Promise.resolve([summary(false, title)]),
      paginateCreatorPosts: () => Promise.resolve([]),
    };
    const assetDownloader = new AssetDownloader({
      scheduler: new RequestScheduler({ concurrency: 1 }),
      transport: {
        close: () => Promise.resolve(),
        request: (input) => {
          assetCalls += 1;
          return Promise.resolve(response(requestUrl(input), { status: 200 }));
        },
      },
    });

    await syncCreator({
      assetDownloader,
      client,
      creatorId: "creator",
      outputDirectory: directory,
    });
    title = "Renamed";
    await syncCreator({
      assetDownloader,
      client,
      creatorId: "creator",
      outputDirectory: directory,
    });

    expect(assetCalls).toBe(2);
    await expect(
      readFile(path.join(directory, "creator", "manifest.json"), "utf8"),
    ).resolves.toContain(
      "posts/2026-05-27_123_Renamed/2026-05-27_123_Renamed_01_image_image-id.png",
    );
    await expect(
      readFile(
        path.join(
          directory,
          "creator",
          "posts",
          "2026-05-27_123_Renamed",
          "2026-05-27_123_Renamed_01_image_image-id.png",
        ),
        "utf8",
      ),
    ).resolves.toBe("https://example.test/image.png");
    await expect(
      readFile(
        path.join(
          directory,
          "creator",
          "posts",
          "2026-05-27_123_Renamed",
          "2026-05-27_123_Title_01_image_image-id.png",
        ),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("sanitizes asset extensions before using them in file names", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-sync-"));
    const client = {
      getPost: () => Promise.resolve(post("p/ng")),
      listCreatorPosts: () => Promise.resolve([summary()]),
      paginateCreatorPosts: () => Promise.resolve([]),
    };
    const assetDownloader = new AssetDownloader({
      scheduler: new RequestScheduler({ concurrency: 1 }),
      transport: {
        close: () => Promise.resolve(),
        request: () => Promise.resolve(response("asset", { status: 200 })),
      },
    });

    await syncCreator({
      assetDownloader,
      client,
      creatorId: "creator",
      outputDirectory: directory,
    });

    await expect(
      readFile(
        path.join(
          directory,
          "creator",
          "posts",
          "2026-05-27_123_Title",
          "2026-05-27_123_Title_01_image_image-id.p_ng",
        ),
        "utf8",
      ),
    ).resolves.toBe("asset");
  });

  it("debug logs post info API error responses", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-sync-"));
    const entries: unknown[] = [];
    const client = {
      getPost: () =>
        Promise.reject(
          new FanboxApiError(
            response({ error: "post failed" }, { status: 403 }),
            { error: "post failed" },
          ),
        ),
      listCreatorPosts: () => Promise.resolve([summary()]),
      paginateCreatorPosts: () => Promise.resolve([]),
    };

    await syncCreator({
      assetDownloader: new AssetDownloader({
        scheduler: new RequestScheduler({ concurrency: 1 }),
      }),
      client,
      creatorId: "creator",
      logger: testLogger(entries),
      outputDirectory: directory,
    });

    expect(entries).toContainEqual(
      expect.objectContaining({
        body: { error: "post failed" },
        event: "api.response.error",
        postId: "123",
        status: 403,
      }),
    );
  });

  it("debug logs asset response bodies when downloads fail", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-sync-"));
    const entries: unknown[] = [];
    const client = {
      getPost: () => Promise.resolve(post()),
      listCreatorPosts: () => Promise.resolve([summary()]),
      paginateCreatorPosts: () => Promise.resolve([]),
    };
    const assetDownloader = new AssetDownloader({
      scheduler: new RequestScheduler({ concurrency: 1, maxRetries: 0 }),
      transport: {
        close: () => Promise.resolve(),
        request: () =>
          Promise.resolve(response({ error: "asset failed" }, { status: 403 })),
      },
    });

    await syncCreator({
      assetDownloader,
      client,
      creatorId: "creator",
      logger: testLogger(entries),
      outputDirectory: directory,
    });

    expect(entries).toContainEqual(
      expect.objectContaining({
        body: { error: "asset failed" },
        event: "api.response.error",
        postId: "123",
        status: 403,
      }),
    );
  });
});
