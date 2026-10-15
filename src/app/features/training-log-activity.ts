import type { LogEntryDocument } from "../../db/schemas/LogEntrySchema";
import type { RecoveryPauseDocument } from "../../db/schemas/RecoveryPauseSchema";
import type { SessionRecordDocument } from "../../db/schemas/SessionRecordSchema";

export interface TrainingActivityDay {
  key: string;
  entryIds: readonly string[];
  sessionCount: number;
  durationMinutes: number;
  spotCount: number;
}

export interface TrainingTimelineGroup {
  key: string;
  dateMs: number;
  entries: readonly LogEntryDocument[];
}

export interface TrainingLogMonthSummary {
  activityDays: number;
  entryCount: number;
  sessionCount: number;
  durationMinutes: number;
  spotCount: number;
}

export interface TrainingContributionDay {
  key: string;
  activity: TrainingActivityDay | null;
  recoveryPause: RecoveryPauseDocument | null;
  isToday: boolean;
  isFuture: boolean;
}

export interface TrainingContributionWeek {
  key: string;
  hasActivity: boolean;
  days: readonly TrainingContributionDay[];
}

export type TrainingContributionSelection =
  | { kind: "training-day"; dayKey: string }
  | { kind: "recovery-pause"; recoveryPauseId: string };

/** Private statistics come from session records; optional notes only link entries.
 * Public Spot activity has a separate delayed, thresholded server rollup.
 */
