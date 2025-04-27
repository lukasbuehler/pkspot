import { MediaType } from "../models/Interfaces";

export interface MediaSchema {
  type: MediaType;
  src: string;
  uid?: string;
  isInStorage: boolean;
  origin?: "user" | "streetview" | "other";
}

export enum StorageBucket {
  PostMedia = "post_media",
  ProfilePictures = "profile_pictures",
  SpotPictures = "spot_pictures",
  Challenges = "challenges",
}
