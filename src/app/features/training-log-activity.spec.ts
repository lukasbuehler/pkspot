import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { SessionRecordDocument } from "../../db/schemas/SessionRecordSchema";
import type { LogEntryDocument } from "../../db/schemas/LogEntrySchema";
import type { RecoveryPauseDocument } from "../../db/schemas/RecoveryPauseSchema";
import {
  buildTrainingActivityDays,
  buildSessionActivityDays,
  buildTrainingContributionWeeks,
  buildTrainingTimeline,
  filterTrainingEntriesByMonth,
  formatDuration,
  summarizeTrainingMonth,
  summarizeTrainingStreaks,
  type TrainingActivityDay,
} from "./training-log-activity";

function checkInSession(overrides: Partial<SessionRecordDocument> = {}): SessionRecordDocument {
  const start = Timestamp.fromDate(new Date("2026-08-01T00:30:00Z"));
  return {
    id: "session-1", owner_id: "user-1", source: "check_in",
    started_at: start, started_at_raw_ms: start.toMillis(),
    last_activity_at: start, last_activity_raw_ms: start.toMillis() + 60 * 60_000,
    time_zone: "Europe/Zurich", people_present: [],
    spot_visits: [{check_in_id: "check-1", spot_id: "spot-1", arrived_at: start, arrived_at_raw_ms: start.toMillis()}],
    time_created: start, time_created_raw_ms: start.toMillis(),
    time_updated: start, time_updated_raw_ms: start.toMillis(),
    ...overrides,
  };
}

describe("private session activity statistics", () => {
  it("counts confirmed check-ins without notes and never infers duration from last activity", () => {
    const session = checkInSession();
    const days = buildSessionActivityDays([session, session]);
    expect(days).toEqual([{key: "2026-08-01", entryIds: [], sessionCount: 1, durationMinutes: 0, spotCount: 1}]);
    expect(summarizeTrainingMonth(days, "2026-08")).toMatchObject({activityDays: 1, sessionCount: 1, spotCount: 1, durationMinutes: 0});
  });

  it("optional, duplicated, stale or deleted notes cannot change session totals", () => {
    const session = checkInSession();
    const notes = [entries[0], {...entries[0], id: "duplicate-note"}];
    const withNotes = summarizeTrainingMonth(buildSessionActivityDays([session], notes), "2026-08");
    const withoutNotes = summarizeTrainingMonth(buildSessionActivityDays([session]), "2026-08");
    expect({...withNotes, entryCount: 0}).toEqual(withoutNotes);
    expect(withNotes.entryCount).toBe(2);
    expect(buildSessionActivityDays([], notes)).toEqual([]);
  });

  it("uses the session timezone at month boundaries and only explicit end times", () => {
    const session = checkInSession({time_zone: "America/Los_Angeles"});
    const ended = checkInSession({id: "manual", source: "manual", ended_at_raw_ms: session.started_at_raw_ms + 90 * 60_000});
    const days = buildSessionActivityDays([session, ended]);
    expect(summarizeTrainingMonth(days, "2026-07")).toMatchObject({sessionCount: 1, durationMinutes: 0, activityDays: 1});
    expect(summarizeTrainingMonth(days, "2026-08")).toMatchObject({sessionCount: 1, durationMinutes: 90, activityDays: 1});
  });

  it("counts each confirmed Spot once per session and ignores empty deleted check-in records", () => {
    const session = checkInSession();
    session.spot_visits.push({...session.spot_visits[0], check_in_id: "check-2"}, {...session.spot_visits[0], check_in_id: undefined, spot_id: "unconfirmed"});
    expect(buildSessionActivityDays([session])[0].spotCount).toBe(1);
    expect(buildSessionActivityDays([checkInSession({spot_visits: []})], entries)).toEqual([]);
  });

  it("does not truncate more than fifty sessions in a month", () => {
    const sessions = Array.from({length: 60}, (_, index) => checkInSession({id: `session-${index}`}));
    expect(summarizeTrainingMonth(buildSessionActivityDays(sessions), "2026-08").sessionCount).toBe(60);
  });
});

