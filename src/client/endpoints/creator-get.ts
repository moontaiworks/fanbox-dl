import type { FanboxClient } from "../client.js";
import type { Creator } from "../models/creator.js";

export interface GetCreatorParams {
  creatorId: string;
}

export type GetCreatorResult = Creator;

/**
 * Get detailed information about a specific creator.
 */
export async function getCreator(
  this: FanboxClient,
  params: GetCreatorParams,
): Promise<GetCreatorResult> {
  return this.get("creator.get", params);
}
