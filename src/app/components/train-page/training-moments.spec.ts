import { describe, expect, it } from "vitest";
import type { PlannedSession } from "../../../db/schemas/PlannedSessionSchema";
import type { SessionRecordDocument } from "../../../db/schemas/SessionRecordSchema";
import type { RankedTrainingEvent } from "./training-recommendations";
import { selectTrainingMoments, type TrainingMomentInput } from "./training-moments";

// Thursday, 20 August 2026, 14:00 in Zurich.
const nowMs = Date.UTC(2026, 7, 20, 12);
const minute = 60_000;
const hour = 60 * minute;

describe("selectTrainingMoments", () => {
  it("shows events you are going to at any distance when live or within three hours", () => {
    const moments = select({
      events: [
        event({ id: "far-going", startMs: nowMs + 2 * hour, distanceKm: 9_000 }),
        event({ id: "too-early", startMs: nowMs + 4 * hour, distanceKm: 1 }),
      ],
      goingEventIds: ["far-going", "too-early"],
    });
    expect(moments).toEqual([
      expect.objectContaining({ kind: "event", key: "event:far-going", phase: "soon", minutesUntilStart: 120, relationship: "going" }),
    ]);
  });

  it("limits saved events to 30 km", () => {
    const moments = select({
      events: [
        event({ id: "saved-near", startMs: nowMs + 150 * minute, distanceKm: 25 }),
        event({ id: "saved-far", startMs: nowMs - hour, distanceKm: 40 }),
      ],
      savedEventIds: ["saved-near", "saved-far"],
    });
    expect(moments.map((moment) => moment.key)).toEqual(["event:saved-near"]);
  });

  it("shows other live events within 10 km and other events starting within an hour within 30 km", () => {
    const moments = select({
      events: [
        event({ id: "live-near", startMs: nowMs - hour, distanceKm: 8 }),
        event({ id: "live-15km", startMs: nowMs - hour, distanceKm: 15 }),
        event({ id: "soon-25km", startMs: nowMs + 45 * minute, distanceKm: 25 }),
        event({ id: "soon-40km", startMs: nowMs + 45 * minute, distanceKm: 40 }),
        event({ id: "later-near", startMs: nowMs + 2 * hour, distanceKm: 1 }),
        event({ id: "live-asia", startMs: nowMs - hour, distanceKm: 9_000 }),
        event({ id: "no-location", startMs: nowMs - hour }),
      ],
    });
    expect(moments.map((moment) => moment.key)).toEqual(["event:live-near", "event:soon-25km"]);
  });

  it("skips events that end within 30 minutes, cancelled events and date-only events", () => {
    const moments = select({
      events: [
        event({ id: "ending", startMs: nowMs - 2 * hour, endMs: nowMs + 20 * minute, distanceKm: 1 }),
        event({ id: "cancelled", startMs: nowMs - hour, distanceKm: 1, lifecycleStatus: "cancelled" }),
        event({
          id: "date-only",
          startMs: nowMs - hour,
          distanceKm: 1,
          timing: { mode: "date_only", start_date: "2026-08-20" },
        }),
      ],
      goingEventIds: ["ending"],
    });
    expect(moments).toEqual([]);
  });

  it("treats multi-day events as live only during today's program", () => {
    const camp = (id: string, startTime: string, endTime: string) =>
      event({
        id,
        startMs: Date.UTC(2026, 7, 18, 7),
        endMs: Date.UTC(2026, 7, 22, 16),
        distanceKm: 3,
        timeZone: "Europe/Zurich",
        timing: {
          mode: "exact",
          start_date: "2026-08-18",
          end_date: "2026-08-22",
          start_time: startTime,
          end_time: endTime,
        },
      });
    const moments = select({
      events: [
        camp("camp-running", "09:00", "18:00"),
        camp("camp-evening", "16:00", "20:00"),
        camp("camp-morning", "08:00", "12:00"),
        event({
          id: "camp-without-hours",
          startMs: Date.UTC(2026, 7, 18, 7),
          endMs: Date.UTC(2026, 7, 22, 16),
          distanceKm: 3,
        }),
      ],
      goingEventIds: ["camp-evening"],
    });
    expect(moments).toEqual([
      expect.objectContaining({ key: "event:camp-evening", phase: "soon", minutesUntilStart: 120 }),
      expect.objectContaining({ key: "event:camp-running", phase: "live" }),
    ]);
  });

  it("puts your active session first, then going, then saved, then nearby", () => {
    const moments = select({
      sessions: [
        session({ id: "active", lastActivityMs: nowMs - 20 * minute }),
        session({ id: "idle", lastActivityMs: nowMs - 6 * hour }),
        session({ id: "ended", lastActivityMs: nowMs - 10 * minute, ended: true }),
      ],
      events: [
        event({ id: "nearby", startMs: nowMs - hour, distanceKm: 2 }),
        event({ id: "saved", startMs: nowMs + hour, distanceKm: 5 }),
        event({ id: "going", startMs: nowMs + 2 * hour, distanceKm: 50 }),
      ],
      goingEventIds: ["going"],
      savedEventIds: ["saved"],
    });
    expect(moments.map((moment) => moment.key)).toEqual([
      "session:active",
      "event:going",
      "event:saved",
      "event:nearby",
    ]);
  });

  it("includes your planned sessions within three hours", () => {
    const moments = select({
      plannedSessions: [
        planned({ id: "tonight", startsAt: nowMs + 2 * hour }),
        planned({ id: "tomorrow", startsAt: nowMs + 24 * hour }),
        planned({ id: "cancelled", startsAt: nowMs + hour, cancelled: true }),
      ],
    });
    expect(moments).toEqual([
      expect.objectContaining({ kind: "planned-session", key: "planned:tonight", phase: "soon" }),
    ]);
  });
});

