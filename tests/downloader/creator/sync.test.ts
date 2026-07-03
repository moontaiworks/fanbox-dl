import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FanboxClient } from "../../../src/client/client.js";
import type { PostSummary, TextPost } from "../../../src/client/types.js";
import { syncCreator } from "../../../src/downloader/creator/sync.js";
import { PathManager } from "../../../src/downloader/fs/path-manager.js";
import { CreatorManifest } from "../../../src/downloader/manifest/creator.js";
import type { HttpTransport } from "../../../src/transport/http2.js";

describe("syncCreator", () => {
  it("logs the post index from the current iteration when post sync fails", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "fanbox-dl-sync-creator-"));
    const error = vi.fn<(context: unknown, message: string) => void>();
    const logger = createLogger({ error });
    const manifest = new CreatorManifest(
      {
        logger,
        pathManager: new PathManager({ flatPosts: false, rootPath }),
      },
      "creator-1",
    );
    await manifest.load();

    await syncCreator({
      client: new FailingPostSyncClient() as unknown as FanboxClient,
      logger,
      manifest,
      pathManager: new PathManager({ flatPosts: false, rootPath }),
      transport: new UnusedTransport(),
    });

    const messages = error.mock.calls.map(([, message]) => message);

    expect(messages).toContain(
      "Error occurred while syncing 1/2 post post-1, skipping.",
    );
    expect(messages).toContain(
      "Error occurred while syncing 2/2 post post-2, skipping.",
    );
  });
});

class FailingPostSyncClient {
  getPost({ postId }: { postId: string }) {
    return Promise.resolve(createTextPost(postId));
  }

  listCreatorPosts() {
    return Promise.resolve([
      createPostSummary("post-1"),
      createPostSummary("post-2"),
    ]);
  }
}

class UnusedTransport implements HttpTransport {
  fetch() {
    return Promise.reject(new Error("Unexpected transport call"));
  }
}

function createLogger({
  error,
}: {
  error: (context: unknown, message: string) => void;
}) {
  return {
    debug: vi.fn(),
    error,
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
  } as never;
}

function createPostSummary(id: string): PostSummary {
  return {
    commentCount: 0,
    cover: null,
    creatorId: "creator-1",
    excerpt: "",
    feeRequired: 0,
    hasAdultContent: false,
    id,
    isCommentingRestricted: false,
    isLiked: false,
    isPinned: false,
    isRestricted: false,
    likeCount: 0,
    publishedDatetime: "2026-07-03T00:00:00+09:00",
    tags: [],
    title: id,
    updatedDatetime: "2026-07-03T00:00:00+09:00",
    user: {
      iconUrl: "https://example.com/icon.jpg",
      name: "Creator 1",
      userId: "user-1",
    },
  };
}

function createTextPost(id: string): TextPost {
  return {
    ...createPostSummary(id),
    body: { text: "hello" },
    coverImageUrl: null,
    imageForShare: null,
    nextPost: null,
    prevPost: null,
    type: "text",
  };
}
