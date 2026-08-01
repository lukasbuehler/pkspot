import type { Timestamp } from "firebase/firestore";

/** Reporter-safe projection. Internal moderation notes and evidence never enter it. */
export interface ReportOutcomeSchema {
  id: string;
  kind: "spot" | "media";
  target_name: string;
  outcome: "action_taken" | "dismissed";
  public_reason: "action_taken" | "no_action_needed";
  source_path: string;
  decided_at: Timestamp;
  decided_at_raw_ms: number;
}
