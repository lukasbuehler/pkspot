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
 * `spot_legend_tallies/{month}_{spotId}_{uid}`: server-only working data for
 * the nightly rank job. No client can read it. Tallies exist only for months
 * that are still open and are deleted once the month's final ranks are
 * published into each person's own `training_ranks` document.
 */
export interface SpotLegendTallySchema {
  uid: string;
  spot_id: string;
  month: string;
  verified_days: number;
  last_ms: number;
  /** What the nightly job last published for this person, to skip unchanged writes. */
  published?: string;
}

/**
 * - `ranked`: enough people checked in at the Spot this month to rank.
 * - `too_few_people`: the person qualifies, but fewer than
 *   `RANK_MIN_ACCOUNTS` people checked in there, so no rank is shown.
 */
export type TrainingRankStatus = "ranked" | "too_few_people";

/** One Spot in `training_ranks`. */
export interface TrainingRankSpotSchema {
  status: TrainingRankStatus;
  /** The person's verified days when the rank was computed. */
  verified_days: number;
  /**
   * Olympic-style: people with more verified days plus one. Two people tied
   * for first are both 1 and the next person is 3.
   */
  rank?: number;
  /** Other accounts sharing this rank. */
  tied_with?: number;
  /** First place this month. */
  legend?: boolean;
}

/**
 * `users/{uid}/training_ranks/{YYYY-MM}`: the person's own monthly Spot ranks,
 * published by the server once a night. Ranks are delayed on purpose so a
 * change cannot reveal when someone else trained. The document stays as the
 * person's rank history after the month is final; nobody else can read it.
 */
export interface TrainingRanksSchema {
  version: 1;
  month: string;
  /** Spots where the person has at least `RANK_MIN_VERIFIED_DAYS` verified days. */
  spots: Record<string, TrainingRankSpotSchema>;
  /** True once the month is over and its ranks no longer change. */
  final: boolean;
  computed_at_raw_ms: number;
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
