import type { FanboxClient } from "../../client/client.js";
import type {
  ListCreatorPostsParams,
  PostSummary,
} from "../../client/types.js";

interface DiscoverAllPostsDependencies {
  client: FanboxClient;
}

interface DiscoverAllPostsOptions {
  creatorId: string;
  firstId?: string;
  limit?: number;
}

export async function discoverAllPosts(
  { client }: DiscoverAllPostsDependencies,
  { creatorId, firstId, limit = 300 }: DiscoverAllPostsOptions,
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
  const remains = await discoverAllPosts(
    { client },
    { creatorId, firstId: last.id, limit },
  );

  return [...posts, ...remains];
}
