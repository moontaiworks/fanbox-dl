import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AssetDownloader } from "./asset.js";
import { RequestScheduler } from "./scheduler.js";

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
    const downloader = new AssetDownloader({
      fetch: (_input, init) => {
        range = new Headers(init?.headers).get("Range");
        return Promise.resolve(
          new Response("def", {
            headers: { "Last-Modified": "Wed, 27 May 2026 12:17:41 GMT" },
            status: 206,
          }),
        );
      },
      scheduler: new RequestScheduler({ concurrency: 1 }),
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

  it("restarts a partial asset when the server returns a full response", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fanbox-asset-"));
    const destination = path.join(directory, "asset.bin");
    await writeFile(`${destination}.part`, "old");
    const downloader = new AssetDownloader({
      fetch: () => Promise.resolve(new Response("new", { status: 200 })),
      scheduler: new RequestScheduler({ concurrency: 1 }),
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
      fetch: () => Promise.resolve(new Response("data", { status: 200 })),
      scheduler: new RequestScheduler({ concurrency: 1 }),
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
