import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import type { HttpRequest, HttpResponse, HttpTransport } from "../http.js";
import { runCli } from "./cli.js";
import { logger } from "./logger.js";

function headers(input: HttpRequest | string | URL): Headers {
  if (typeof input === "string" || input instanceof URL) {
    return new Headers();
  }

  return new Headers(input.headers);
}

function requestUrl(input: HttpRequest | string | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url.toString();
}

function response(
  body: unknown,
  init: { status?: number; statusText?: string } = {},
): HttpResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const status = init.status ?? 200;

  return {
    body: Readable.from([text]),
    headers: new Headers(),
    json: () => Promise.resolve(JSON.parse(text) as unknown),
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? "",
    text: () => Promise.resolve(text),
  };
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
  it("prints help and exits successfully", async () => {
    const lines: string[] = [];
    logger.configure({ write: (line) => lines.push(line) });

    await expect(runCli(["--help"], {})).resolves.toBe(0);

    expect(lines.join("\n")).toContain("Usage: fanbox-dl download [options]");
    expect(lines.join("\n")).toContain("--dry-run");
    expect(lines.join("\n")).toContain("--flat-posts");
    expect(lines.join("\n")).toContain("--user-agent");
    expect(lines.join("\n")).toContain("--log-level");
    expect(lines.join("\n")).not.toContain("--verbose");
  });

  it("prints usage guidance for empty input", async () => {
    const lines: string[] = [];
    logger.configure({ write: (line) => lines.push(line) });

    await expect(runCli([], {})).resolves.toBe(2);

    expect(lines.join("\n")).toContain("Usage: fanbox-dl download [options]");
    expect(lines.join("\n")).toContain("at least one creator selector");
  });

  it("downloads a selected creator with the command entrypoint", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-cli-"));
    const transport: HttpTransport = {
      close: () => Promise.resolve(),
      request: (input) => {
        const url = new URL(requestUrl(input));
        if (url.pathname.endsWith("/post.listCreator")) {
          return Promise.resolve(response({ body: [summary()] }));
        }
        if (url.pathname.endsWith("/post.info")) {
          return Promise.resolve(
            response({
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
      },
    };

    await expect(
      runCli(
        ["download", "--creator", "creator", "--output", directory],
        {},
        { transport },
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
    const lines: string[] = [];
    logger.configure({ write: (line) => lines.push(line) });

    await expect(runCli(["download"], {})).resolves.toBe(2);

    expect(lines.join("\n")).toContain("at least one creator selector");
  });

  it("dry-runs selected creators without fetching post details or writing files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-cli-"));
    let postInfoCalls = 0;
    const lines: string[] = [];
    logger.configure({ write: (line) => lines.push(line) });
    const transport: HttpTransport = {
      close: () => Promise.resolve(),
      request: (input) => {
        const url = new URL(requestUrl(input));
        if (url.pathname.endsWith("/post.listCreator")) {
          return Promise.resolve(response({ body: [summary()] }));
        }
        if (url.pathname.endsWith("/post.info")) {
          postInfoCalls += 1;
        }

        throw new Error(`Unexpected request: ${url.href}`);
      },
    };

    await expect(
      runCli(
        [
          "download",
          "--creator",
          "creator",
          "--output",
          directory,
          "--dry-run",
        ],
        {},
        { transport },
      ),
    ).resolves.toBe(0);

    expect(postInfoCalls).toBe(0);
    await expect(stat(path.join(directory, "creator"))).rejects.toThrow();
    expect(lines.join("\n")).toContain("dry-run.post");
    expect(lines.join("\n")).toContain('"postId":"123"');
  });

  it("writes response debug logs for API errors when log level is debug", async () => {
    const lines: string[] = [];
    logger.configure({ write: (line) => lines.push(line) });
    const transport: HttpTransport = {
      close: () => Promise.resolve(),
      request: () =>
        Promise.resolve(
          response(
            { error: "nope" },
            { status: 500, statusText: "Internal Server Error" },
          ),
        ),
    };

    await expect(
      runCli(
        [
          "download",
          "--creator",
          "creator",
          "--dry-run",
          "--log-level",
          "debug",
        ],
        {},
        { transport },
      ),
    ).resolves.toBe(1);

    expect(lines.join("\n")).toContain('"level":"debug"');
    expect(lines.join("\n")).toContain('"status":500');
    expect(lines.join("\n")).toContain('"body":{"error":"nope"}');
  });

  it("passes a configured user agent to FANBOX API requests", async () => {
    let userAgent: null | string = null;
    const transport: HttpTransport = {
      close: () => Promise.resolve(),
      request: (input) => {
        userAgent = headers(input).get("User-Agent");
        return Promise.resolve(response({ body: [summary()] }));
      },
    };

    await expect(
      runCli(
        ["download", "--creator", "creator", "--dry-run", "--user-agent", "ua"],
        {},
        { transport },
      ),
    ).resolves.toBe(0);

    expect(userAgent).toBe("ua");
  });

  it("passes FANBOX request headers to asset downloads", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-cli-"));
    let assetHeaders = new Headers();
    const transport: HttpTransport = {
      close: () => Promise.resolve(),
      request: (input) => {
        const url = new URL(requestUrl(input));
        if (url.pathname.endsWith("/post.listCreator")) {
          return Promise.resolve(response({ body: [summary()] }));
        }
        if (url.pathname.endsWith("/post.info")) {
          return Promise.resolve(
            response({
              body: {
                ...summary(),
                body: {
                  images: [
                    {
                      extension: "png",
                      height: 1,
                      id: "image-id",
                      originalUrl: "https://downloads.example.test/image.png",
                      thumbnailUrl: "",
                      width: 1,
                    },
                  ],
                  text: "Hello",
                },
                coverImageUrl: null,
                imageForShare: null,
                nextPost: null,
                prevPost: null,
                type: "image",
              },
            }),
          );
        }
        if (url.hostname === "downloads.example.test") {
          assetHeaders = headers(input);
          return Promise.resolve(response("asset"));
        }

        throw new Error(`Unexpected request: ${url.href}`);
      },
    };

    await expect(
      runCli(
        [
          "download",
          "--creator",
          "creator",
          "--cookie",
          "FANBOXSESSID=session-id",
          "--output",
          directory,
          "--user-agent",
          "ua",
        ],
        {},
        { transport },
      ),
    ).resolves.toBe(0);

    expect(assetHeaders.get("Cookie")).toBe("FANBOXSESSID=session-id");
    expect(assetHeaders.get("Origin")).toBe("https://www.fanbox.cc");
    expect(assetHeaders.get("Referer")).toBe("https://www.fanbox.cc/");
    expect(assetHeaders.get("Sec-Fetch-Site")).toBe("same-site");
    expect(assetHeaders.get("User-Agent")).toBe("ua");
  });
});
