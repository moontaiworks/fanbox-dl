import type { Logger } from "pino";

import type { FanboxClient } from "../../client/client.js";
import type {
  ListCreatorPostsParams,
  PostSummary,
} from "../../client/types.js";

interface DiscoverCreatorPostsDependencies {
  client: FanboxClient;
  logger: Logger;
}

interface DiscoverCreatorPostsOptions {
  creatorId: string;
  firstId?: string;
  firstPublishedDatetime?: string;
  limit?: number;
}

export async function discoverCreatorPosts(
  { client, logger }: DiscoverCreatorPostsDependencies,
  {
    creatorId,
    firstId,
    firstPublishedDatetime,
    limit = 300,
  }: DiscoverCreatorPostsOptions,
): Promise<PostSummary[]> {
  logger.debug(
    `Discovering max ${limit} posts from ${firstId ?? "start"} for creator ${creatorId}`,
  );
  const listCreatorPostsOptions = {
    creatorId,
    firstId,
    firstPublishedDatetime,
    limit,
    sort: "newest",
  } satisfies ListCreatorPostsParams;
  const posts = await client.listCreatorPosts(listCreatorPostsOptions);
  logger.debug(`Discovered ${posts.length} posts for creator ${creatorId}`);
  if (posts.length < limit) return posts;

  // check if the last post is already in the manifest, if so, we can stop
  // fetching more posts
  const last = posts.at(-1)!;

  // continue fetching until we reach the end of the list
  const remains = await discoverCreatorPosts(
    { client, logger },
    {
      creatorId,
      firstId: last.id,
      firstPublishedDatetime: last.publishedDatetime,
      limit,
    },
  );

  return [...posts, ...remains.slice(1)];
}
