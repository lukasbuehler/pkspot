import { describe, expect, it } from "vitest";
import { getNextEventPromoDismissal } from "./map-event-promo-dismissal";

describe("getNextEventPromoDismissal", () => {
  const now = new Date("2026-07-11T10:00:00.000Z");
  const eventEnd = new Date("2026-08-10T18:00:00.000Z");

  it("hides the first dismissal for one day", () => {
    expect(getNextEventPromoDismissal(undefined, eventEnd, now)).toEqual({
      showAgainAt: "2026-07-12T10:00:00.000Z",
      dismissCount: 1,
      stage: "one-day",
    });
  });

  it("hides the second dismissal for seven days", () => {
    expect(
      getNextEventPromoDismissal(
        { showAgainAt: now.toISOString(), dismissCount: 1 },
        eventEnd,
        now,
      ),
    ).toEqual({
      showAgainAt: "2026-07-18T10:00:00.000Z",
      dismissCount: 2,
      stage: "seven-days",
    });
  });

  it("hides the third and later dismissals until the event ends", () => {
    const previous = { showAgainAt: now.toISOString(), dismissCount: 2 };

    expect(getNextEventPromoDismissal(previous, eventEnd, now)).toEqual({
      showAgainAt: eventEnd.toISOString(),
      dismissCount: 3,
      stage: "event-end",
    });
    expect(
      getNextEventPromoDismissal(
        { showAgainAt: eventEnd.toISOString(), dismissCount: 8 },
        eventEnd,
        now,
      ).showAgainAt,
    ).toBe(eventEnd.toISOString());
  });
});
