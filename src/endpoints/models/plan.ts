import type { FanboxUser } from "./user.js";

export interface Plan {
  coverImageUrl: null | string;
  creatorId: string;
  description: string;
  fee: number;
  hasAdultContent: boolean;
  id: string;
  paymentMethod: null | string;
  perks: string[];
  title: string;
  user: FanboxUser;
}

export interface SupportingPlan extends Plan {
  paymentMethod: string;
}
