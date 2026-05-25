import { Timestamp } from "firebase/firestore";

export const EVENT_RSVP_OPTIONS = ["going", "interested", "notgoing"] as const;
export type EventRSVPOption = (typeof EVENT_RSVP_OPTIONS)[number];

export interface EventRSVPCountsSchema {
  going: number;
  interested: number;
  notgoing: number;
  total: number;
}

export interface EventRSVPSchema {
  user_id: string;
  event_id: string;
  rsvp: EventRSVPOption;
  time_created?: Timestamp | Date;
  time_updated: Timestamp | Date;
}
