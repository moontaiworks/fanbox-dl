import type { CreatorSummary } from "../models/creator.js";

export const CREATOR_LIST_FOLLOWING_PATH = "creator.listFollowing";

export interface ListFollowingCreatorsResult {
  creators: CreatorSummary[];
}
