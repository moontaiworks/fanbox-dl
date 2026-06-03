import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import type { HttpRequest, HttpResponse, HttpTransport } from "../http.js";
import { AssetDownloader } from "./asset.js";
import { RequestScheduler } from "./scheduler.js";

function requestHeaders(request: HttpRequest | string | URL): Headers {
  if (typeof request === "string" || request instanceof URL) {
    return new Headers();
  }

  return new Headers(request.headers);
}

function response(
  body: string,
  init: {
    headers?: Headers | Record<string, string>;
    status?: number;
    statusText?: string;
  } = {},
): HttpResponse {
  const status = init.status ?? 200;

  return {
    body: Readable.from([body]),
    headers: new Headers(init.headers),
    json: () => Promise.resolve(JSON.parse(body) as unknown),
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? "",
    text: () => Promise.resolve(body),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("AssetDownloader", () => {
  it("resumes a partial asset with a range request", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-asset-"));
    const destination = path.join(directory, "assets", "image.png");
    await writeFile(`${destination}.part`, "abc", { flag: "w" }).catch(
      async () => {
        const { mkdir } = await import("node:fs/promises");
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(`${destination}.part`, "abc");
      },
    );
    let range: null | string = null;
    const transport: HttpTransport = {
      close: () => Promise.resolve(),
      request: (request) => {
        range = requestHeaders(request).get("Range");
        return Promise.resolve(
          response("def", {
            headers: { "Last-Modified": "Wed, 27 May 2026 12:17:41 GMT" },
            status: 206,
          }),
        );
      },
    };
    const downloader = new AssetDownloader({
      scheduler: new RequestScheduler({ concurrency: 1 }),
      transport,
    });

    const result = await downloader.download({
      publishedDatetime: "2026-05-27T21:17:41+09:00",
      relativePath: "assets/image.png",
      rootDirectory: directory,
      url: "https://example.test/image.png",
    });

    expect(range).toBe("bytes=3-");
    await expect(readFile(destination, "utf8")).resolves.toBe("abcdef");
    expect(result).toMatchObject({ bytes: 6, sha256: sha256("abcdef") });
  });

  it("merges default request headers with the range request", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-asset-"));
    const destination = path.join(directory, "asset.bin");
    await writeFile(`${destination}.part`, "abc");
    let capturedHeaders = new Headers();
    const downloader = new AssetDownloader({
      headers: {
        Cookie: "FANBOXSESSID=session-id",
        "User-Agent": "ua",
      },
      scheduler: new RequestScheduler({ concurrency: 1 }),
      transport: {
        close: () => Promise.resolve(),
        request: (request) => {
          capturedHeaders = requestHeaders(request);
          return Promise.resolve(response("def", { status: 206 }));
        },
      },
    });

    await downloader.download({
      publishedDatetime: "2026-05-27T21:17:41+09:00",
      relativePath: "asset.bin",
      rootDirectory: directory,
      url: "https://example.test/asset.bin",
    });

    expect(capturedHeaders.get("Cookie")).toBe("FANBOXSESSID=session-id");
    expect(capturedHeaders.get("Range")).toBe("bytes=3-");
    expect(capturedHeaders.get("User-Agent")).toBe("ua");
  });

  it("restarts a partial asset when the server returns a full response", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-asset-"));
    const destination = path.join(directory, "asset.bin");
    await writeFile(`${destination}.part`, "old");
    const downloader = new AssetDownloader({
      scheduler: new RequestScheduler({ concurrency: 1 }),
      transport: {
        close: () => Promise.resolve(),
        request: () => Promise.resolve(response("new", { status: 200 })),
      },
    });

    await downloader.download({
      publishedDatetime: "2026-05-27T21:17:41+09:00",
      relativePath: "asset.bin",
      rootDirectory: directory,
      url: "https://example.test/asset.bin",
    });

    await expect(readFile(destination, "utf8")).resolves.toBe("new");
    expect((await stat(destination)).mtime.toISOString()).toBe(
      "2026-05-27T12:17:41.000Z",
    );
  });

  it("rejects an asset path over the cross-platform budget", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-asset-"));
    const downloader = new AssetDownloader({
      scheduler: new RequestScheduler({ concurrency: 1 }),
      transport: {
        close: () => Promise.resolve(),
        request: () => Promise.resolve(response("data", { status: 200 })),
      },
    });

    await expect(
      downloader.download({
        publishedDatetime: "2026-05-27T21:17:41+09:00",
        relativePath: `${"x".repeat(300)}.bin`,
        rootDirectory: directory,
        url: "https://example.test/asset.bin",
      }),
    ).rejects.toThrow(/path budget/i);
  });
});
