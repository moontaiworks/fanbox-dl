import type { FanboxClient } from "../../client/client.js";
import type { PathManager } from "../fs/path-manager.js";
import type { CreatorManifest, PostManifestData } from "../manifest/creator.js";
import { syncPost } from "../post/sync.js";
import { discoverAllPosts } from "./discover-posts.js";

interface CreatorOptions {
  client: FanboxClient;
  manifest: CreatorManifest;
  pathManager: PathManager;
}

export class Creator {
  #client: FanboxClient;
  #manifest: CreatorManifest;
  #pathManager: PathManager;

  constructor(options: CreatorOptions) {
    this.#manifest = options.manifest;
    this.#client = options.client;
    this.#pathManager = options.pathManager;
  }

  async sync() {
    const posts = await discoverAllPosts(
      { client: this.#client },
      { creatorId: this.#manifest.creatorId },
    );

    const syncPostDeps = {
      client: this.#client,
      manifest: this.#manifest,
      pathManager: this.#pathManager,
    };

    for (const postSummary of posts) {
      this.#manifest.posts[postSummary.id] = await syncPost(
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
}
