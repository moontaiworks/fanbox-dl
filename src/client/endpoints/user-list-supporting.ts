import type { FanboxClient } from "../client.js";
import type { SupportingPlan } from "../models/plan.js";

export interface ListSupportingPlansResult {
  plans: SupportingPlan[];
}

/**
 * List plans that the authenticated user is supporting.
 */
export async function listSupportingPlans(
  this: FanboxClient,
): Promise<ListSupportingPlansResult> {
  return this.get("plan.listSupporting");
}
