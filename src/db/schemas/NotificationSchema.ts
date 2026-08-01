import type { Timestamp } from "firebase/firestore";

export const NOTIFICATION_PREFERENCE_KEYS = [
  "follow_requests",
  "event_reminders",
  "event_updates",
  "spot_edit_updates",
  "report_updates",
  "community_info_updates",
  "community_events",
  "community_spot_digest",
] as const;

export type NotificationPreferenceKey =
  (typeof NOTIFICATION_PREFERENCE_KEYS)[number];

export interface NotificationPreferencesSchema {
  follow_requests?: boolean;
  event_reminders?: boolean;
  event_updates?: boolean;
  spot_edit_updates?: boolean;
  report_updates?: boolean;
  community_info_updates?: boolean;
  community_events?: boolean;
  community_spot_digest?: boolean;
  /** Default reminder offsets applied to new event subscriptions. */
  event_reminder_offsets_minutes?: number[];
}

export const EVENT_REMINDER_OFFSET_OPTIONS = [1440, 120, 30] as const;
export type EventReminderOffsetMinutes =
  (typeof EVENT_REMINDER_OFFSET_OPTIONS)[number];

export const NOTIFICATION_PROMPT_CONTEXTS = [
  "follow_activity",
  "event_reminders",
  "event_notifications_migration",
  "spot_edit_updates",
  "report_updates",
  "community_info_updates",
  "community_updates",
] as const;

export type NotificationPromptContext =
  (typeof NOTIFICATION_PROMPT_CONTEXTS)[number];
export type NotificationPromptStatus = "accepted" | "dismissed";

export interface NotificationPromptRecordSchema {
  status: NotificationPromptStatus;
  version: number;
  updated_at_raw_ms: number;
}

export type NotificationPromptStateSchema = Partial<
  Record<NotificationPromptContext, NotificationPromptRecordSchema>
>;

export type NotificationPlatform = "android" | "ios" | "web";
export type NotificationPermissionState =
  | "prompt"
  | "prompt-with-rationale"
  | "granted"
  | "denied"
  | "unsupported"
  | "unknown";

export interface NotificationRegistrationSchema {
  token: string;
  platform: NotificationPlatform;
  app_version: string;
  locale: string;
  permission_state: NotificationPermissionState;
  enabled: boolean;
  disabled_reason?: "permission_denied" | "signed_out" | "invalid_token";
  created_at_raw_ms: number;
  last_seen_at_raw_ms: number;
}

export const NOTIFICATION_INTENT_TYPES = [
  "follow_request",
  "follow_accepted",
  "new_follower",
  "event_reminder",
  "event_update",
  "event_registration_update",
  "event_ownership_update",
  "spot_edit_update",
  "spot_report_update",
  "media_report_update",
  "community_info_update",
  "community_event",
  "community_spot_digest",
] as const;

export type NotificationIntentType =
  (typeof NOTIFICATION_INTENT_TYPES)[number];

export type InAppNotificationType =
  | NotificationIntentType
  | "check_in"
  | "weather_alert";

export type NotificationIntentStatus =
  | "pending"
  | "processing"
  | "sent"
  | "cancelled"
  | "failed"
  | "skipped";

export const NOTIFICATION_ACTION_IDS = [
  "accept_follow_request",
  "decline_follow_request",
  "follow_back",
  "undo_decline_follow_request",
  "undo_follow_back",
  "mark_event_going",
  "save_event_interested",
] as const;

export type NotificationActionId =
  (typeof NOTIFICATION_ACTION_IDS)[number];

export interface NotificationActionSchema {
  id: NotificationActionId;
  /** Optional delivery-localized label. App clients derive labels from the id. */
  label?: string;
  destructive?: boolean;
}

export interface NotificationActionStateSchema {
  action_id: NotificationActionId;
  status: "completed" | "undone";
  acted_at_raw_ms: number;
  undo_until_raw_ms?: number;
}

export interface PerformNotificationActionRequest {
  notificationId: string;
  actionId: NotificationActionId;
}

export interface PerformNotificationActionResponse {
  state: NotificationActionStateSchema;
  relationship?: "following" | "requested";
}

export interface ReconcileEventNotificationsResponse {
  eligibleEventCount: number;
  createdSubscriptionCount: number;
  preservedSubscriptionCount: number;
  scheduledReminderCount: number;
}

export interface EventNotificationMigrationStateResponse {
  eligibleEventCount: number;
}

export interface NotificationIntentSchema {
  recipient_uid: string;
  type: NotificationIntentType;
  source_path: string;
  send_after: Timestamp;
  expires_at: Timestamp;
  dedupe_key: string;
  status: NotificationIntentStatus;
  path: string;
  channel_id:
    | "social"
    | "events"
    | "account"
    | "follow_activity"
    | "follow_incoming"
    | "follow_relationships"
    | "event_reminders"
    | "event_updates"
    | "spot_edit_updates"
    | "spot_report_updates"
    | "media_report_updates"
    | "community_info_updates"
    | "community_events"
    | "community_spot_digest";
  payload: Record<string, string>;
  thread_key?: string;
  image_url?: string;
  actions?: NotificationActionSchema[];
  attempts: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  processing_started_at?: Timestamp;
  sent_at?: Timestamp;
  cancelled_at?: Timestamp;
  failure_reason?: string;
  delivery_count?: number;
}

export interface InAppNotificationSchema {
  type: InAppNotificationType;
  source_path: string;
  dedupe_key: string;
  path: string;
  payload: Record<string, string>;
  thread_key?: string;
  image_url?: string;
  actions?: NotificationActionSchema[];
  action_state?: NotificationActionStateSchema;
  active: boolean;
  created_at: Timestamp;
  created_at_raw_ms: number;
  available_at: Timestamp;
  available_at_raw_ms: number;
  expires_at: Timestamp;
  expires_at_raw_ms: number;
  updated_at_raw_ms: number;
  read_at_raw_ms?: number;
  dismissed_at_raw_ms?: number;
  invalidated_at_raw_ms?: number;
}
