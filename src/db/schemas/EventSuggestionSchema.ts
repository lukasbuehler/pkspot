import type { Timestamp } from "firebase/firestore";

/** Private, staff-reviewed proposal; it is never a discovery document. */
export interface EventSuggestionSchema {
  submitter_id: string;
  name: string;
  description?: string;
  locality_string?: string;
  country_code?: string;
  start: Timestamp;
  end: Timestamp;
  time_zone?: string;
  organizer_name?: string;
  source_url?: string;
  status: "submitted" | "approved" | "rejected";
  review?: {
    reviewer_id: string;
    outcome: "approved" | "rejected";
    note?: string;
    reviewed_at: Timestamp;
    event_id?: string;
  };
  time_created: Timestamp;
  time_updated: Timestamp;
}

/** Callable response: dates are ISO strings across web and native adapters. */
export interface EventSuggestionQueueItem extends Omit<EventSuggestionSchema, "start" | "end" | "time_created" | "time_updated" | "review"> {
  id: string;
  start: string;
  end: string;
  time_created: string;
  time_updated: string;
  review?: Omit<NonNullable<EventSuggestionSchema["review"]>, "reviewed_at"> & { reviewed_at: string };
}

export interface EventSuggestionQueuePage {
  items: EventSuggestionQueueItem[];
  nextCursor: string | null;
}
