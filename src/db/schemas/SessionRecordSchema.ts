import type { Timestamp } from "firebase/firestore";
import type { UserReferenceSchema } from "./UserSchema";

export type SessionRecordSource = "manual" | "check_in";

export type SessionPersonReference = Omit<UserReferenceSchema, "ref">;

export interface SessionSpotVisitSchema {
  spot_id: string;
  spot_name?: string;
  arrived_at: Timestamp;
  arrived_at_raw_ms: number;
  left_at?: Timestamp;
  left_at_raw_ms?: number;
}

export interface SessionRecordSchema {
  owner_id: string;
  source: SessionRecordSource;
  started_at: Timestamp;
  started_at_raw_ms: number;
  ended_at?: Timestamp;
  ended_at_raw_ms?: number;
  last_activity_at: Timestamp;
  last_activity_raw_ms: number;
  time_zone: string;
  spot_visits: SessionSpotVisitSchema[];
  people_present: SessionPersonReference[];
  time_created: Timestamp;
  time_created_raw_ms: number;
  time_updated: Timestamp;
  time_updated_raw_ms: number;
}

export type SessionRecordDocument = SessionRecordSchema & { id: string };