const entries: LogEntryDocument[] = [
  {
    id: "entry-1",
    owner_id: "user-1",
    note: "Flow practice",
    visibility: "private",
    session_record_ids: ["session-1", "session-2"],
    session_summaries: [
      {
        session_record_id: "session-1",
        local_date: "2026-08-02",
        duration_minutes: 90,
        spot_count: 2,
      },
      {
        session_record_id: "session-2",
        local_date: "2026-08-04",
        duration_minutes: 30,
        spot_count: 1,
      },
    ],
    activity_at: {} as LogEntryDocument["activity_at"],
    activity_at_raw_ms: new Date("2026-08-02T12:00:00").getTime(),
    time_created: {} as LogEntryDocument["time_created"],
    time_created_raw_ms: 0,
    time_updated: {} as LogEntryDocument["time_updated"],
    time_updated_raw_ms: 0,
  },
  {
    id: "entry-2",
    owner_id: "user-1",
    note: "Precision",
    visibility: "private",
    session_record_ids: ["session-3"],
    session_summaries: [
      {
        session_record_id: "session-3",
        local_date: "2026-08-04",
        duration_minutes: 60,
        spot_count: 1,
      },
    ],
    activity_at: {} as LogEntryDocument["activity_at"],
    activity_at_raw_ms: new Date("2026-08-04T12:00:00").getTime(),
    time_created: {} as LogEntryDocument["time_created"],
    time_created_raw_ms: 0,
    time_updated: {} as LogEntryDocument["time_updated"],
    time_updated_raw_ms: 0,
  },
];

const recoveryPause: RecoveryPauseDocument = {
  id: "recovery-1",
  owner_id: "user-1",
  started_on: "2026-08-03",
  ended_on: "2026-08-05",
  reason: "injury",
  time_created: {} as RecoveryPauseDocument["time_created"],
  time_created_raw_ms: 0,
  time_updated: {} as RecoveryPauseDocument["time_updated"],
  time_updated_raw_ms: 0,
};

