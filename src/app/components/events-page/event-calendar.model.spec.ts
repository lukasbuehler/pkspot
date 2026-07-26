import { describe, expect, it } from "vitest";
import type { EventDiscoveryItem } from "../../services/search.service";
import {
  buildEventCalendarMonth,
  calendarWeekdayLabels,
  eventLocalDateKeys,
  shiftMonthKey,
} from "./event-calendar.model";

function event(
  id: string,
  start: string,
  end: string,
  timeZone = "Europe/Zurich",
): EventDiscoveryItem {
  return {
    id,
    slug: id,
    name: id,
    localityString: "Test locality",
    isSponsored: false,
    hasOrganization: false,
    hasVenueSpot: false,
    venueSpotCount: 0,
    startSeconds: Date.parse(start) / 1000,
    endSeconds: Date.parse(end) / 1000,
    timeZone,
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
  };
}

describe("event calendar model", () => {
  it("shifts months across year boundaries and renders leap day", () => {
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2027-01", -1)).toBe("2026-12");

    const month = buildEventCalendarMonth("2028-02", "de-CH", []);
    expect(month.days.some((day) => day.key === "2028-02-29")).toBe(true);
    expect(month.days).toHaveLength(35);
  });

  it("uses regional week starts", () => {
    const swiss = buildEventCalendarMonth("2026-08", "de-CH", []);
    const american = buildEventCalendarMonth("2026-08", "en-US", []);

    expect(swiss.weeks[0]?.days[0]?.key).toBe("2026-07-27");
    expect(american.weeks[0]?.days[0]?.key).toBe("2026-07-26");
    expect(calendarWeekdayLabels("en-US")[0]).toMatch(/Sun/u);
    expect(calendarWeekdayLabels("de-CH")[0]).toMatch(/Mo/u);
  });

  it("places events by venue-local date when UTC is on another day", () => {
    const lateNewYork = event(
      "new-york-night",
      "2026-03-01T00:30:00.000Z",
      "2026-03-01T02:00:00.000Z",
      "America/New_York",
    );

    expect(eventLocalDateKeys(lateNewYork)).toEqual(["2026-02-28"]);
    const month = buildEventCalendarMonth("2026-02", "en-US", [
      lateNewYork,
    ]);
    expect(
      month.days.find((day) => day.key === "2026-02-28")?.events,
    ).toContain(lateNewYork);
  });

  it("handles DST transitions and treats midnight endings as exclusive", () => {
    const zurichDstWeekend = event(
      "dst-weekend",
      "2026-03-28T09:00:00.000Z",
      "2026-03-29T22:00:00.000Z",
    );

    expect(eventLocalDateKeys(zurichDstWeekend)).toEqual([
      "2026-03-28",
      "2026-03-29",
    ]);
  });

  it("splits multi-day events at week boundaries with continuation flags", () => {
    const multiDay = event(
      "multi-day",
      "2026-01-30T09:00:00.000Z",
      "2026-02-10T17:00:00.000Z",
    );
    const month = buildEventCalendarMonth("2026-02", "de-CH", [multiDay]);
    const segments = month.weeks.flatMap((week) =>
      week.segments.filter((segment) => segment.id === multiDay.id),
    );

    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({
      startColumn: 5,
      span: 3,
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(segments[1]).toMatchObject({
      startColumn: 1,
      span: 7,
      continuesBefore: true,
      continuesAfter: true,
    });
    expect(segments[2]).toMatchObject({
      startColumn: 1,
      span: 2,
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it("allocates three visible lanes and reports per-day overflow", () => {
    const events = Array.from({ length: 4 }, (_, index) =>
      event(
        `event-${index}`,
        "2026-08-12T08:00:00.000Z",
        "2026-08-12T10:00:00.000Z",
      ),
    );
    const month = buildEventCalendarMonth("2026-08", "de-CH", events);
    const day = month.days.find((candidate) => candidate.key === "2026-08-12");
    const week = month.weeks.find((candidate) =>
      candidate.days.some((candidateDay) => candidateDay.key === day?.key),
    );

    expect(week?.segments).toHaveLength(3);
    expect(week?.segments.map((segment) => segment.lane)).toEqual([0, 1, 2]);
    expect(day?.hiddenEventCount).toBe(1);
  });

  it("adds a full 24-hour query buffer around the visible grid", () => {
    const month = buildEventCalendarMonth("2026-08", "de-CH", []);

    expect(month.queryStartSeconds).toBe(
      Math.floor(
        (Date.UTC(
          month.firstDay.getUTCFullYear(),
          month.firstDay.getUTCMonth(),
          month.firstDay.getUTCDate(),
        ) -
          86_400_000) /
          1000,
      ),
    );
    expect(month.queryEndSeconds).toBe(
      Math.ceil(
        (Date.UTC(
          month.lastDay.getUTCFullYear(),
          month.lastDay.getUTCMonth(),
          month.lastDay.getUTCDate(),
        ) +
          2 * 86_400_000) /
          1000,
      ),
    );
  });
});
