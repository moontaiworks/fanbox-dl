import { stat, utimes } from "node:fs/promises";

import type { Logger } from "pino";

import type { PostSummary } from "../../client/types.js";
import { discardMilliseconds, exists, hashFile } from "../fs/filesystem.js";
import type {
  AssetManifestData,
  PostManifestData,
} from "../manifest/creator.js";

interface VerifyPostCheckDeps {
  logger: Logger;
}

export async function verifyCompletePost(
  { logger }: VerifyPostCheckDeps,
  manifest: PostManifestData,
  postSummary: PostSummary,
): Promise<PostManifestData> {
  const assets = Object.fromEntries(
    await Promise.all(
      Object.entries(manifest.assets).map(
        async ([id, asset]) =>
          [
            id,
            asset ? await verifyAsset({ logger }, asset, postSummary) : asset,
          ] satisfies [string, AssetManifestData | undefined],
      ),
    ),
  );
  const hasFailedAsset = Object.values(assets).some(
    (asset) => asset && asset.status !== "complete",
  );

  return {
    ...manifest,
    assets,
    status: hasFailedAsset ? "partial" : "complete",
  };
}

function failedAsset(
  asset: AssetManifestData,
  error: string,
): AssetManifestData {
  return {
    ...asset,
    error,
    status: "failed",
  };
}

function obsoleteAsset(
  asset: AssetManifestData,
  error: string,
): AssetManifestData {
  return {
    ...asset,
    error,
    status: "obsolete",
  };
}

async function verifyAsset(
  { logger }: VerifyPostCheckDeps,
  asset: AssetManifestData,
  postSummary: PostSummary,
): Promise<AssetManifestData> {
  if (asset.status !== "complete") {
    return asset;
  }

  if (asset.contentIndex === undefined) {
    return obsoleteAsset(asset, "content index missing");
  }

  if (!(await exists(asset.path))) {
    return failedAsset(asset, "file missing");
  }

  const actualSha256 = await hashFile(asset.path);
  if (actualSha256 !== asset.sha256) {
    return failedAsset(asset, "sha256 mismatch");
  }

  const expectedTime = discardMilliseconds(
    new Date(
      new Date(postSummary.publishedDatetime).getTime() +
        asset.contentIndex * 1_000,
    ),
  );
  const { mtimeMs } = await stat(asset.path);
  if (
    discardMilliseconds(new Date(mtimeMs)).getTime() !== expectedTime.getTime()
  ) {
    logger.debug(
      `Repairing modified time of verified asset ${asset.path} from ${new Date(mtimeMs).toISOString()} to ${expectedTime.toISOString()}`,
    );
    await utimes(asset.path, expectedTime, expectedTime);
  }

  return { ...asset };
}
