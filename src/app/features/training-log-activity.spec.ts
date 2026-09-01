import { describe, expect, it } from "vitest";
import type { LogEntryDocument } from "../../db/schemas/LogEntrySchema";
import {
  buildTrainingActivityDays,
  buildTrainingContributionWeeks,
  buildTrainingTimeline,
  filterTrainingEntriesByMonth,
  formatDuration,
  summarizeTrainingMonth,
} from "./training-log-activity";

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
});