export function buildSessionActivityDays(
  sessions: readonly SessionRecordDocument[],
  entries: readonly LogEntryDocument[] = [],
): TrainingActivityDay[] {
  const entriesBySession = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const id of entry.session_record_ids) {
      const ids = entriesBySession.get(id) ?? new Set<string>();
      ids.add(entry.id);
      entriesBySession.set(id, ids);
    }
  }
  const days = new Map<string, TrainingActivityDay>();
  for (const session of new Map(sessions.map(record => [record.id, record])).values()) {
    const visits = (session.spot_visits ?? []).filter(visit =>
      session.source !== "check_in" || !!visit.check_in_id,
    );
    if (session.source === "check_in" && !visits.length) continue;
    const startedAt = new Date(session.started_at_raw_ms);
    if (!Number.isFinite(startedAt.getTime())) continue;
    let formatter: Intl.DateTimeFormat;
    try {
      formatter = new Intl.DateTimeFormat("en", {timeZone: session.time_zone || "UTC", year: "numeric", month: "2-digit", day: "2-digit"});
    } catch {
      formatter = new Intl.DateTimeFormat("en", {timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit"});
    }
    const parts = formatter.formatToParts(startedAt);
    const key = ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
    const day = days.get(key) ?? {key, entryIds: [], sessionCount: 0, durationMinutes: 0, spotCount: 0};
    // Check-ins confirm presence at a point in time, not time spent training.
    const duration = session.ended_at_raw_ms === undefined ? 0 :
      Math.max(0, Math.round((session.ended_at_raw_ms - session.started_at_raw_ms) / 60_000));
    day.entryIds = [...new Set([...day.entryIds, ...(entriesBySession.get(session.id) ?? [])])];
    day.sessionCount++;
    day.durationMinutes += Number.isFinite(duration) ? duration : 0;
    day.spotCount += new Set(visits.map(visit => visit.spot_id)).size;
    days.set(key, day);
  }
  return [...days.values()].sort((left, right) => right.key.localeCompare(left.key));
}

export function buildTrainingActivityDays(
  entries: readonly LogEntryDocument[],
): TrainingActivityDay[] {
  const days = new Map<string, {
    entryIds: Set<string>;
    sessionCount: number;
    durationMinutes: number;
    spotCount: number;
  }>();

  for (const entry of entries) {
    for (const session of entry.session_summaries ?? []) {
      const key = isDateKey(session.local_date)
        ? session.local_date
        : dateKey(entry.activity_at_raw_ms);
      const current = days.get(key) ?? {
        entryIds: new Set<string>(),
        sessionCount: 0,
        durationMinutes: 0,
        spotCount: 0,
      };
      current.entryIds.add(entry.id);
      current.sessionCount++;
      current.durationMinutes += session.duration_minutes ?? 0;
      current.spotCount += session.spot_count ?? 0;
      days.set(key, current);
    }
  }

  return [...days.entries()]
    .map(([key, value]) => ({
      key,
      entryIds: [...value.entryIds],
      sessionCount: value.sessionCount,
      durationMinutes: value.durationMinutes,
      spotCount: value.spotCount,
    }))
    .sort((left, right) => right.key.localeCompare(left.key));
}

export function buildTrainingTimeline(
  entries: readonly LogEntryDocument[],
  selectedDay: string | null,
): TrainingTimelineGroup[] {
  const matchingEntries = selectedDay
    ? entries.filter((entry) =>
        entry.session_summaries.some(
          (session) => session.local_date === selectedDay,
        ),
      )
    : entries;
  const grouped = new Map<string, LogEntryDocument[]>();

  for (const entry of matchingEntries) {
    const key = selectedDay ?? dateKey(entry.activity_at_raw_ms);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  return [...grouped.entries()]
    .map(([key, groupedEntries]) => ({
      key,
      dateMs: dateKeyToMs(key),
      entries: groupedEntries.sort(
        (left, right) => right.activity_at_raw_ms - left.activity_at_raw_ms,
      ),
    }))
    .sort((left, right) => right.key.localeCompare(left.key));
}

export function filterTrainingEntriesByMonth(
  entries: readonly LogEntryDocument[],
  month: string,
): readonly LogEntryDocument[] {
  return entries.filter(
    (entry) =>
      entry.session_summaries.some((session) =>
        session.local_date.startsWith(`${month}-`),
      ) || monthKey(entry.activity_at_raw_ms) === month,
  );
}

/**
 * Builds a GitHub-style continuous weekly history. The range keeps at least
 * 27 weeks visible, then grows backwards for every recorded training day.
 */
export function buildTrainingContributionWeeks(
  days: readonly TrainingActivityDay[],
  recoveryPauses: readonly RecoveryPauseDocument[],
  firstWeekday: 0 | 1,
  now = new Date(),
): TrainingContributionWeek[] {
  const activityByKey = new Map(days.map((day) => [day.key, day]));
  const today = atNoon(now);
  const minimumStart = addDays(today, -26 * 7);
  const earliestRecord = [...days.map((day) => day.key), ...recoveryPauses.map((pause) => pause.started_on)]
    .reduce<Date | null>((earliest, key) => {
      const date = dateFromKey(key);
      return !earliest || date < earliest ? date : earliest;
    },
    null,
  );
  const start = startOfWeek(
    earliestRecord && earliestRecord < minimumStart ? earliestRecord : minimumStart,
    firstWeekday,
  );
  const end = addDays(startOfWeek(today, firstWeekday), 6);
  const weeks: TrainingContributionWeek[] = [];

  for (let weekStart = start; weekStart <= end; weekStart = addDays(weekStart, 7)) {
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const key = dateKeyFromDate(date);
      return {
        key,
        activity: date > today ? null : activityByKey.get(key) ?? null,
        recoveryPause: date > today ? null : recoveryPauseOn(key, recoveryPauses, today),
        isToday: key === dateKeyFromDate(today),
        isFuture: date > today,
      } satisfies TrainingContributionDay;
    });
    weeks.push({
      key: dateKeyFromDate(weekStart),
      hasActivity: weekDays.some((day) => !!day.activity),
      days: weekDays,
    });
  }

  return weeks;
}

export interface TrainingStreaks {
  /** Consecutive weeks with at least one session, ending this week or last. */
  currentWeeks: number;
  /** Longest run of consecutive training days ever recorded. */
  longestDays: number;
}