function select(overrides: Partial<TrainingMomentInput>) {
  return selectTrainingMoments({
    nowMs,
    sessions: [],
    events: [],
    goingEventIds: [],
    savedEventIds: [],
    sessionIdleWindowMs: 5 * hour,
    ...overrides,
  });
}

function event({
  id,
  startMs,
  endMs = startMs + 3 * hour,
  ...overrides
}: Partial<RankedTrainingEvent> & { id: string; startMs: number; endMs?: number }): RankedTrainingEvent {
  return {
    id,
    name: id,
    isSponsored: false,
    hasOrganization: false,
    hasVenueSpot: false,
    venueSpotCount: 0,
    startSeconds: startMs / 1000,
    endSeconds: endMs / 1000,
    lifecycleStatus: "planned",
    eventLinks: [],
    ticketOptions: [],
    spotIds: [],
    communityKeys: [],
    seriesIds: [],
    eventCategories: [],
    rsvpCounts: { going: 0, interested: 0, notgoing: 0, total: 0 },
    seriesRoles: [],
    qualifiesToKeys: [],
    requiredQualifierKeys: [],
    live: startMs <= nowMs && endMs >= nowMs,
    ...overrides,
  };
}

function session({
  id,
  lastActivityMs,
  ended = false,
}: {
  id: string;
  lastActivityMs: number;
  ended?: boolean;
}): SessionRecordDocument {
  return {
    id,
    source: "check_in",
    started_at_raw_ms: lastActivityMs - hour,
    last_activity_raw_ms: lastActivityMs,
    ...(ended ? { ended_at_raw_ms: lastActivityMs } : {}),
    time_zone: "Europe/Zurich",
    spot_visits: [],
  } as unknown as SessionRecordDocument;
}

function planned({
  id,
  startsAt,
  cancelled = false,
}: {
  id: string;
  startsAt: number;
  cancelled?: boolean;
}): PlannedSession {
  return {
    id,
    title: id,
    notes: "",
    spotId: "spot-1",
    startsAt,
    endsAt: startsAt + 2 * hour,
    timeZone: "Europe/Zurich",
    audience: "private",
    ownerUid: "user-1",
    cancelled,
    revision: 1,
  };
}
