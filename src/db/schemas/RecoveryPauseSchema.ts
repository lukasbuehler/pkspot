import type { Timestamp } from "firebase/firestore";

export const RECOVERY_PAUSE_REASONS = [
  "injury",
  "illness",
  "personal_break",
  "other",
] as const;

export type RecoveryPauseReason = (typeof RECOVERY_PAUSE_REASONS)[number];

/** A private, self-recorded interruption in a person's training history. */
export interface RecoveryPauseSchema {
  owner_id: string;
  started_on: string;
  ended_on?: string;
  reason: RecoveryPauseReason;
  note?: string;
  time_created: Timestamp;
  time_created_raw_ms: number;
  time_updated: Timestamp;
  time_updated_raw_ms: number;
}

export type RecoveryPauseDocument = RecoveryPauseSchema & { id: string };
