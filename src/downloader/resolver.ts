import { logger } from "../logger.js";

export interface CreatorResolverClient {
  listFollowingCreators(): Promise<{ creators: { creatorId: string }[] }>;
  listSupportingPlans(): Promise<{ creatorId: string }[]>;
}

export interface ResolveCreatorIdsOptions {
  creatorIds: string[];
  following: boolean;
  ignoreCreatorIds: string[];
  supporting: boolean;
}

export async function resolveCreatorIds(
  client: CreatorResolverClient,
  options: ResolveCreatorIdsOptions,
): Promise<string[]> {
  logger.debug("init.creators", "Resolving creator IDs");
  const creatorIds = new Set(options.creatorIds);

  if (options.following) {
    const { creators } = await client.listFollowingCreators();
    for (const creator of creators) {
      creatorIds.add(creator.creatorId);
    }
  }

  if (options.supporting) {
    for (const plan of await client.listSupportingPlans()) {
      creatorIds.add(plan.creatorId);
    }
  }

  for (const ignored of options.ignoreCreatorIds) {
    creatorIds.delete(ignored);
  }

  const result = [...creatorIds];
  logger.info("init.creators", `Got ${result.length} creators`, {
    creatorIds: result,
  });

  return result;
}
