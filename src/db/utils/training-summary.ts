import type {
  SpotLegendTallySchema,
  TrainingMonthSchema,
  TrainingMonthSpotSchema,
  TrainingSpotSchema,
} from "../schemas/TrainingSummarySchema";

/**
 * Pure training-summary logic shared by Cloud Functions (which write the
 * private summaries) and the client (tests, fallbacks and period views).
 * It must stay free of Angular and Firebase imports.
 */

/** Rank 1 needs at least this many verified days to be called the legend. */
export const LEGEND_MIN_VERIFIED_DAYS = 2;
/** Sessions longer than this are treated as data errors, not training time. */
const MAX_SESSION_MINUTES = 24 * 60;

/** The subset of a session record that summaries need. */
export interface TrainingSummarySession {
  id: string;
  source?: string;
  started_at_raw_ms: number;
  ended_at_raw_ms?: number;
  time_zone?: string;
  spot_visits?: readonly TrainingSummaryVisit[];
}

export interface TrainingSummaryVisit {
  check_in_id?: string;
  spot_id: string;
  spot_name?: string;
  arrived_at_raw_ms: number;
  /** Written by the server for new check-ins; older visits use a lookup. */
  verified?: boolean;
}

/** YYYY-MM-DD in the session's own time zone, falling back to UTC. */
export function localDateKey(timestampMs: number, timeZone?: string): string {
  const format = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestampMs));
    const value = (type: string) => parts.find((part) => part.type === type)?.value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  };
  try {
    return format(timeZone || "UTC");
  } catch {
    return format("UTC");
  }
}

export function monthKeyOfDay(dayKey: string): string {
  return dayKey.slice(0, 7);
}

/** The month a session belongs to: the local month in which it started. */
export function sessionMonthKey(session: TrainingSummarySession): string | null {
  if (!Number.isFinite(session.started_at_raw_ms)) return null;
  return monthKeyOfDay(localDateKey(session.started_at_raw_ms, session.time_zone));
}

/**
 * Check-in sessions count only confirmed check-in visits, matching how the
 * training log counts them. A check-in session without any is ignored.
 */
export function countedVisits(session: TrainingSummarySession): TrainingSummaryVisit[] {
  const visits = (session.spot_visits ?? []).filter(
    (visit) => typeof visit.spot_id === "string" && visit.spot_id.length > 0,
  );
  return session.source === "check_in"
    ? visits.filter((visit) => !!visit.check_in_id)
    : visits;
}

export function isCountedSession(session: TrainingSummarySession): boolean {
  return session.source !== "check_in" || countedVisits(session).length > 0;
}

/** Logged training time, or null when the person never gave a duration. */
export function sessionMinutes(session: TrainingSummarySession): number | null {
  if (session.ended_at_raw_ms === undefined) return null;
  const minutes = Math.round((session.ended_at_raw_ms - session.started_at_raw_ms) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > MAX_SESSION_MINUTES) return null;
  return minutes;
}

export function isVerifiedVisit(
  visit: TrainingSummaryVisit,
  verifiedCheckInIds: ReadonlySet<string>,
): boolean {
  if (!visit.check_in_id) return false;
  return visit.verified ?? verifiedCheckInIds.has(visit.check_in_id);
}

/**
 * Builds one private month summary. Returns null when the month holds no
 * counted session, so the caller deletes the document instead of keeping an
 * empty one.
 */
