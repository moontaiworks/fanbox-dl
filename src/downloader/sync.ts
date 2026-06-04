import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  ArticlePost,
  FilePost,
  ImagePost,
  Post,
  PostSummary,
} from "../types.js";
import type { AssetDownloader } from "./asset.js";
import { type CreatorPostClient, discoverCreatorPosts } from "./discovery.js";
import { logDebugErrorResponse } from "./errors.js";
import { type Logger, silentLogger } from "./logger.js";
import {
  type AssetManifestEntry,
  type CreatorManifest,
  ManifestStore,
  type PostManifestEntry,
} from "./manifest.js";
import { renderPostMarkdown } from "./markdown.js";
import {
  assertPathBudget,
  createCreatorDirectoryName,
  createPostDirectoryName,
  sanitizePathComponent,
  sanitizePathComponentForDirectory,
} from "./path.js";

export interface SyncClient extends CreatorPostClient {
  getPost(params: { postId: string }): Promise<Post>;
}

export interface SyncCreatorOptions {
  assetDownloader: AssetDownloader;
  client: SyncClient;
  creatorId: string;
  flatPosts?: boolean;
  logger?: Logger;
  outputDirectory: string;
  verifyAssets?: boolean;
}

interface AssetDescriptor {
  key: string;
  relativePath: string;
  url: string;
}

interface PostLayout {
  contentPath: string;
  directory: string;
  metadataPath: string;
  postName: string;
  summaryPath: string;
}

export async function syncCreator(
  options: SyncCreatorOptions,
): Promise<CreatorManifest> {
  const store = new ManifestStore(options.outputDirectory, options.creatorId);
  const manifest = await store.load();
  for (const summary of await discoverCreatorPosts(
    options.client,
    options.creatorId,
    {
      logger: options.logger,
    },
  )) {
    await syncPost(options, manifest, summary, store);
  }

  return manifest;
}

async function archiveObsoleteAssets(
  creatorDirectory: string,
  postEntry: PostManifestEntry,
  assets: AssetDescriptor[],
): Promise<void> {
  const currentKeys = new Set(assets.map((asset) => asset.key));
  for (const [key, entry] of Object.entries(postEntry.assets)) {
    if (!entry) {
      continue;
    }
    if (!currentKeys.has(key) && entry.status !== "obsolete") {
      const source = path.join(creatorDirectory, entry.path);
      const archiveDirectory = path.join(
        creatorDirectory,
        postEntry.directory,
        "archived",
      );
      await mkdir(archiveDirectory, { recursive: true });
      if (await exists(source)) {
        await rename(
          source,
          path.join(archiveDirectory, path.basename(entry.path)),
        );
      }
      entry.status = "obsolete";
    }
  }
}

function assetPath(
  assetDirectory: string,
  postName: string,
  index: number,
  name: string,
  extension: string,
): string {
  const safeExtension = sanitizePathComponent(extension, { maxBytes: 16 });
  const sequence = String(index).padStart(2, "0");
  return sanitizePathComponentForDirectory(
    `${postName}_${sequence}_${name}`,
    assetDirectory,
    { suffix: `.${safeExtension}` },
  );
}

function createPostLayout(
  summary: PostSummary,
  creatorDirectory: string,
  flatPosts = false,
): PostLayout {
  const postName = createPostDirectoryName(
    summary,
    flatPosts ? creatorDirectory : path.join(creatorDirectory, "posts"),
  );
  if (flatPosts) {
    return {
      contentPath: `${postName}_content.md`,
      directory: ".",
      metadataPath: `${postName}_metadata.json`,
      postName,
      summaryPath: `${postName}_summary.json`,
    };
  }

  const directory = path.posix.join("posts", postName);
  return {
    contentPath: path.posix.join(directory, "content.md"),
    directory,
    metadataPath: path.posix.join(directory, "metadata.json"),
    postName,
    summaryPath: path.posix.join(directory, "summary.json"),
  };
}

async function exists(filePath: string): Promise<boolean> {
  return stat(filePath)
    .then(() => true)
    .catch(() => false);
}

function extensionFromUrl(url: string, fallback: string): string {
  return path.extname(new URL(url).pathname).slice(1) || fallback;
}

