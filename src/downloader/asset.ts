import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import type { HttpTransport } from "../transport/http2.js";
import { assertPathBudget } from "./path.js";

export interface AssetDownloaderOptions {
  headers?: Record<string, string>;
  transport: HttpTransport;
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

export class AssetDownloader {
  readonly #headers: Record<string, string>;
  readonly #transport: HttpTransport;

  public constructor(options: AssetDownloaderOptions) {
    this.#headers = options.headers ?? {};
    this.#transport = options.transport;
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
    const headers: Record<string, string> = { ...this.#headers };
    if (partialBytes > 0) {
      headers.Range = `bytes=${partialBytes}-`;
    }

    const response = await this.#transport.fetch(
      new Request(options.url, { headers }),
    );
    if (!response.ok) {
      throw new AssetDownloadError(
        response,
        options.url,
        await readResponseBody(response),
      );
    }
    await pipeline(
      response.body ?? "",
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
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
