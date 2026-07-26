import type { Timestamp } from "firebase/firestore";

export const LOG_ENTRY_VISIBILITIES = [
  "private",
  "friends",
  "followers",
  "public",
] as const;

export type LogEntryVisibility = (typeof LOG_ENTRY_VISIBILITIES)[number];

export interface LogEntrySessionSummarySchema {
  session_record_id: string;
  local_date: string;
  duration_minutes?: number;
  spot_count: number;
}

export interface LogEntrySchema {
  owner_id: string;
  note: string;
  visibility: LogEntryVisibility;
  session_record_ids: string[];
  session_summaries: LogEntrySessionSummarySchema[];
  activity_at: Timestamp;
  activity_at_raw_ms: number;
  time_created: Timestamp;
  time_created_raw_ms: number;
  time_updated: Timestamp;
  time_updated_raw_ms: number;
}

export type LogEntryDocument = LogEntrySchema & { id: string };
