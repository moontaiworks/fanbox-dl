import { mkdtemp, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ImagePost, PostSummary } from "../../../src/client/types.js";
import { PathManager } from "../../../src/downloader/fs/path-manager.js";
import type {
  CreatorManifest,
  PostManifestData,
} from "../../../src/downloader/manifest/creator.js";
import {
  preSyncPostCheck,
  syncPost,
} from "../../../src/downloader/post/sync.js";
import type { HttpTransport } from "../../../src/transport/http2.js";

describe("syncPost", () => {
  it("offsets downloaded asset timestamps by their content index", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-sync-post-"));
    const post = createImagePost({
      images: [createImage("image-1"), createImage("image-2")],
    });
    const pathManager = new PathManager({ flatPosts: false, rootPath });

    const result = await syncPost(
      {
        logger: silentLogger,
        pathManager,
        transport: new SuccessfulAssetTransport(),
      },
      post,
    );

    const first = await stat(join(rootPath, "0-image-1.jpg"));
    const second = await stat(join(rootPath, "1-image-2.jpg"));

    expect(second.mtimeMs - first.mtimeMs).toBe(1_000);
    expect(result.assets["image-1"]).toMatchObject({ contentIndex: 0 });
    expect(result.assets["image-2"]).toMatchObject({ contentIndex: 1 });
  });

  it("marks the post partial when an asset download fails", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-sync-post-"));
    const post = createImagePost();
    const result = await syncPost(
      {
        logger: silentLogger,
        pathManager: new PathManager({ flatPosts: false, rootPath }),
        transport: new FailingAssetTransport(),
      },
      post,
    );

    expect(result.status).toBe("partial");
    expect(result.assets["image-1"]).toMatchObject({
      status: "failed",
      url: "https://downloads.example/image-1.jpg",
    });
  });

  describe("preSyncPostCheck", () => {
    it("repairs complete asset timestamps when verify is enabled", async () => {
      const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-sync-post-"));
      const destination = join(rootPath, "0-image-1.jpg");
      await writeFile(destination, "asset");
      await utimes(
        destination,
        new Date("2026-07-02T00:00:00Z"),
        new Date("2026-07-02T00:00:00Z"),
      );

      const result = await preSyncPostCheck(
        {
          logger: silentLogger,
          manifest: createManifest({
            assets: {
              "image-1": {
                bytes: 5,
                contentIndex: 0,
                expectedTime: "2026-07-03T00:00:00.000Z",
                path: destination,
                sha256:
                  "d59386e0ae435e292fbe0ebcdb954b75ed5fb3922091277cb19f798fc5d50718",
                status: "complete",
                url: "https://downloads.example/image-1.jpg",
              },
            },
          }),
          verify: true,
        },
        createPostSummary(),
      );

      const repaired = await stat(destination);

      expect(result.status).toBe("complete");
      expect(repaired.mtime.toISOString()).toBe("2026-07-03T00:00:00.000Z");
    });

    it("marks complete assets failed when verify finds a hash mismatch", async () => {
      const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-sync-post-"));
      const destination = join(rootPath, "0-image-1.jpg");
      await writeFile(destination, "corrupt");

      const result = await preSyncPostCheck(
        {
          logger: silentLogger,
          manifest: createManifest({
            assets: {
              "image-1": {
                bytes: 5,
                contentIndex: 0,
                expectedTime: "2026-07-03T00:00:00.000Z",
                path: destination,
                sha256:
                  "a3a6bf43aebbb02d55e6ba061dc496c6e06bb35b79e1cc102d5c4b82628e1df8",
                status: "complete",
                url: "https://downloads.example/image-1.jpg",
              },
            },
          }),
          verify: true,
        },
        createPostSummary(),
      );

      expect(result.status).toBe("partial");
      expect(result.assets["image-1"]).toMatchObject({
        error: "sha256 mismatch",
        status: "failed",
      });
    });

    it("normalizes verified asset timestamps to second precision", async () => {
      const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-sync-post-"));
      const destination = join(rootPath, "0-image-1.jpg");
      await writeFile(destination, "asset");
      await utimes(
        destination,
        new Date("2026-07-03T00:00:00Z"),
        new Date("2026-07-03T00:00:00Z"),
      );

      const result = await preSyncPostCheck(
        {
          logger: silentLogger,
          manifest: createManifest({
            assets: {
              "image-1": {
                bytes: 5,
                contentIndex: 0,
                expectedTime: "2026-07-03T00:00:00.500Z",
                path: destination,
                sha256:
                  "d59386e0ae435e292fbe0ebcdb954b75ed5fb3922091277cb19f798fc5d50718",
                status: "complete",
                url: "https://downloads.example/image-1.jpg",
              },
            },
          }),
          verify: true,
        },
        createPostSummary(),
      );

      expect(result.assets["image-1"]).toMatchObject({
        expectedTime: "2026-07-03T00:00:00.000Z",
        status: "complete",
      });
    });

    it("marks complete assets obsolete when verify cannot determine their content index", async () => {
      const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-sync-post-"));
      const destination = join(rootPath, "0-image-1.jpg");
      await writeFile(destination, "asset");

      const result = await preSyncPostCheck(
        {
          logger: silentLogger,
          manifest: createManifest({
            assets: {
              "image-1": {
                bytes: 5,
                expectedTime: "2026-07-03T00:00:00.000Z",
                path: destination,
                sha256:
                  "d59386e0ae435e292fbe0ebcdb954b75ed5fb3922091277cb19f798fc5d50718",
                status: "complete",
                url: "https://downloads.example/image-1.jpg",
              },
            },
          }),
          verify: true,
        },
        createPostSummary(),
      );

      expect(result.status).toBe("partial");
      expect(result.assets["image-1"]).toMatchObject({
        error: "content index missing",
        status: "obsolete",
      });
    });
  });
});

