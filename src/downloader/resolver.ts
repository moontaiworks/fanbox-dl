export interface CreatorResolverClient {
  listFollowingCreators(): Promise<{ creatorId: string }[]>;
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
  const creatorIds = new Set(options.creatorIds);
  if (options.following) {
    for (const creator of await client.listFollowingCreators()) {
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

  return [...creatorIds];
}
