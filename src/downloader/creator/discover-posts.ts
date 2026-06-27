import type { FanboxClient } from "../../client/client.js";
import type {
  ListCreatorPostsParams,
  PostSummary,
} from "../../client/types.js";

interface DiscoverCreatorPostsDependencies {
  client: FanboxClient;
}

interface DiscoverCreatorPostsOptions {
  creatorId: string;
  firstId?: string;
  limit?: number;
}

export async function discoverCreatorPosts(
  { client }: DiscoverCreatorPostsDependencies,
  { creatorId, firstId, limit = 300 }: DiscoverCreatorPostsOptions,
): Promise<PostSummary[]> {
  const listCreatorPostsOptions = {
    creatorId,
    firstId,
    limit,
    sort: "newest",
  } satisfies ListCreatorPostsParams;
  const posts = await client.listCreatorPosts(listCreatorPostsOptions);
  if (posts.length < limit) return posts;

  // check if the last post is already in the manifest, if so, we can stop
  // fetching more posts
  const last = posts.at(-1)!;

  // continue fetching until we reach the end of the list
  const remains = await discoverCreatorPosts(
    { client },
    { creatorId, firstId: last.id, limit },
  );

  return [...posts, ...remains];
}
