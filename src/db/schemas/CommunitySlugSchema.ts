import { Timestamp } from "firebase/firestore";

export interface CommunitySlugSchema {
  communityKey: string;
  isPreferred: boolean;
  createdAt?: Timestamp | { seconds: number; nanoseconds: number };
}
