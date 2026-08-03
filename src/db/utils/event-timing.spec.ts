import { describe, expect, it } from "vitest";
import {
  eventCompatibilityWindow,
  eventWallClockToDate,
  isDateKey,
  legacyExactTiming,
  normalizedEndDate,
  validateEventTiming,
} from "./event-timing";

describe("event timing", () => {
  it("validates civil dates and defaults an omitted end date", () => {
    const timing = { start_date: "2028-02-29", mode: "date_only" } as const;

    expect(isDateKey(timing.start_date)).toBe(true);
    expect(isDateKey("2027-02-29")).toBe(false);
    expect(normalizedEndDate(timing)).toBe("2028-02-29");
    expect(validateEventTiming(timing)).toEqual({ valid: true });
  });

  it("creates the documented UTC full-day compatibility span", () => {
    const window = eventCompatibilityWindow({
      start_date: "2026-07-09",
      end_date: "2026-07-12",
      mode: "date_only",
    });

    expect(window.start.toISOString()).toBe("2026-07-09T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-07-12T23:59:59.999Z");
  });

  it("converts Zurich wall clocks without using the device time zone", () => {
    expect(
      eventWallClockToDate(
        "2026-07-09",
        "18:30",
        "Europe/Zurich",
      ).toISOString(),
    ).toBe("2026-07-09T16:30:00.000Z");
  });

  it("rejects spring-forward gaps and chooses the earliest overlap instant", () => {
    expect(() =>
      eventWallClockToDate("2026-03-29", "02:30", "Europe/Zurich"),
    ).toThrow(/does not exist/u);
    expect(
      eventWallClockToDate(
        "2026-10-25",
        "02:30",
        "Europe/Zurich",
      ).toISOString(),
    ).toBe("2026-10-25T00:30:00.000Z");
  });

  it("uses the operational cutoff only as an open-end compatibility end", () => {
    const activeUntil = new Date("2026-07-09T20:30:00.000Z");
    const window = eventCompatibilityWindow(
      {
        start_date: "2026-07-09",
        start_time: "18:30",
        mode: "open_end",
      },
      "Europe/Zurich",
      activeUntil,
    );

    expect(window.start.toISOString()).toBe("2026-07-09T16:30:00.000Z");
    expect(window.end).not.toBe(activeUntil);
    expect(window.end.toISOString()).toBe(activeUntil.toISOString());
  });

  it("rejects exact endings that do not follow the start", () => {
    expect(
      validateEventTiming(
        {
          start_date: "2026-07-09",
          start_time: "18:30",
          end_time: "18:30",
          mode: "exact",
        },
        "Europe/Zurich",
      ),
    ).toEqual({
      valid: false,
      field: "end_time",
      reason: "not_after_start",
    });
  });

  it("derives canonical local fields from legacy instants", () => {
    expect(
      legacyExactTiming(
        new Date("2026-12-31T22:30:00.000Z"),
        new Date("2027-01-01T01:00:00.000Z"),
        "Europe/Zurich",
      ),
    ).toEqual({
      start_date: "2026-12-31",
      end_date: "2027-01-01",
      start_time: "23:30",
      end_time: "02:00",
      mode: "exact",
    });
  });
});
