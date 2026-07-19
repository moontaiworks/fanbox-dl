import type { Logger } from "pino";

interface CreatorResolverClient {
  listFollowingCreators(): Promise<{ creators: { creatorId: string }[] }>;
  listSupportingPlans(): Promise<{ creatorId: string }[]>;
}

interface ResolveCreatorIdsDeps {
  client: CreatorResolverClient;
  logger: Logger;
}

interface ResolveCreatorIdsOptions {
  creatorIds: string[];
  following: boolean;
  ignoreCreatorIds: string[];
  supporting: boolean;
}

export async function resolveCreatorIds(
  { client, logger }: ResolveCreatorIdsDeps,
  options: ResolveCreatorIdsOptions,
): Promise<string[]> {
  logger.debug({ options }, "Resolving creator IDs");
  const creatorIds = new Set(options.creatorIds);

  if (options.following) {
    const { creators } = await client.listFollowingCreators();
    logger.trace(
      { creators: creators.map((c) => c.creatorId) },
      `Retrieved ${creators.length} following creators`,
    );
    for (const creator of creators) {
      creatorIds.add(creator.creatorId);
    }
  }

  if (options.supporting) {
    const plans = await client.listSupportingPlans();
    logger.trace(
      { plans: plans.map((p) => p.creatorId) },
      `Retrieved ${plans.length} supporting plans`,
    );
    for (const plan of plans) {
      creatorIds.add(plan.creatorId);
    }
  }

  for (const ignored of options.ignoreCreatorIds) {
    creatorIds.delete(ignored);
  }

  const result = [...creatorIds];
  logger.info(
    { creatorIds: result },
    `Resolved total ${result.length} creator IDs`,
  );

  return result;
}
