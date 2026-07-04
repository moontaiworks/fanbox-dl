import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import type { Logger } from "pino";

import type { HttpTransport } from "../../transport/http2.js";
import {
  exists,
  filesize,
  formatFileTimestamp,
  hashFile,
} from "../fs/filesystem.js";
import type { MediaContent } from "../post/content.js";

interface DownloadAssetDeps {
  headers?: Record<string, string>;
  logger: Logger;
  transport: HttpTransport;
}

interface DownloadAssetOptions {
  destination: string;
  fallbackDateTime: string;
  mediaContent: MediaContent;
  timeOffset: number;
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
  { headers = {}, logger, transport }: DownloadAssetDeps,
  {
    destination,
    fallbackDateTime,
    mediaContent,
    timeOffset,
  }: DownloadAssetOptions,
) {
  if (await exists(destination)) {
    logger.debug(`Asset ${mediaContent.id} already exists at ${destination}`);
    const [{ mtime, size: bytes }, sha256] = await Promise.all([
      stat(destination),
      hashFile(destination),
    ]);

    return { bytes, modifiedTime: formatFileTimestamp(mtime), sha256 };
  }

  logger.debug(
    `Downloading ${mediaContent.type} asset ${mediaContent.id} to ${destination}`,
  );
  await mkdir(path.dirname(destination), { recursive: true });
  const tempFilePath = destination + ".part";

  const currentHeaders = { ...headers };
  const { size: downloadedBytes } = await filesize(tempFilePath);
  if (downloadedBytes > 0) {
    logger.debug(
      `Resuming download of ${mediaContent.type} asset ${mediaContent.id} to ${tempFilePath} from byte ${downloadedBytes}`,
    );
    currentHeaders.Range = `bytes=${downloadedBytes}-`;
  }

  const response = await transport.fetch(
    new Request(mediaContent.url, { headers: currentHeaders }),
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
  const timestamp = offsetTimestamp(
    modified ? new Date(modified) : new Date(fallbackDateTime),
    timeOffset,
  );
  await utimes(tempFilePath, timestamp, timestamp);

  const [{ size: bytes }, sha256] = await Promise.all([
    filesize(tempFilePath),
    hashFile(tempFilePath),
  ]);

  await rename(tempFilePath, destination);
  const { mtime } = await stat(destination);

  return { bytes, modifiedTime: formatFileTimestamp(mtime), sha256 };
}

function offsetTimestamp(timestamp: Date, timeOffset: number): Date {
  return new Date(timestamp.getTime() + timeOffset * 1_000);
}

async function write(path: string, response: Response, partialBytes: number) {
  return pipeline(
    response.body ?? "",
    createWriteStream(path, {
      flags: response.status === 206 && partialBytes > 0 ? "a" : "w",
    }),
  );
}
