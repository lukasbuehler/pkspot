import type { LogEntryDocument } from "../../db/schemas/LogEntrySchema";
import type { RecoveryPauseDocument } from "../../db/schemas/RecoveryPauseSchema";

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
