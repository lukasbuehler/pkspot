import type { PlannedSession } from "../../../db/schemas/PlannedSessionSchema";
import type { SessionRecordDocument } from "../../../db/schemas/SessionRecordSchema";
import {
  eventWallClockToDate,
  normalizedEndDate,
} from "../../../db/utils/event-timing";
import type { RankedTrainingEvent } from "./training-recommendations";

/**
 * Green means "happening now" across the app. On the Train page the large
 * green card is stricter: it only appears for things the person can still act
 * on, because they are going, saved it nearby, or it is genuinely close.
 */
export const TRAINING_MOMENT_RULES = {
  /** Events the person marked as going: any distance. */
  goingLeadMinutes: 180,
  /** Saved events: close enough to reach in time. */
  savedLeadMinutes: 180,
  savedRadiusKm: 30,
  /** Other live events: a short ride away, since they have already started. */
  nearbyLiveRadiusKm: 10,
  /** Other events starting soon: an hour is enough to travel a bit further. */
  nearbySoonLeadMinutes: 60,
  nearbySoonRadiusKm: 30,
  /** The person's own planned sessions. */
  plannedLeadMinutes: 180,
  /** Nothing is worth heading to if it ends this soon. */
  endingSoonMinutes: 30,
  /** Longer events are treated as daily programs (camps, multi-day jams). */
  multiDayThresholdHours: 24,
} as const;

export type TrainingMomentPhase = "live" | "soon";
export type TrainingEventRelationship = "going" | "saved" | null;

export type TrainingMoment =
  | {
      kind: "active-session";
      key: string;
      session: SessionRecordDocument;
    }
  | {
      kind: "event";
      key: string;
      event: RankedTrainingEvent;
      phase: TrainingMomentPhase;
      minutesUntilStart: number;
      relationship: TrainingEventRelationship;
    }
  | {
      kind: "planned-session";
      key: string;
      session: PlannedSession;
      phase: TrainingMomentPhase;
      minutesUntilStart: number;
    };

export interface TrainingMomentInput {
  nowMs: number;
  sessions: readonly SessionRecordDocument[];
  events: readonly RankedTrainingEvent[];
  goingEventIds: readonly string[];
  savedEventIds: readonly string[];
  plannedSessions?: readonly PlannedSession[];
  /** A session with no activity for this long is considered finished. */
  sessionIdleWindowMs: number;
}

interface TimeWindow {
  startMs: number;
  endMs: number;
}

/**
 * Selects what deserves the Train page's green "now" card, most personal
 * first: your active session, then your plans and events you are going to,
 * then saved events, then nearby events. Live items precede upcoming ones.
 */
export function selectTrainingMoments(
  input: TrainingMomentInput,
): TrainingMoment[] {
  const rules = TRAINING_MOMENT_RULES;
  const moments: { moment: TrainingMoment; rank: number; startMs: number }[] =
    [];

  for (const session of input.sessions) {
    if (!isActiveSession(session, input.nowMs, input.sessionIdleWindowMs)) {
      continue;
    }
    moments.push({
      moment: { kind: "active-session", key: `session:${session.id}`, session },
      rank: 0,
      startMs: session.started_at_raw_ms,
    });
  }

  for (const session of input.plannedSessions ?? []) {
    if (session.cancelled) continue;
    const timing = classify(
      { startMs: session.startsAt, endMs: session.endsAt },
      input.nowMs,
      rules.plannedLeadMinutes,
    );
    if (!timing) continue;
    moments.push({
      moment: {
        kind: "planned-session",
        key: `planned:${session.id}`,
        session,
        ...timing,
      },
      rank: 1,
      startMs: session.startsAt,
    });
  }

  const going = new Set(input.goingEventIds);
  const saved = new Set(input.savedEventIds);
  for (const event of input.events) {
    const window = trainingEventWindow(event, input.nowMs);
    if (!window) continue;
    const relationship: TrainingEventRelationship = going.has(event.id)
      ? "going"
      : saved.has(event.id)
        ? "saved"
        : null;
    const distance = event.distanceKm;
    let timing: ReturnType<typeof classify> = null;
    if (relationship === "going") {
      timing = classify(window, input.nowMs, rules.goingLeadMinutes);
    } else if (relationship === "saved") {
      timing =
        distance !== undefined && distance <= rules.savedRadiusKm
          ? classify(window, input.nowMs, rules.savedLeadMinutes)
          : null;
    } else if (distance !== undefined) {
      const candidate = classify(
        window,
        input.nowMs,
        rules.nearbySoonLeadMinutes,
      );
      const radius =
        candidate?.phase === "live"
          ? rules.nearbyLiveRadiusKm
          : rules.nearbySoonRadiusKm;
      timing = candidate && distance <= radius ? candidate : null;
    }
    if (!timing) continue;
    moments.push({
      moment: {
        kind: "event",
        key: `event:${event.id}`,
        event,
        relationship,
        ...timing,
      },
      rank: relationship === "going" ? 1 : relationship === "saved" ? 2 : 3,
      startMs: window.startMs,
    });
  }

  return moments
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        phaseOrder(left.moment) - phaseOrder(right.moment) ||
        left.startMs - right.startMs,
    )
    .map(({ moment }) => moment);
}

