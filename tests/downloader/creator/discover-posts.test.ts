import type {
  ListCreatorPostsParams,
  PostSummary,
} from "../../../src/client/types.js";
import { discoverCreatorPosts } from "../../../src/downloader/creator/discover-posts.js";

describe("discoverCreatorPosts", () => {
  it("continues from the last post and removes the duplicated boundary post", async () => {
    const listCreatorPosts = vi
      .fn<(options: ListCreatorPostsParams) => Promise<PostSummary[]>>()
      .mockResolvedValueOnce([
        createPostSummary("post-1"),
        createPostSummary("post-2"),
      ])
      .mockResolvedValueOnce([
        createPostSummary("post-2"),
        createPostSummary("post-3"),
      ])
      .mockResolvedValueOnce([createPostSummary("post-3")]);

    const posts = await discoverCreatorPosts(
      { client: { listCreatorPosts } as never, logger: silentLogger },
      { creatorId: "creator-1", limit: 2 },
    );

    expect(posts.map((post) => post.id)).toEqual([
      "post-1",
      "post-2",
      "post-3",
    ]);
    expect(listCreatorPosts).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        firstId: "post-2",
        firstPublishedDatetime: "2026-07-03T00:00:00+09:00",
      }),
    );
  });
});

const silentLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
} as never;

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
