import type { Timestamp } from "firebase/firestore";

export const EVENT_REGISTRATION_STATUSES = [
  "registered",
  "waitlisted",
  "cancelled",
] as const;
export type EventRegistrationStatus =
  (typeof EVENT_REGISTRATION_STATUSES)[number];

export interface EventRegistrationSchema {
  user_id: string;
  event_id: string;
  status: EventRegistrationStatus;
  time_created: Timestamp | Date;
  time_updated: Timestamp | Date;
  registered_at?: Timestamp | Date;
  waitlisted_at?: Timestamp | Date;
  cancelled_at?: Timestamp | Date;
}

export interface EventAdmissionStateSchema {
  registered: number;
  waitlisted: number;
  time_updated: Timestamp | Date;
}

export interface RegisterForEventRequest {
  eventId: string;
}

export interface RegisterForEventResponse {
  status: "registered" | "waitlisted";
  registered: number;
  waitlisted: number;
}

export interface CancelEventRegistrationRequest {
  eventId: string;
  /** Organizer/admin cancellation target. Omit to cancel the caller. */
  userId?: string;
}

export interface CancelEventRegistrationResponse {
  status: "cancelled";
  promotedUserId?: string;
  registered: number;
  waitlisted: number;
}
