import { describe, expect, it } from "vitest";
import { Event } from "./Event";
import { EventId, EventSchema } from "../schemas/EventSchema";

const baseEvent = {
  name: "Test Event",
  venue_string: "Test Venue",
  locality_string: "Test City",
  spot_ids: [],
  bounds: {
    north: 47,
    south: 46,
    east: 8,
    west: 7,
  },
} satisfies Partial<EventSchema>;

describe("Event", () => {
  it("parses Firestore timestamp-like dates with string seconds", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: { seconds: "1781431200", nanoseconds: "0" },
      end: { seconds: "1781517600", nanoseconds: "0" },
    } as EventSchema);

    expect(event.start.toISOString()).toBe("2026-06-14T10:00:00.000Z");
    expect(event.end.toISOString()).toBe("2026-06-15T10:00:00.000Z");
    expect(Number.isFinite(event.start.getTime())).toBe(true);
    expect(Number.isFinite(event.end.getTime())).toBe(true);
  });

  it("parses admin SDK timestamp-like dates", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: { _seconds: 1781431200, _nanoseconds: 123_000_000 },
      end: { _seconds: 1781517600, _nanoseconds: 0 },
    } as EventSchema);

    expect(event.start.toISOString()).toBe("2026-06-14T10:00:00.123Z");
    expect(event.end.toISOString()).toBe("2026-06-15T10:00:00.000Z");
  });
});
