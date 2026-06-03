import { describe, expect, it } from "vitest";

import type { ArticlePost, ImagePost, VideoPost } from "../types.js";
import { renderPostMarkdown } from "./markdown.js";

const basePost = {
  commentCount: 0,
  coverImageUrl: null,
  creatorId: "creator",
  excerpt: "",
  feeRequired: 0,
  hasAdultContent: false,
  id: "123",
  imageForShare: null,
  isCommentingRestricted: false,
  isLiked: false,
  isPinned: false,
  isRestricted: false,
  likeCount: 0,
  nextPost: null,
  prevPost: null,
  publishedDatetime: "2026-05-27T21:17:41+09:00",
  tags: [],
  title: "Title",
  updatedDatetime: "2026-05-27T21:17:41+09:00",
  user: { iconUrl: "", name: "Creator", userId: "1" },
};

describe("renderPostMarkdown", () => {
  it("renders image posts with local asset links", () => {
    const post: ImagePost = {
      ...basePost,
      body: {
        images: [
          {
            extension: "png",
            height: 1,
            id: "image-id",
            originalUrl: "https://example.test/image.png",
            thumbnailUrl: "https://example.test/thumb.jpg",
            width: 1,
          },
        ],
        text: "Hello",
      },
      type: "image",
    };

    expect(
      renderPostMarkdown(
        post,
        new Map([["image:image-id", "assets/image.png"]]),
      ),
    ).toContain("![image-id](./assets/image.png)");
  });

  it("renders article blocks in source order", () => {
    const post: ArticlePost = {
      ...basePost,
      body: {
        blocks: [
          { text: "Header", type: "header" },
          { text: "Paragraph", type: "p" },
          { imageId: "image-id", type: "image" },
        ],
        fileMap: {},
        imageMap: {},
        urlEmbedMap: {},
      },
      type: "article",
    };

    expect(
      renderPostMarkdown(
        post,
        new Map([["image:image-id", "assets/image.png"]]),
      ),
    ).toContain("# Header\n\nParagraph\n\n![image-id](assets/image.png)");
  });

  it("renders video provider details", () => {
    const post: VideoPost = {
      ...basePost,
      body: {
        text: "Watch",
        video: { serviceProvider: "youtube", videoId: "abc" },
      },
      type: "video",
    };

    expect(renderPostMarkdown(post, new Map())).toContain("youtube: abc");
  });
});
