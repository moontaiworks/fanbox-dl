import type { FanboxUser } from "./user.js";

export interface Creator {
  category: string;
  coverImageUrl: null | string;
  creatorId: string;
  description: string;
  hasAdultContent: boolean;
  hasBoothShop: boolean;
  hasPublishedPost: boolean;
  isAcceptingRequest: boolean;
  isFollowed: boolean;
  isStopped: boolean;
  isSupported: boolean;
  profileItems: CreatorProfileItem[];
  profileLinks: string[];
  user: FanboxUser;
}

export interface CreatorProfileImage {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  type: "image";
}

export type CreatorProfileItem =
  | CreatorProfileImage
  | CreatorProfileUnknownItem;

export interface CreatorProfileUnknownItem {
  [key: string]: unknown;
  id: string;
  type: string;
}

export interface CreatorSummary {
  creatorId: string;
  description: string;
  hasAdultContent: boolean;
  iconUrl: string;
  isFollowed: boolean;
  isSupported: boolean;
  name: string;
  userId: string;
}
