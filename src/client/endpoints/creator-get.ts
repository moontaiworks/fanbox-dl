import type { Creator } from "../models/creator.js";

export const CREATOR_GET_PATH = "creator.get";

export interface GetCreatorParams {
  creatorId: string;
}

export type GetCreatorResult = Creator;