function listAssets(
  post: Post,
  assetDirectory: string,
  postName: string,
): AssetDescriptor[] {
  const assets: AssetDescriptor[] = [];
  if (post.coverImageUrl) {
    assets.push({
      key: "cover",
      relativePath: assetPath(
        assetDirectory,
        postName,
        assets.length,
        `cover_${post.id}`,
        extensionFromUrl(post.coverImageUrl, "jpg"),
      ),
      url: post.coverImageUrl,
    });
  }
  if (post.type === "image") {
    for (const image of (post as ImagePost).body.images) {
      assets.push({
        key: `image:${image.id}`,
        relativePath: assetPath(
          assetDirectory,
          postName,
          assets.length,
          `image_${image.id}`,
          image.extension,
        ),
        url: image.originalUrl,
      });
    }
  }
  if (post.type === "file") {
    for (const file of (post as FilePost).body.files) {
      assets.push({
        key: `file:${file.id}`,
        relativePath: assetPath(
          assetDirectory,
          postName,
          assets.length,
          `file_${file.id}_${file.name}`,
          file.extension,
        ),
        url: file.url,
      });
    }
  }
  if (post.type === "article") {
    const article = post as ArticlePost;
    for (const image of Object.values(article.body.imageMap)) {
      assets.push({
        key: `image:${image.id}`,
        relativePath: assetPath(
          assetDirectory,
          postName,
          assets.length,
          `image_${image.id}`,
          image.extension,
        ),
        url: image.originalUrl,
      });
    }
    for (const file of Object.values(article.body.fileMap)) {
      assets.push({
        key: `file:${file.id}`,
        relativePath: assetPath(
          assetDirectory,
          postName,
          assets.length,
          `file_${file.id}_${file.name}`,
          file.extension,
        ),
        url: file.url,
      });
    }
  }

  return assets;
}

