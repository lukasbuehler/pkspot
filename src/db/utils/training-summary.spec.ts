import { describe, expect, it } from "vitest";
import {
  buildTrainingMonthSummary,
  buildTrainingSpotSummary,
  legendTalliesForMonth,
  localDateKey,
  monthRange,
  shiftMonth,
  summarizeTrainingPeriod,
  type TrainingSummarySession,
} from "./training-summary";

const at = (iso: string) => new Date(iso).getTime();

function checkIn(
  id: string,
  startIso: string,
  visits: { spot: string; at?: string; checkIn?: string; verified?: boolean; name?: string }[],
  endedIso?: string,
): TrainingSummarySession {
  return {
    id,
    source: "check_in",
    started_at_raw_ms: at(startIso),
    ...(endedIso ? { ended_at_raw_ms: at(endedIso) } : {}),
    time_zone: "Europe/Zurich",
    spot_visits: visits.map((visit, index) => ({
      spot_id: visit.spot,
      arrived_at_raw_ms: at(visit.at ?? startIso),
      check_in_id: visit.checkIn ?? `${id}-check-${index}`,
      ...(visit.verified === undefined ? {} : { verified: visit.verified }),
      ...(visit.name ? { spot_name: visit.name } : {}),
    })),
  };
}

function manual(id: string, startIso: string, spots: string[], endedIso?: string): TrainingSummarySession {
  return {
    id,
    source: "manual",
    started_at_raw_ms: at(startIso),
    ...(endedIso ? { ended_at_raw_ms: at(endedIso) } : {}),
    time_zone: "Europe/Zurich",
    spot_visits: spots.map((spot) => ({ spot_id: spot, arrived_at_raw_ms: at(startIso) })),
  };
}

describe("training summaries", () => {
  it("assigns sessions to the local month they started in", () => {
    // 23:30 UTC on 31 October is 00:30 on 1 November in Zurich.
    const late = checkIn("late", "2026-10-31T23:30:00Z", [{ spot: "a", verified: true }]);
    expect(localDateKey(late.started_at_raw_ms, late.time_zone)).toBe("2026-11-01");
    expect(buildTrainingMonthSummary("2026-10", [late], new Set(), 0)).toBeNull();
    expect(buildTrainingMonthSummary("2026-11", [late], new Set(), 0)?.session_count).toBe(1);
  });

  it("counts visits for every session but time only when a duration was logged", () => {
    const summary = buildTrainingMonthSummary(
      "2026-10",
      [
        checkIn("s1", "2026-10-05T16:00:00Z", [{ spot: "a", verified: true }], "2026-10-05T17:30:00Z"),
        checkIn("s2", "2026-10-07T16:00:00Z", [{ spot: "a", verified: true }]),
        manual("m1", "2026-10-09T08:00:00Z", ["b", "c"], "2026-10-09T09:00:00Z"),
      ],
      new Set(),
      0,
    )!;

    expect(summary.session_count).toBe(3);
    expect(summary.sessions_with_duration).toBe(2);
    expect(summary.minutes).toBe(150);
    expect(Object.keys(summary.days)).toEqual(["2026-10-05", "2026-10-07", "2026-10-09"]);
    expect(summary.spots["a"]).toMatchObject({ visits: 2, verified_days: 2, minutes: 90 });
    // A session's time is split evenly between its Spots.
    expect(summary.spots["b"]).toMatchObject({ visits: 1, verified_days: 0, minutes: 30 });
    expect(summary.spots["c"]).toMatchObject({ visits: 1, verified_days: 0, minutes: 30 });
  });

  it("counts verified days, not check-ins, and never counts manual or excluded visits", () => {
    const summary = buildTrainingMonthSummary(
      "2026-10",
      [
        checkIn("s1", "2026-10-05T08:00:00Z", [
          { spot: "a", verified: true },
          { spot: "a", at: "2026-10-05T14:00:00Z", verified: true },
        ]),
        checkIn("s2", "2026-10-06T08:00:00Z", [{ spot: "a", verified: false }]),
        // Older check-ins without the flag fall back to the lookup set.
        checkIn("s3", "2026-10-07T08:00:00Z", [{ spot: "a", checkIn: "legacy-ok" }]),
        checkIn("s4", "2026-10-08T08:00:00Z", [{ spot: "a", checkIn: "legacy-excluded" }]),
        manual("m1", "2026-10-09T08:00:00Z", ["a"]),
      ],
      new Set(["legacy-ok"]),
      0,
    )!;

    expect(summary.spots["a"].visits).toBe(5);
    expect(summary.spots["a"].verified_days).toBe(2);
    expect(legendTalliesForMonth("user-1", summary)).toEqual([
      expect.objectContaining({ uid: "user-1", spot_id: "a", month: "2026-10", verified_days: 2 }),
    ]);
  });

  it("ignores check-in sessions without confirmed visits and implausible durations", () => {
    const empty: TrainingSummarySession = {
      id: "empty",
      source: "check_in",
      started_at_raw_ms: at("2026-10-05T08:00:00Z"),
      time_zone: "Europe/Zurich",
      spot_visits: [{ spot_id: "a", arrived_at_raw_ms: at("2026-10-05T08:00:00Z") }],
    };
    const tooLong = manual("long", "2026-10-06T08:00:00Z", ["a"], "2026-10-08T08:00:00Z");
    const summary = buildTrainingMonthSummary("2026-10", [empty, tooLong], new Set(), 0)!;
    expect(summary.session_count).toBe(1);
    expect(summary.minutes).toBe(0);
    expect(summary.sessions_with_duration).toBe(0);
  });

  it("builds an all-time Spot view and period summaries with new Spots", () => {
    const september = buildTrainingMonthSummary(
      "2026-09",
      [checkIn("s1", "2026-09-10T08:00:00Z", [{ spot: "a", verified: true, name: "Riverside" }], "2026-09-10T09:00:00Z")],
      new Set(),
      0,
    )!;
    const october = buildTrainingMonthSummary(
      "2026-10",
      [
        checkIn("s2", "2026-10-10T08:00:00Z", [{ spot: "a", verified: true }]),
        manual("m1", "2026-10-11T08:00:00Z", ["b"]),
      ],
      new Set(),
      0,
    )!;

    expect(buildTrainingSpotSummary("a", [october, september], 0)).toMatchObject({
      visits: 2,
      verified_days: 2,
      minutes: 60,
      name: "Riverside",
      months: { "2026-09": 1, "2026-10": 1 },
    });
    expect(buildTrainingSpotSummary("missing", [october], 0)).toBeNull();

    const octoberOnly = summarizeTrainingPeriod([september, october], new Set(["2026-10"]));
    expect(octoberOnly).toMatchObject({ sessions: 2, activeDays: 2, newSpots: 1 });
    // Equal visits: the most recently visited Spot comes first.
    expect(octoberOnly.spots.map((spot) => [spot.spotId, spot.isNew])).toEqual([["b", true], ["a", false]]);

    const year = summarizeTrainingPeriod([september, october], new Set(monthRange("2026-01", "2026-12")));
    expect(year).toMatchObject({ sessions: 3, minutes: 60, newSpots: 2 });
    expect(year.spots[0]).toMatchObject({ spotId: "a", visits: 2 });
  });

  it("walks months across year boundaries", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
