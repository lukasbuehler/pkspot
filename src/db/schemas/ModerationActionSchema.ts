export type ModerationActionType =
  | "close_report"
  | "keep_warning"
  | "delete_media"
  | "delete_spot"
  | "archive_contact_message"
  | "delete_contact_message";

export type ModerationActionSourceType =
  | "spot_report"
  | "media_report"
  | "user_report"
  | "contact_message";

export type ModerationActionTargetType =
  | "spot"
  | "event"
  | "media"
  | "user"
  | "contact";

export interface ModerationActionUserSchema {
  uid: string;
  email?: string;
  display_name?: string;
}

export interface ModerationActionSchema {
  action_type: ModerationActionType;
  source_type: ModerationActionSourceType;
  source_path: string;
  source_snapshot: Record<string, unknown>;
  target_type: ModerationActionTargetType;
  target_path?: string;
  target_snapshot?: Record<string, unknown>;
  created_at: unknown;
  created_by: ModerationActionUserSchema;
  note?: string;
}