function markdownAssetPath(contentPath: string, assetPath: string): string {
  const relative = path.posix.relative(
    path.posix.dirname(contentPath),
    assetPath,
  );
  return (relative || path.posix.basename(assetPath)).replace(/^\.\//, "");
}

async function moveExistingAsset(
  creatorDirectory: string,
  existing: AssetManifestEntry,
  manifestPath: string,
): Promise<boolean> {
  if (existing.path === manifestPath) {
    return exists(path.join(creatorDirectory, existing.path));
  }

  const source = path.join(creatorDirectory, existing.path);
  const destination = path.join(creatorDirectory, manifestPath);
  if (await exists(destination)) {
    existing.path = manifestPath;
    return true;
  }
  if (!(await exists(source))) {
    return false;
  }

  await rename(source, destination);
  existing.path = manifestPath;
  return true;
}

async function syncPost(
  options: SyncCreatorOptions,
  manifest: CreatorManifest,
  summary: PostSummary,
  store: ManifestStore,
): Promise<void> {
  const logger = options.logger ?? silentLogger;
  const creatorDirectory = path.join(
    options.outputDirectory,
    createCreatorDirectoryName(options.creatorId, options.outputDirectory),
  );
  const layout = createPostLayout(summary, creatorDirectory, options.flatPosts);
  let entry = manifest.posts[summary.id];
  let renamed = false;
  if (entry && entry.directory !== layout.directory) {
    const previousDirectory = entry.directory;
    const oldDirectory = path.join(creatorDirectory, entry.directory);
    if (layout.directory !== "." && (await exists(oldDirectory))) {
      await mkdir(path.dirname(path.join(creatorDirectory, layout.directory)), {
        recursive: true,
      });
      await rename(oldDirectory, path.join(creatorDirectory, layout.directory));
    }
    entry.directory = layout.directory;
    if (layout.directory !== ".") {
      for (const asset of Object.values(entry.assets)) {
        if (asset?.path.startsWith(`${previousDirectory}/`)) {
          asset.path = `${layout.directory}${asset.path.slice(previousDirectory.length)}`;
        }
      }
    }
    renamed = true;
  }
  entry ??= {
    assets: {},
    directory: layout.directory,
    id: summary.id,
    restricted: summary.isRestricted,
    status: "pending",
    updatedDatetime: summary.updatedDatetime,
  };
  manifest.posts[summary.id] = entry;
  const postDirectory = path.join(creatorDirectory, entry.directory);
  assertPathBudget(postDirectory);
  await mkdir(postDirectory, { recursive: true });
  await writeTimestampedJson(
    path.join(creatorDirectory, layout.summaryPath),
    summary,
    summary.publishedDatetime,
  );
  if (summary.isRestricted) {
    entry.restricted = true;
    entry.status = "skipped";
    entry.updatedDatetime = summary.updatedDatetime;
    await store.save(manifest);
    return;
  }
  const coverChanged = entry.assets.cover?.url !== summary.cover?.url;
  if (
    entry.status === "complete" &&
    entry.updatedDatetime === summary.updatedDatetime &&
    !coverChanged
  ) {
    if (
      !options.verifyAssets ||
      (await verifyAssets(creatorDirectory, entry))
    ) {
      if (!renamed) {
        return;
      }
    }
    entry.status = "pending";
  }

  try {
    const post = await options.client.getPost({ postId: summary.id });
    const assets = listAssets(post, postDirectory, layout.postName);
    await archiveObsoleteAssets(creatorDirectory, entry, assets);
    const paths = new Map<string, string>();
    const downloads = (
      await Promise.all(
        assets.map(async (asset) => {
          const manifestPath = path.posix.join(
            entry.directory,
            asset.relativePath,
          );
          paths.set(
            asset.key,
            markdownAssetPath(layout.contentPath, manifestPath),
          );
          const existing = entry.assets[asset.key];
          if (
            existing?.status === "complete" &&
            existing.url === asset.url &&
            (await moveExistingAsset(creatorDirectory, existing, manifestPath))
          ) {
            return undefined;
          }
          const assetEntry: AssetManifestEntry = {
            path: manifestPath,
            status: "downloading",
            url: asset.url,
          };
          entry.assets[asset.key] = assetEntry;
          return { asset, assetEntry, manifestPath };
        }),
      )
    ).filter((download) => download !== undefined);
    await store.save(manifest);
    await Promise.all(
      downloads.map(async ({ asset, assetEntry, manifestPath }) => {
        try {
          Object.assign(
            assetEntry,
            await options.assetDownloader.download({
              publishedDatetime: summary.publishedDatetime,
              relativePath: manifestPath,
              rootDirectory: creatorDirectory,
              url: asset.url,
            }),
            { status: "complete" },
          );
          logger.info("asset.download.complete", "Asset downloaded", {
            assetId: asset.key,
            bytes: assetEntry.bytes,
            creatorId: options.creatorId,
            postId: summary.id,
          });
        } catch (error) {
          logDebugErrorResponse(logger, error, {
            assetId: asset.key,
            creatorId: options.creatorId,
            postId: summary.id,
          });
          assetEntry.error = String(error);
          assetEntry.status = "failed";
          logger.error("asset.download.failed", "Asset download failed", {
            assetId: asset.key,
            creatorId: options.creatorId,
            error: String(error),
            postId: summary.id,
          });
        }
      }),
    );
    await writeTimestampedJson(
      path.join(creatorDirectory, layout.metadataPath),
      post,
      summary.publishedDatetime,
    );
    await writeFile(
      path.join(creatorDirectory, layout.contentPath),
      renderPostMarkdown(post, paths),
    );
    const published = new Date(summary.publishedDatetime);
    await utimes(
      path.join(creatorDirectory, layout.contentPath),
      published,
      published,
    );
    entry.restricted = false;
    entry.status = downloads.some(
      ({ assetEntry }) => assetEntry.status === "failed",
    )
      ? "failed"
      : "complete";
    entry.updatedDatetime = summary.updatedDatetime;
  } catch (error) {
    logDebugErrorResponse(logger, error, {
      creatorId: options.creatorId,
      postId: summary.id,
    });
    entry.error = String(error);
    entry.status = "failed";
    logger.error("post.sync.failed", "Post sync failed", {
      creatorId: options.creatorId,
      error: String(error),
      postId: summary.id,
    });
  }
  await store.save(manifest);
}

async function verifyAssets(
  creatorDirectory: string,
  entry: PostManifestEntry,
): Promise<boolean> {
  for (const asset of Object.values(entry.assets)) {
    if (!asset) {
      return false;
    }
    if (
      asset.status !== "complete" ||
      asset.bytes === undefined ||
      asset.sha256 === undefined
    ) {
      asset.status = "pending";
      return false;
    }
    try {
      const filePath = path.join(creatorDirectory, asset.path);
      if ((await stat(filePath)).size !== asset.bytes) {
        asset.status = "pending";
        return false;
      }
      const digest = createHash("sha256")
        .update(await readFile(filePath))
        .digest("hex");
      if (digest !== asset.sha256) {
        asset.status = "pending";
        return false;
      }
    } catch {
      asset.status = "pending";
      return false;
    }
  }

  return true;
}

async function writeTimestampedJson(
  filePath: string,
  value: unknown,
  timestamp: string,
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
  const date = new Date(timestamp);
  await utimes(filePath, date, date);
}