export function buildTrainingMonthSummary(
  month: string,
  sessions: readonly TrainingSummarySession[],
  verifiedCheckInIds: ReadonlySet<string>,
  nowMs: number,
): TrainingMonthSchema | null {
  const unique = new Map(sessions.map((session) => [session.id, session]));
  const summary: TrainingMonthSchema = {
    version: 1,
    month,
    session_count: 0,
    sessions_with_duration: 0,
    minutes: 0,
    days: {},
    spots: {},
    weekday_sessions: [0, 0, 0, 0, 0, 0, 0],
    updated_at_raw_ms: nowMs,
  };
  const verifiedDaysBySpot = new Map<string, Set<string>>();

  for (const session of unique.values()) {
    if (sessionMonthKey(session) !== month || !isCountedSession(session)) continue;
    const dayKey = localDateKey(session.started_at_raw_ms, session.time_zone);
    const minutes = sessionMinutes(session);
    summary.session_count += 1;
    const day = summary.days[dayKey] ?? { sessions: 0, minutes: 0 };
    day.sessions += 1;
    if (minutes !== null) {
      summary.sessions_with_duration += 1;
      summary.minutes += minutes;
      day.minutes += minutes;
    }
    summary.days[dayKey] = day;
    summary.weekday_sessions[mondayFirstWeekday(dayKey)] += 1;

    const visits = countedVisits(session);
    const spotIds = [...new Set(visits.map((visit) => visit.spot_id))];
    // Time is split evenly between a session's Spots so per-Spot minutes add
    // up to the session instead of counting it once per Spot.
    const minutesPerSpot = minutes !== null && spotIds.length > 0
      ? minutes / spotIds.length
      : 0;
    for (const spotId of spotIds) {
      const spotVisits = visits.filter((visit) => visit.spot_id === spotId);
      const times = spotVisits.map((visit) => visit.arrived_at_raw_ms).filter(Number.isFinite);
      const first = times.length ? Math.min(...times) : session.started_at_raw_ms;
      const last = times.length ? Math.max(...times) : session.started_at_raw_ms;
      const name = spotVisits.map((visit) => visit.spot_name).find((value) => !!value);
      const spot: TrainingMonthSpotSchema = summary.spots[spotId] ?? {
        visits: 0,
        verified_days: 0,
        minutes: 0,
        first_ms: first,
        last_ms: last,
      };
      spot.visits += 1;
      spot.minutes += minutesPerSpot;
      spot.first_ms = Math.min(spot.first_ms, first);
      spot.last_ms = Math.max(spot.last_ms, last);
      if (name && (!spot.name || last >= spot.last_ms)) spot.name = name;
      summary.spots[spotId] = spot;

      for (const visit of spotVisits) {
        if (!isVerifiedVisit(visit, verifiedCheckInIds)) continue;
        const days = verifiedDaysBySpot.get(spotId) ?? new Set<string>();
        days.add(localDateKey(visit.arrived_at_raw_ms, session.time_zone));
        verifiedDaysBySpot.set(spotId, days);
      }
    }
  }

  if (summary.session_count === 0) return null;
  for (const [spotId, spot] of Object.entries(summary.spots)) {
    spot.minutes = Math.round(spot.minutes);
    spot.verified_days = verifiedDaysBySpot.get(spotId)?.size ?? 0;
  }
  return summary;
}

/** The all-time view of one Spot, rebuilt from every month summary. */
export function buildTrainingSpotSummary(
  spotId: string,
  months: readonly TrainingMonthSchema[],
  nowMs: number,
): TrainingSpotSchema | null {
  let result: TrainingSpotSchema | null = null;
  for (const month of [...months].sort((left, right) => left.month.localeCompare(right.month))) {
    const spot = month.spots[spotId];
    if (!spot) continue;
    result ??= {
      version: 1,
      spot_id: spotId,
      visits: 0,
      verified_days: 0,
      minutes: 0,
      first_ms: spot.first_ms,
      last_ms: spot.last_ms,
      months: {},
      updated_at_raw_ms: nowMs,
    };
    result.visits += spot.visits;
    result.verified_days += spot.verified_days;
    result.minutes += spot.minutes;
    result.first_ms = Math.min(result.first_ms, spot.first_ms);
    result.last_ms = Math.max(result.last_ms, spot.last_ms);
    result.months[month.month] = spot.visits;
    if (spot.name) result.name = spot.name;
  }
  return result;
}

