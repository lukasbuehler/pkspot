import { Timestamp } from "firebase/firestore";
import { UserReferenceSchema } from "./UserSchema";

export type SpotEditVoteValue = 1 | -1;
export type SpotEditVoteLabel = "yes" | "no";

export interface SpotEditVoteSchema {
  value: SpotEditVoteValue;
  vote: SpotEditVoteLabel;
  user: UserReferenceSchema;
  timestamp: Timestamp;
  timestamp_raw_ms?: number;
}

