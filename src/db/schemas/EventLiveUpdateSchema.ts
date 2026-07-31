import type { Timestamp } from "firebase/firestore";

export const EVENT_LIVE_UPDATE_TYPES = [
  "event_cancelled",
  "event_restored",
  "event_rescheduled",
  "program_item_update",
  "program_plan_activated",
  "meet_up_time",
  "location_spot_change",
  "schedule_change",
  "weather_update",
  "session_starting_soon",
  "general_update",
] as const;

export type EventLiveUpdateType = (typeof EVENT_LIVE_UPDATE_TYPES)[number];

export const EVENT_OPERATION_TYPES = [
  "cancel_event",
  "restore_event",
  "reschedule_event",
  "update_program_item",
  "activate_program_plan",
] as const;
export type EventOperationType = (typeof EVENT_OPERATION_TYPES)[number];

export const EVENT_LIVE_UPDATE_TITLE_MAX_LENGTH = 80;
export const EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH = 280;

export const EVENT_NOTIFICATION_LEVELS = [
  "all",
  "event_updates",
  "reminders",
  "none",
] as const;

export type EventNotificationLevel = (typeof EVENT_NOTIFICATION_LEVELS)[number];

export interface EventLiveUpdateSchema {
  event_id: string;
  type: EventLiveUpdateType;
  title: string;
  message?: string;
  scheduled_for?: Timestamp;
  event_spot_id?: string;
  operation_id?: string;
  operation_type?: EventOperationType;
  program_plan_id?: string;
  program_item_id?: string;
  status: "published";
  created_at: Timestamp;
  created_by: string;
  published_at: Timestamp;
}

export interface EventLiveUpdateSubscriberSchema {
  user_id: string;
  active: boolean;
  event_reminders?: boolean;
  subscribed_at: Timestamp;
  updated_at: Timestamp;
}

export interface PublishEventLiveUpdateRequest {
  eventId: string;
  type: EventLiveUpdateType;
  title: string;
  message?: string;
  scheduledFor?: string;
  eventSpotId?: string;
}

export interface PublishEventLiveUpdateResponse {
  updateId: string;
}

interface EventOperationalChangeBase {
  eventId: string;
  expectedUpdatedAtMs?: number;
  note?: string;
}

export type ApplyEventOperationalChangeRequest =
  | (EventOperationalChangeBase & {
      operation: "cancel_event";
      reason: string;
    })
  | (EventOperationalChangeBase & { operation: "restore_event" })
  | (EventOperationalChangeBase & {
      operation: "reschedule_event";
      start: string;
      end: string;
    })
  | (EventOperationalChangeBase & {
      operation: "update_program_item";
      planId: string;
      itemId: string;
      status: "scheduled" | "cancelled" | "moved" | "delayed";
      start?: string;
      end?: string;
    })
  | (EventOperationalChangeBase & {
      operation: "activate_program_plan";
      planId: string;
    });

export interface ApplyEventOperationalChangeResponse {
  operationId: string;
  updateId?: string;
}