class FailingAssetTransport implements HttpTransport {
  fetch() {
    return Promise.resolve(new Response("failed", { status: 500 }));
  }
}

class SuccessfulAssetTransport implements HttpTransport {
  fetch() {
    return Promise.resolve(
      new Response("asset", {
        headers: { "Last-Modified": "Fri, 03 Jul 2026 00:00:00 GMT" },
      }),
    );
  }
}

const silentLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
} as never;

function createImage(id: string) {
  return {
    extension: "jpg",
    height: 100,
    id,
    originalUrl: `https://downloads.example/${id}.jpg`,
    thumbnailUrl: `https://downloads.example/${id}-thumbnail.jpg`,
    width: 100,
  };
}

function createImagePost({
  images = [createImage("image-1")],
}: {
  images?: ImagePost["body"]["images"];
} = {}): ImagePost {
  return {
    body: {
      images,
      text: "",
    },
    commentCount: 0,
    coverImageUrl: null,
    creatorId: "creator-1",
    excerpt: "",
    feeRequired: 0,
    hasAdultContent: false,
    id: "post-1",
    imageForShare: null,
    isCommentingRestricted: false,
    isLiked: false,
    isPinned: false,
    isRestricted: false,
    likeCount: 0,
    nextPost: null,
    prevPost: null,
    publishedDatetime: "2026-07-03T00:00:00+09:00",
    tags: [],
    title: "Post 1",
    type: "image",
    updatedDatetime: "2026-07-03T00:00:00+09:00",
    user: {
      iconUrl: "https://example.com/icon.jpg",
      name: "Creator 1",
      userId: "user-1",
    },
  };
}

function createManifest({
  assets,
}: {
  assets: PostManifestData["assets"];
}): Pick<CreatorManifest, "posts"> {
  return {
    posts: {
      "post-1": {
        assets,
        id: "post-1",
        restricted: false,
        status: "complete",
        updatedDatetime: "2026-07-03T00:00:00+09:00",
      },
    },
  };
}

function createPostSummary(): PostSummary {
  const post = createImagePost();

  return {
    commentCount: post.commentCount,
    cover: null,
    creatorId: post.creatorId,
    excerpt: post.excerpt,
    feeRequired: post.feeRequired,
    hasAdultContent: post.hasAdultContent,
    id: post.id,
    isCommentingRestricted: post.isCommentingRestricted,
    isLiked: post.isLiked,
    isPinned: post.isPinned,
    isRestricted: post.isRestricted,
    likeCount: post.likeCount,
    publishedDatetime: post.publishedDatetime,
    tags: post.tags,
    title: post.title,
    updatedDatetime: post.updatedDatetime,
    user: post.user,
  };
}
