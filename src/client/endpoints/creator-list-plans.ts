import type { FanboxClient } from "../client.js";
import type { Plan } from "../models/plan.js";

export interface ListCreatorPlansParams {
  creatorId: string;
}

export type ListCreatorPlansResult = Plan[];

/**
 * List plans for a specific creator.
 */
export async function listCreatorPlans(
  this: FanboxClient,
  params: ListCreatorPlansParams,
): Promise<ListCreatorPlansResult> {
  return this.get("plan.listCreator", params);
}
