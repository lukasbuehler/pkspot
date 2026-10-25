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
