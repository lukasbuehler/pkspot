import { describe, expect, it } from "vitest";
import { checkOutDurationMinutes } from "../schemas/TrainingSummarySchema";
import {
  buildTrainingMonthSummary,
  buildLocalLegendMonthSummary,
  buildTrainingSpotSummary,
  legendTalliesForMonth,
  localDateKey,
  monthRange,
  openRankMonths,
  rankSpotTallies,
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

  it("ranks Olympic-style and reports how many people share a rank", () => {
    const ranks = rankSpotTallies([
      { uid: "a", verified_days: 6 },
      { uid: "b", verified_days: 6 },
      { uid: "c", verified_days: 4 },
      { uid: "d", verified_days: 1 },
    ]);
    expect(ranks.get("a")).toEqual({ status: "ranked", verified_days: 6, rank: 1, tied_with: 1, legend: true });
    expect(ranks.get("b")?.rank).toBe(1);
    // A shared first place leaves second empty.
    expect(ranks.get("c")).toEqual({ status: "ranked", verified_days: 4, rank: 3, tied_with: 0, legend: false });
    // A single visit counts toward the group size but is not ranked.
    expect(ranks.has("d")).toBe(false);
  });

  it("withholds ranks until three people checked in at the Spot", () => {
    const ranks = rankSpotTallies([{ uid: "a", verified_days: 5 }, { uid: "b", verified_days: 3 }]);
    expect(ranks.get("a")).toEqual({ status: "too_few_people", verified_days: 5 });
    expect(ranks.get("b")).toEqual({ status: "too_few_people", verified_days: 3 });
  });

  it("keeps last month open for the grace days only", () => {
    expect(openRankMonths("2026-11-01")).toEqual(["2026-10", "2026-11"]);
    expect(openRankMonths("2026-11-02")).toEqual(["2026-10", "2026-11"]);
    expect(openRankMonths("2026-11-03")).toEqual(["2026-11"]);
  });

  it("bounds a check-out duration between five minutes and twelve hours", () => {
    const start = Date.parse("2026-10-19T16:00:00Z");
    expect(checkOutDurationMinutes(start, start + 60_000)).toBe(5);
    expect(checkOutDurationMinutes(start, start + 95 * 60_000)).toBe(95);
    expect(checkOutDurationMinutes(start, start + 20 * 3_600_000)).toBe(720);
  });
});

describe("Local Legend activation boundary", () => {
  it("keeps earlier training private while counting only visits after activation, including within a session", () => {
    const sessions = [checkIn("mixed", "2026-10-10T08:00:00Z", [
      {spot: "river", at: "2026-10-10T08:00:00Z", verified: true},
      {spot: "steps", at: "2026-10-10T10:00:00Z", verified: true},
    ]), checkIn("later", "2026-10-11T10:00:00Z", [{spot: "steps", verified: true}])];
    const full = buildTrainingMonthSummary("2026-10", sessions, new Set(), Date.now());
    const eligible = buildLocalLegendMonthSummary("2026-10", sessions, new Set(), at("2026-10-10T09:00:00Z"), Date.now());
    expect(full?.spots["river"].verified_days).toBe(1);
    expect(eligible?.spots["river"]).toBeUndefined();
    expect(eligible?.spots["steps"].verified_days).toBe(2);
    const rejoined = buildLocalLegendMonthSummary("2026-10", sessions, new Set(), at("2026-10-12T09:00:00Z"), Date.now());
    expect(legendTalliesForMonth("user", rejoined)).toEqual([]);
  });
});
