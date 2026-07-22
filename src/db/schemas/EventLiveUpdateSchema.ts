import type { Timestamp } from "firebase/firestore";

export const EVENT_LIVE_UPDATE_TYPES = [
  "meet_up_time",
  "location_spot_change",
  "schedule_change",
  "weather_update",
  "session_starting_soon",
  "general_update",
] as const;

export type EventLiveUpdateType = (typeof EVENT_LIVE_UPDATE_TYPES)[number];

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
