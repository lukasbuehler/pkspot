import { describe, expect, it } from "vitest";
import { eventTimeZoneAt } from "../functions/src/event-time-zone";

describe("event time-zone derivation", () => {
  it("resolves Zurich coordinates to the venue's IANA time zone", () => {
    expect(eventTimeZoneAt({ lat: 47.3769, lng: 8.5417 })).toBe(
      "Europe/Zurich",
    );
  });

  it("returns only identifiers accepted by Intl", () => {
    const timeZone = eventTimeZoneAt({ lat: 40.7128, lng: -74.006 });

    expect(() =>
      new Intl.DateTimeFormat("en", { timeZone }).format(new Date()),
    ).not.toThrow();
  });
});
