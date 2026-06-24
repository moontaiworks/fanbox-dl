import type { FanboxClient } from "../client.js";
import type { CreatorSummary } from "../models/creator.js";

export interface ListFollowingCreatorsResult {
  creators: CreatorSummary[];
}

/**
 * List creators that the authenticated user is following.
 */
export async function listFollowingCreators(
  this: FanboxClient,
): Promise<ListFollowingCreatorsResult> {
  return this.get("creator.listFollowing");
}