/**
 * The window during which an event can be joined today. Single-day events use
 * their start and end. Multi-day events (camps, festivals) only count during
 * today's daily hours, so a five-day camp is not "live" at midnight. Events
 * with only dates have no joinable time and are skipped.
 */
export function trainingEventWindow(
  event: RankedTrainingEvent,
  nowMs: number,
): TimeWindow | null {
  if (event.lifecycleStatus === "cancelled") return null;
  if (event.timing?.mode === "date_only") return null;
  const startMs = event.startSeconds * 1000;
  const endMs = event.endSeconds * 1000;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  const multiDayMs = TRAINING_MOMENT_RULES.multiDayThresholdHours * 3_600_000;
  if (endMs - startMs <= multiDayMs) return { startMs, endMs };

  const timing = event.timing;
  const timeZone = event.timeZone;
  if (!timing?.start_time || !timing.end_time || !timeZone) return null;
  if (timing.end_time <= timing.start_time) return null;
  const today = localDateKey(nowMs, timeZone);
  if (!today) return null;
  if (today < timing.start_date || today > normalizedEndDate(timing)) {
    return null;
  }
  try {
    return {
      startMs: eventWallClockToDate(today, timing.start_time, timeZone).getTime(),
      endMs: eventWallClockToDate(today, timing.end_time, timeZone).getTime(),
    };
  } catch {
    return null;
  }
}

function classify(
  window: TimeWindow,
  nowMs: number,
  leadMinutes: number,
): { phase: TrainingMomentPhase; minutesUntilStart: number } | null {
  const minutesUntilStart = Math.ceil((window.startMs - nowMs) / 60_000);
  const minutesUntilEnd = (window.endMs - nowMs) / 60_000;
  if (minutesUntilEnd <= TRAINING_MOMENT_RULES.endingSoonMinutes) return null;
  if (window.startMs <= nowMs) return { phase: "live", minutesUntilStart: 0 };
  if (minutesUntilStart <= leadMinutes) {
    return { phase: "soon", minutesUntilStart };
  }
  return null;
}

function isActiveSession(
  session: SessionRecordDocument,
  nowMs: number,
  idleWindowMs: number,
): boolean {
  if (session.ended_at_raw_ms !== undefined) return false;
  const lastActivity = session.last_activity_raw_ms ?? session.started_at_raw_ms;
  return (
    Number.isFinite(lastActivity) &&
    lastActivity <= nowMs &&
    nowMs - lastActivity < idleWindowMs
  );
}

function phaseOrder(moment: TrainingMoment): number {
  return moment.kind === "active-session" || moment.phase === "live" ? 0 : 1;
}

function localDateKey(nowMs: number, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(nowMs));
    const value = (type: string) =>
      parts.find((part) => part.type === type)?.value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch {
    return null;
  }
}
