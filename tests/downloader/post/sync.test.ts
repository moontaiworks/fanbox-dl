import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ImagePost } from "../../../src/client/types.js";
import { PathManager } from "../../../src/downloader/fs/path-manager.js";
import { syncPost } from "../../../src/downloader/post/sync.js";
import type { HttpTransport } from "../../../src/transport/http2.js";

describe("syncPost", () => {
  it("offsets downloaded asset timestamps by their content index", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-sync-post-"));
    const post = createImagePost({
      images: [createImage("image-1"), createImage("image-2")],
    });
    const pathManager = new PathManager({ flatPosts: false, rootPath });

    await syncPost(
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
