import { Timestamp } from "firebase/firestore";
import { MediaType } from "../models/Interfaces";
import { UserReferenceSchema } from "./UserSchema";

export interface MediaSchema {
  type: MediaType;
  src: string;
  uid?: string; // old
  user?: UserReferenceSchema;
  isInStorage: boolean;
  origin?: "user" | "streetview" | "other";
  timestamp?: Timestamp;
}

export enum StorageBucket {
  PostMedia = "post_media",
  ProfilePictures = "profile_pictures",
  SpotPictures = "spot_pictures",
  Challenges = "challenges",
}
