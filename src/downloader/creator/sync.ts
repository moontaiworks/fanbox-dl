import type { FanboxClient } from "../../client/client.js";
import type { PathManager } from "../fs/path-manager.js";
import type { CreatorManifest, PostManifestData } from "../manifest/creator.js";
import { syncPost } from "../post/sync.js";
import { discoverAllPosts } from "./discover-posts.js";

interface SyncCreatorDeps {
  client: FanboxClient;
  manifest: CreatorManifest;
  pathManager: PathManager;
}

export async function syncCreator({
  client,
  manifest,
  pathManager,
}: SyncCreatorDeps) {
  const posts = await discoverAllPosts(
    { client },
    { creatorId: manifest.creatorId },
  );

  const syncPostDeps = { client, manifest, pathManager };

  for (const postSummary of posts) {
    manifest.posts[postSummary.id] = await syncPost(
      syncPostDeps,
      postSummary,
    ).catch(
      (error: unknown): PostManifestData => ({
        assets: {},
        error: String(error),
        id: postSummary.id,
        restricted: postSummary.isRestricted,
        status: "failed",
        updatedDatetime: postSummary.updatedDatetime,
      }),
    );
  }
}
