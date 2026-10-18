/**
 * Private training summaries, derived on the server from
 * `users/{uid}/session_records`. Owners may read them; nobody may write them.
 * They exist so statistics stay cheap to read and never outlive their source:
 * every session write recomputes the affected month.
 */

/** One Spot within a month. */
export interface TrainingMonthSpotSchema {
  /** Sessions that included this Spot (check-ins and manual sessions). */
  visits: number;
  /** Distinct local days with a proximity-verified check-in at this Spot. */
  verified_days: number;
  /** Logged training time attributed to this Spot (sessions split evenly). */
  minutes: number;
  first_ms: number;
  last_ms: number;
  name?: string;
}

/** One local day within a month, keyed by YYYY-MM-DD. */
export interface TrainingMonthDaySchema {
  sessions: number;
  minutes: number;
}

/** `users/{uid}/training_months/{YYYY-MM}` */
export interface TrainingMonthSchema {
  version: 1;
  month: string;
  session_count: number;
  /** Sessions with a known duration. Sessions without one count as visits only. */
  sessions_with_duration: number;
  minutes: number;
  days: Record<string, TrainingMonthDaySchema>;
  spots: Record<string, TrainingMonthSpotSchema>;
  /** Sessions per weekday, Monday first. */
  weekday_sessions: number[];
  updated_at_raw_ms: number;
}

/** `users/{uid}/training_spots/{spotId}`: the all-time view of one Spot. */
export interface TrainingSpotSchema {
  version: 1;
  spot_id: string;
  name?: string;
  visits: number;
  verified_days: number;
  minutes: number;
  first_ms: number;
  last_ms: number;
  /** Visits per month, keyed by YYYY-MM. */
  months: Record<string, number>;
  updated_at_raw_ms: number;
}

/**
 * `spot_legend_tallies/{month}_{spotId}_{uid}`: server-only. It is used only
 * to tell each person their own private rank at a Spot; no client can read it
 * and no response ever names or counts other people.
 */
export interface SpotLegendTallySchema {
  uid: string;
  spot_id: string;
  month: string;
  verified_days: number;
  last_ms: number;
}

export interface GetMySpotRanksRequest {
  /** Defaults to the caller's current month in `timeZone`. */
  month?: string;
  timeZone?: string;
  /** At most 10 Spots. Defaults to the caller's Spots in that month. */
  spotIds?: string[];
}

export interface MySpotRank {
  spotId: string;
  month: string;
  verifiedDays: number;
  /** 1 is the top. People with the same number of days share a rank. */
  rank: number;
  /** Rank 1 with enough verified days to count as this month's legend. */
  legend: boolean;
}

export interface GetMySpotRanksResponse {
  month: string;
  ranks: MySpotRank[];
}

export interface SetCheckInSessionDurationRequest {
  sessionRecordId: string;
  durationMinutes: number;
}

export interface SetCheckInSessionDurationResponse {
  endedAtRawMs: number;
}

export interface BackfillTrainingSummariesRequest {
  dry_run?: boolean;
  /** Continue after this user ID. */
  cursor?: string;
  limit?: number;
}

export interface BackfillTrainingSummariesResponse {
  users_scanned: number;
  months_written: number;
  next_cursor: string | null;
  dry_run: boolean;
}
