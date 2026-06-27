import { extname } from "node:path";

import type { FanboxClient } from "../../client/client.js";
import type { Post, PostSummary } from "../../client/types.js";
import type { PathManager } from "../fs/path-manager.js";
import type { CreatorManifest, PostManifestData } from "../manifest/creator.js";
import { ImageContent } from "./content.js";
import { formatPostContents } from "./contents.js";

interface SyncPostDeps {
  client: FanboxClient;
  manifest: CreatorManifest;
  pathManager: PathManager;
}

export async function syncPost(
  { client, manifest }: SyncPostDeps,
  postSummary: PostSummary,
): Promise<PostManifestData> {
  if (postSummary.isRestricted) {
    // Not available for download, skip
    return {
      assets: {},
      id: postSummary.id,
      restricted: true,
      status: "skipped",
      updatedDatetime: postSummary.updatedDatetime,
    };
  }
  const existingPost = manifest.posts[postSummary.id];
  if (
    existingPost?.status === "complete" &&
    postSummary.updatedDatetime === existingPost.updatedDatetime
  ) {
    // No changes since last download, skip
    return existingPost;
  }

  // need to download or update the local copy of the post
  const post = await client.getPost({ postId: postSummary.id });
  const contents = formatPostContents(post);
  if (post.coverImageUrl) contents.unshift(formatCoverImage(post));

  // TODO: download assets and update manifest with asset data

  return {
    // todo: transform contents into asset manifest data
    assets: {},
    id: post.id,
    restricted: false,
    status: "complete",
    updatedDatetime: post.updatedDatetime,
  };
}

function formatCoverImage(post: Post): ImageContent {
  if (!post.coverImageUrl) throw new Error("Post does not have a cover image");

  const extension =
    extname(new URL(post.coverImageUrl).pathname).slice(1) || "jpg";

  return new ImageContent({
    extension,
    id: "cover",
    originalUrl: post.coverImageUrl,
  });
}