/** The server-only tallies a month contributes to private Spot ranks. */
export function legendTalliesForMonth(
  uid: string,
  month: TrainingMonthSchema | null,
): SpotLegendTallySchema[] {
  if (!month) return [];
  return Object.entries(month.spots)
    .filter(([, spot]) => spot.verified_days > 0)
    .map(([spotId, spot]) => ({
      uid,
      spot_id: spotId,
      month: month.month,
      verified_days: spot.verified_days,
      last_ms: spot.last_ms,
    }));
}

export function legendTallyId(month: string, spotId: string, uid: string): string {
  return `${month}_${encodeURIComponent(spotId)}_${uid}`;
}

/** Month keys from `from` to `to`, inclusive. */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let [year, month] = from.split("-").map(Number);
  const [endYear, endMonth] = to.split("-").map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${`${month}`.padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (months.length > 1200) break;
  }
  return months;
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}`;
}

export interface TrainingPeriodSpot {
  spotId: string;
  name?: string;
  visits: number;
  verifiedDays: number;
  minutes: number;
  lastMs: number;
  /** True when the first-ever visit to this Spot falls in the period. */
  isNew: boolean;
}

export interface TrainingPeriodSummary {
  sessions: number;
  activeDays: number;
  minutes: number;
  sessionsWithDuration: number;
  spots: TrainingPeriodSpot[];
  newSpots: number;
  weekdaySessions: number[];
}

/**
 * Combines month summaries for a period. `allMonths` must include every month
 * so "new Spot" can tell first-ever visits from returning ones.
 */
export function summarizeTrainingPeriod(
  allMonths: readonly TrainingMonthSchema[],
  periodMonths: ReadonlySet<string>,
): TrainingPeriodSummary {
  const sorted = [...allMonths].sort((left, right) => left.month.localeCompare(right.month));
  const firstMonthBySpot = new Map<string, string>();
  for (const month of sorted) {
    for (const spotId of Object.keys(month.spots)) {
      if (!firstMonthBySpot.has(spotId)) firstMonthBySpot.set(spotId, month.month);
    }
  }
  const result: TrainingPeriodSummary = {
    sessions: 0,
    activeDays: 0,
    minutes: 0,
    sessionsWithDuration: 0,
    spots: [],
    newSpots: 0,
    weekdaySessions: [0, 0, 0, 0, 0, 0, 0],
  };
  const spots = new Map<string, TrainingPeriodSpot>();
  for (const month of sorted) {
    if (!periodMonths.has(month.month)) continue;
    result.sessions += month.session_count;
    result.activeDays += Object.keys(month.days).length;
    result.minutes += month.minutes;
    result.sessionsWithDuration += month.sessions_with_duration;
    month.weekday_sessions.forEach((count, index) => {
      result.weekdaySessions[index] += count;
    });
    for (const [spotId, spot] of Object.entries(month.spots)) {
      const entry = spots.get(spotId) ?? {
        spotId,
        visits: 0,
        verifiedDays: 0,
        minutes: 0,
        lastMs: spot.last_ms,
        isNew: periodMonths.has(firstMonthBySpot.get(spotId) ?? ""),
      };
      entry.visits += spot.visits;
      entry.verifiedDays += spot.verified_days;
      entry.minutes += spot.minutes;
      entry.lastMs = Math.max(entry.lastMs, spot.last_ms);
      if (spot.name) entry.name = spot.name;
      spots.set(spotId, entry);
    }
  }
  result.spots = [...spots.values()].sort(
    (left, right) =>
      right.visits - left.visits ||
      right.minutes - left.minutes ||
      right.lastMs - left.lastMs,
  );
  result.newSpots = result.spots.filter((spot) => spot.isNew).length;
  return result;
}

/** Monday = 0 … Sunday = 6 for a YYYY-MM-DD key. */
function mondayFirstWeekday(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}