/**
 * Consistency is measured in weeks so rest days never break it. The current
 * week counts once it has a session but does not end the streak while it is
 * still in progress. A week covered by a recovery pause neither counts nor
 * breaks the streak, so recording an injury is never punished.
 */
export function summarizeTrainingStreaks(
  days: readonly TrainingActivityDay[],
  recoveryPauses: readonly RecoveryPauseDocument[],
  firstWeekday: 0 | 1,
  now = new Date(),
): TrainingStreaks {
  const activeKeys = new Set(
    days.filter((day) => day.sessionCount > 0).map((day) => day.key),
  );
  const today = atNoon(now);
  const todayKey = dateKeyFromDate(today);

  let currentWeeks = 0;
  const earliestKey = [...activeKeys].sort()[0];
  const earliest = earliestKey ? dateFromKey(earliestKey) : today;
  for (
    let weekStart = startOfWeek(today, firstWeekday), isCurrentWeek = true;
    weekStart >= startOfWeek(earliest, firstWeekday);
    weekStart = addDays(weekStart, -7), isCurrentWeek = false
  ) {
    const weekKeys = Array.from({ length: 7 }, (_, index) =>
      dateKeyFromDate(addDays(weekStart, index)),
    ).filter((key) => key <= todayKey);
    if (weekKeys.some((key) => activeKeys.has(key))) {
      currentWeeks++;
      continue;
    }
    if (isCurrentWeek) continue;
    const paused = weekKeys.some((key) =>
      recoveryPauseOn(key, recoveryPauses, today),
    );
    if (!paused) break;
  }

  let longestDays = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const key of [...activeKeys].sort()) {
    const date = dateFromKey(key);
    run =
      previous && dateKeyFromDate(addDays(previous, 1)) === key ? run + 1 : 1;
    longestDays = Math.max(longestDays, run);
    previous = date;
  }

  return { currentWeeks, longestDays };
}

/** Locales whose week starts on Sunday get 0, everyone else Monday (1). */
export function localeFirstWeekday(locale: string): 0 | 1 {
  const localeWithWeekInfo = new Intl.Locale(locale) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
  };
  const firstDay = localeWithWeekInfo.getWeekInfo?.().firstDay;
  return firstDay === 7 || firstDay === 0 ? 0 : 1;
}

export function summarizeTrainingMonth(
  days: readonly TrainingActivityDay[],
  month: string,
): TrainingLogMonthSummary {
  const matchingDays = days.filter((day) => day.key.startsWith(`${month}-`));
  const entryIds = new Set(matchingDays.flatMap((day) => day.entryIds));
  return matchingDays.reduce<TrainingLogMonthSummary>(
    (summary, day) => ({
      activityDays: summary.activityDays + 1,
      entryCount: entryIds.size,
      sessionCount: summary.sessionCount + day.sessionCount,
      durationMinutes: summary.durationMinutes + day.durationMinutes,
      spotCount: summary.spotCount + day.spotCount,
    }),
    {
      activityDays: 0,
      entryCount: entryIds.size,
      sessionCount: 0,
      durationMinutes: 0,
      spotCount: 0,
    },
  );
}

export function dateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthKey(timestamp: number): string {
  return dateKey(timestamp).slice(0, 7);
}

export function dateKeyToMs(key: string): number {
  return new Date(`${key}T12:00:00`).getTime();
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function atNoon(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date: Date, firstWeekday: 0 | 1): Date {
  return addDays(date, -((date.getDay() - firstWeekday + 7) % 7));
}

function recoveryPauseOn(
  key: string,
  recoveryPauses: readonly RecoveryPauseDocument[],
  today: Date,
): RecoveryPauseDocument | null {
  const todayKey = dateKeyFromDate(today);
  return recoveryPauses.find((pause) =>
    pause.started_on <= key && key <= (pause.ended_on ?? todayKey),
  ) ?? null;
}
