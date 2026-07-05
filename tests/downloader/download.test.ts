import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PostSummary } from "../../src/client/types.js";
import type { DownloadOptions } from "../../src/downloader/cli/options.js";
import { download } from "../../src/downloader/index.js";
import type { HttpTransport } from "../../src/transport/http2.js";

describe("download", () => {
  it("records creator sync failures in the manifest", async () => {
    const output = await mkdtemp(join(tmpdir(), "fanbox-dl-download-"));
    const failed = await download(
      {
        logger: silentLogger,
        transport: new FailedCreatorSyncTransport(),
      },
      createDownloadOptions({ output }),
    );
    const manifest = JSON.parse(
      await readFile(join(output, "creator-1", "manifest.json"), "utf8"),
    ) as { error?: string };

    expect(failed).toEqual(true);
    expect(manifest.error).toContain("FANBOX API request failed: 500");
  });

  it("returns creators with failed posts after sync completes", async () => {
    const output = await mkdtemp(join(tmpdir(), "fanbox-dl-download-"));
    const failed = await download(
      {
        logger: silentLogger,
        transport: new FailedPostInfoTransport(),
      },
      createDownloadOptions({ output }),
    );

    expect(failed).toEqual(true);
  });
});

class FailedCreatorSyncTransport implements HttpTransport {
  fetch(input: Request | string | URL) {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);
    if (url.pathname === "/post.listCreator") {
      return Promise.resolve(jsonResponse({ error: "failed" }, 500));
    }

    return Promise.resolve(jsonResponse({ error: "unexpected request" }, 404));
  }
}

class FailedPostInfoTransport implements HttpTransport {
  fetch(input: Request | string | URL) {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);
    if (url.pathname === "/post.listCreator") {
      return Promise.resolve(jsonResponse([createPostSummary()]));
    }

    if (url.pathname === "/post.info") {
      return Promise.resolve(jsonResponse({ error: "failed" }, 500));
    }

    return Promise.resolve(jsonResponse({ error: "unexpected request" }, 404));
  }
}

const silentLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
} as never;

function createDownloadOptions(
  options: Pick<DownloadOptions, "output">,
): DownloadOptions {
  return {
    concurrency: 10,
    creatorIds: ["creator-1"],
    flatParentMinBytes: 35,
    flatPosts: false,
    following: false,
    http2SessionMultiplier: 10,
    ignoreCreatorIds: [],
    maxFilenameBytes: 255,
    maxRetries: 0,
    output: options.output,
    requestIntervalMs: 0,
    supporting: false,
    verify: false,
  };
}

function createPostSummary(): PostSummary {
  return {
    commentCount: 0,
    cover: null,
    creatorId: "creator-1",
    excerpt: "",
    feeRequired: 0,
    hasAdultContent: false,
    id: "post-1",
    isCommentingRestricted: false,
    isLiked: false,
    isPinned: false,
    isRestricted: false,
    likeCount: 0,
    publishedDatetime: "2026-07-03T00:00:00+09:00",
    tags: [],
    title: "Post 1",
    updatedDatetime: "2026-07-03T00:00:00+09:00",
    user: {
      iconUrl: "https://example.com/icon.jpg",
      name: "Creator 1",
      userId: "user-1",
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify({ body }), {
    headers: { "content-type": "application/json" },
    status,
  });
}
