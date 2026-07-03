import type { ArticlePost } from "../../../src/client/types.js";
import { formatArticleContents } from "../../../src/downloader/post/article.js";
import { TextContent } from "../../../src/downloader/post/content.js";

describe("formatArticleContents", () => {
  it("keeps supported content and skips unknown article blocks", () => {
    const contents = formatArticleContents({
      ...createArticlePost(),
      body: {
        blocks: [
          { text: "Heading", type: "header" },
          { text: "Paragraph", type: "p" },
          { type: "unknown" },
        ],
        embedMap: {},
        fileMap: {},
        imageMap: {},
        urlEmbedMap: {},
      },
    });

    expect(contents).toHaveLength(2);
    expect(contents).toEqual([
      expect.any(TextContent),
      expect.any(TextContent),
    ]);
  });
});

function createArticlePost(): ArticlePost {
  return {
    body: {
      blocks: [],
      embedMap: {},
      fileMap: {},
      imageMap: {},
      urlEmbedMap: {},
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
    type: "article",
    updatedDatetime: "2026-07-03T00:00:00+09:00",
    user: {
      iconUrl: "https://example.com/icon.jpg",
      name: "Creator 1",
      userId: "user-1",
    },
  };
}
