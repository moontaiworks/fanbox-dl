import type { FanboxClient } from "../../client/client.js";
import type { PostSummary } from "../../client/types.js";
import type { PathManager } from "../fs/path-manager.js";
import type { CreatorManifest } from "../manifest/creator.js";

interface SyncPostDeps {
  client: FanboxClient;
  manifest: CreatorManifest;
  pathManager: PathManager;
}

export async function syncPost(
  { manifest }: SyncPostDeps,
  postSummary: PostSummary,
) {
  if (postSummary.isRestricted) {
    // Not available for download, skip
    return;
  }
  const existingPost = manifest.posts[postSummary.id];
  if (postSummary.updatedDatetime === existingPost?.updatedDatetime) {
    // No changes since last download, skip
    return;
  }

  // need to download or update the local copy of the post
  return Promise.reject(new Error("Not implemented yet"));
}
