import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs, { mkdir, rename, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import type { HttpTransport } from "../../transport/http2.js";
import type { PathManager } from "../fs/path-manager.js";
import type { MediaContent } from "../post/content.js";

interface DownloadAssetDeps {
  headers?: Record<string, string>;
  pathManager: PathManager;
  transport: HttpTransport;
}

interface DownloadAssetOptions {
  destination: string;
  fallbackDateTime: string;
  mediaContent: MediaContent;
}

class AssetDownloadError extends Error {
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

export async function downloadAsset(
  { headers = {}, pathManager, transport }: DownloadAssetDeps,
  { destination, fallbackDateTime, mediaContent }: DownloadAssetOptions,
) {
  const tempDir = await fs.mkdtempDisposable(pathManager.name, {
    encoding: "utf-8",
  });
  const filename = `${mediaContent.id}.${mediaContent.extension}`;
  const tempFilePath = path.resolve(tempDir.path, filename);

  const { size: downloadedBytes } = await filesize(tempFilePath);
  if (downloadedBytes > 0) headers.Range = `bytes=${downloadedBytes}-`;

  const response = await transport.fetch(
    new Request(mediaContent.url, { headers }),
  );
  if (!response.ok) {
    throw new AssetDownloadError(
      response,
      mediaContent.url,
      await response.text(),
    );
  }

  await write(tempFilePath, response, downloadedBytes);

  const modified = response.headers.get("Last-Modified");
  const timestamp = modified ? new Date(modified) : new Date(fallbackDateTime);
  await utimes(tempFilePath, timestamp, timestamp);

  const [{ size: bytes }, sha256] = await Promise.all([
    stat(tempFilePath),
    hashFile(tempFilePath),
  ]);

  await mkdir(path.dirname(destination), { recursive: true });
  await rename(tempFilePath, destination);

  return { bytes, sha256 };
}

async function filesize(path: string) {
  return stat(path).catch(() => ({ size: 0 }));
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(filePath))
    hash.update(chunk as Buffer);

  return hash.digest("hex");
}

async function write(path: string, response: Response, partialBytes: number) {
  return pipeline(
    response.body ?? "",
    createWriteStream(path, {
      flags: response.status === 206 && partialBytes > 0 ? "a" : "w",
    }),
  );
}
