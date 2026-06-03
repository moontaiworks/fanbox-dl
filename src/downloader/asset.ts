import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { assertPathBudget } from "./path.js";
import type { RequestScheduler } from "./scheduler.js";

export interface AssetDownloaderOptions {
  fetch?: Fetch;
  scheduler: RequestScheduler;
}

export interface AssetDownloadOptions {
  publishedDatetime: string;
  relativePath: string;
  rootDirectory: string;
  url: string;
}

export interface AssetDownloadResult {
  bytes: number;
  sha256: string;
}

type Fetch = typeof globalThis.fetch;

export class AssetDownloader {
  readonly #fetch: Fetch;
  readonly #scheduler: RequestScheduler;

  public constructor(options: AssetDownloaderOptions) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#scheduler = options.scheduler;
  }

  public async download(
    options: AssetDownloadOptions,
  ): Promise<AssetDownloadResult> {
    const destination = path.join(options.rootDirectory, options.relativePath);
    const temporaryPath = `${destination}.part`;
    assertPathBudget(temporaryPath);
    await mkdir(path.dirname(destination), { recursive: true });
    const partialBytes = await stat(temporaryPath)
      .then((result) => result.size)
      .catch(() => 0);
    const headers = new Headers();
    if (partialBytes > 0) {
      headers.set("Range", `bytes=${partialBytes}-`);
    }

    const response = await this.#scheduler.fetch(options.url, this.#fetch, {
      headers,
    });
    if (!response.ok) {
      throw new AssetDownloadError(
        response,
        options.url,
        await readResponseBody(response),
      );
    }
    if (!response.body) {
      throw new Error(`Asset download returned no body: ${options.url}`);
    }
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream),
      createWriteStream(temporaryPath, {
        flags: response.status === 206 && partialBytes > 0 ? "a" : "w",
      }),
    );
    await rename(temporaryPath, destination);

    const modified = response.headers.get("Last-Modified");
    const timestamp = modified
      ? new Date(modified)
      : new Date(options.publishedDatetime);
    await utimes(destination, timestamp, timestamp);

    return {
      bytes: (await stat(destination)).size,
      sha256: await hashFile(destination),
    };
  }
}

export class AssetDownloadError extends Error {
  public readonly body: unknown;
  public readonly status: number;
  public readonly statusText: string;
  public readonly url: string;

  public constructor(response: Response, url: string, body: unknown) {
    super(`Asset download failed: ${response.status} ${url}`);
    this.name = "AssetDownloadError";
    this.body = body;
    this.status = response.status;
    this.statusText = response.statusText;
    this.url = url;
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }

  return hash.digest("hex");
}

async function readResponseBody(response: Response): Promise<unknown> {
  return response
    .clone()
    .json()
    .catch(async () => response.text());
}