describe("training log activity helpers", () => {
  it("aggregates sessions, duration, spots, and distinct entries by local training day", () => {
    const days = buildTrainingActivityDays(entries);

    expect(days).toEqual([
      {
        key: "2026-08-04",
        entryIds: ["entry-1", "entry-2"],
        sessionCount: 2,
        durationMinutes: 90,
        spotCount: 2,
      },
      {
        key: "2026-08-02",
        entryIds: ["entry-1"],
        sessionCount: 1,
        durationMinutes: 90,
        spotCount: 2,
      },
    ]);
    expect(summarizeTrainingMonth(days, "2026-08")).toEqual({
      activityDays: 2,
      entryCount: 2,
      sessionCount: 3,
      durationMinutes: 180,
      spotCount: 4,
    });
  });

  it("filters a timeline to entries that contain the selected local day", () => {
    const timeline = buildTrainingTimeline(entries, "2026-08-04");

    expect(timeline).toHaveLength(1);
    expect(timeline[0].entries.map((entry) => entry.id)).toEqual([
      "entry-2",
      "entry-1",
    ]);
    expect(formatDuration(135)).toBe("2h 15m");
  });

  it("filters a month by session date and falls back to the legacy activity time", () => {
    const legacyActivity: LogEntryDocument = {
      ...entries[0],
      id: "legacy-entry",
      activity_at_raw_ms: new Date("2026-09-09T12:00:00").getTime(),
      session_summaries: [],
    };

    expect(filterTrainingEntriesByMonth([...entries, legacyActivity], "2026-09").map((entry) => entry.id)).toEqual([
      "legacy-entry",
    ]);
  });

  it("builds continuous Monday-first columns and omits future days", () => {
    const days = buildTrainingActivityDays(entries);
    const weeks = buildTrainingContributionWeeks(
      days,
      [],
      1,
      new Date("2026-08-05T12:00:00"),
    );
    const activeWeek = weeks.find((week) => week.key === "2026-08-03");

    expect(activeWeek).toMatchObject({ key: "2026-08-03", hasActivity: true });
    expect(activeWeek?.days.map((day) => [day.key, !!day.activity])).toEqual([
      ["2026-08-03", false],
      ["2026-08-04", true],
      ["2026-08-05", false],
      ["2026-08-06", false],
      ["2026-08-07", false],
      ["2026-08-08", false],
      ["2026-08-09", false],
    ]);
    expect(activeWeek?.days.map((day) => day.isFuture)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
    expect(weeks.at(-1)?.key).toBe("2026-08-03");
    expect(weeks.length).toBeGreaterThanOrEqual(27);
  });

  it("shows recovery dates without changing activity totals or future cells", () => {
    const days = buildTrainingActivityDays(entries);
    const weeks = buildTrainingContributionWeeks(
      days,
      [recoveryPause],
      1,
      new Date("2026-08-05T12:00:00"),
    );
    const activeWeek = weeks.find((week) => week.key === "2026-08-03");

    expect(activeWeek?.hasActivity).toBe(true);
    expect(activeWeek?.days.map((day) => [
      day.key,
      !!day.activity,
      day.recoveryPause?.id ?? null,
    ])).toEqual([
      ["2026-08-03", false, "recovery-1"],
      ["2026-08-04", true, "recovery-1"],
      ["2026-08-05", false, "recovery-1"],
      ["2026-08-06", false, null],
      ["2026-08-07", false, null],
      ["2026-08-08", false, null],
      ["2026-08-09", false, null],
    ]);
    expect(summarizeTrainingMonth(days, "2026-08")).toMatchObject({
      sessionCount: 3,
      activityDays: 2,
    });
  });
});

describe("training streaks", () => {
  const day = (key: string): TrainingActivityDay => ({
    key, entryIds: [], sessionCount: 1, durationMinutes: 0, spotCount: 1,
  });
  // Thursday, 20 August 2026. Weeks start on Monday.
  const now = new Date(2026, 7, 20, 15);

  it("counts consecutive weeks and keeps an empty current week from breaking it", () => {
    const streaks = summarizeTrainingStreaks(
      [day("2026-08-12"), day("2026-08-04"), day("2026-07-28"), day("2026-07-14")],
      [],
      1,
      now,
    );
    expect(streaks.currentWeeks).toBe(3);
  });

  it("includes the current week once it has a session", () => {
    expect(
      summarizeTrainingStreaks([day("2026-08-18"), day("2026-08-12")], [], 1, now)
        .currentWeeks,
    ).toBe(2);
  });

  it("does not break the streak for a week covered by a recovery pause", () => {
    const pause: RecoveryPauseDocument = {
      ...recoveryPause,
      started_on: "2026-08-03",
      ended_on: "2026-08-09",
    };
    expect(
      summarizeTrainingStreaks([day("2026-08-12"), day("2026-07-29")], [pause], 1, now)
        .currentWeeks,
    ).toBe(2);
    expect(
      summarizeTrainingStreaks([day("2026-08-12"), day("2026-07-29")], [], 1, now)
        .currentWeeks,
    ).toBe(1);
  });

  it("finds the longest run of consecutive training days", () => {
    const streaks = summarizeTrainingStreaks(
      [day("2026-07-30"), day("2026-07-31"), day("2026-08-01"), day("2026-08-05"), day("2026-08-06")],
      [],
      1,
      now,
    );
    expect(streaks.longestDays).toBe(3);
  });

  it("returns zero without training history", () => {
    expect(summarizeTrainingStreaks([], [], 1, now)).toEqual({ currentWeeks: 0, longestDays: 0 });
  });
});
