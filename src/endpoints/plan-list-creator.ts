import type { Plan } from "./models/plan.js";

export const PLAN_LIST_CREATOR_PATH = "plan.listCreator";

export interface ListCreatorPlansParams {
  creatorId: string;
}

export type ListCreatorPlansResult = Plan[];
