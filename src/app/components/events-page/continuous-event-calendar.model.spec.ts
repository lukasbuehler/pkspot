import { describe, expect, it } from "vitest";
import {
  appendCalendarMonths,
  buildContinuousEventCalendar,
  calendarMonthsAround,
  prependCalendarMonths,
} from "./continuous-event-calendar.model";

describe("continuous event calendar model", () => {
  it("builds an initial window around the anchor month", () => {
    expect(calendarMonthsAround("2026-08", 2, 3)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
  });

  it("extends month windows in either direction across years", () => {
    expect(prependCalendarMonths(["2027-01", "2027-02"], 2)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(appendCalendarMonths(["2026-11", "2026-12"], 2)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("deduplicates weeks shared by adjacent months", () => {
    const calendar = buildContinuousEventCalendar(
      ["2026-07", "2026-08"],
      "de-CH",
      [],
      new Date("2026-07-15T12:00:00.000Z"),
    );

    expect(new Set(calendar.weeks.map((week) => week.key)).size).toBe(
      calendar.weeks.length,
    );
    expect(calendar.days.some((day) => day.key === "2026-08-01")).toBe(true);
    expect(calendar.queryStartSeconds).toBeLessThan(
      calendar.queryEndSeconds,
    );
  });
});
