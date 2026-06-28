import type { FanboxClient } from "../../client/client.js";
import type { HttpTransport } from "../../transport/http2.js";
import type { PathManager } from "../fs/path-manager.js";
import type { CreatorManifest, PostManifestData } from "../manifest/creator.js";
import { syncPost } from "../post/sync.js";
import { discoverCreatorPosts } from "./discover-posts.js";

interface SyncCreatorDeps {
  client: FanboxClient;
  headers?: Record<string, string>;
  manifest: CreatorManifest;
  pathManager: PathManager;
  transport: HttpTransport;
}

export async function syncCreator({
  client,
  headers,
  manifest,
  pathManager,
  transport,
}: SyncCreatorDeps) {
  const posts = await discoverCreatorPosts(
    { client },
    { creatorId: manifest.creatorId },
  );

  for (const postSummary of posts) {
    const postPathManager = pathManager.post(postSummary);
    manifest.posts[postSummary.id] = await syncPost(
      { client, headers, manifest, pathManager: postPathManager, transport },
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
