import { describe, expect, it } from "vitest";
import { eventRescheduleTimingChange } from "../functions/src/eventRescheduleNotificationCopy";

describe("event reschedule notification copy", () => {
  it("formats a same-day start change in the event time zone", () => {
    const previous = Date.parse("2026-08-08T08:45:00Z");
    const next = Date.parse("2026-08-08T09:00:00Z");

    expect(eventRescheduleTimingChange({
      live_update_type: "event_rescheduled",
      previous_start_ms: String(previous),
      next_start_ms: String(next),
      time_zone: "Europe/Zurich",
    }, "de-CH")).toMatch(/10:45.*→.*11:00.*\+15 min/);
  });

  it("falls back to an end-only change and rejects unrelated updates", () => {
    const previous = Date.parse("2026-08-08T16:00:00Z");
    const next = Date.parse("2026-08-08T17:00:00Z");
    expect(eventRescheduleTimingChange({
      live_update_type: "event_rescheduled",
      previous_end_ms: String(previous),
      next_end_ms: String(next),
    }, "en")).toContain("→");
    expect(eventRescheduleTimingChange({
      live_update_type: "weather_update",
    }, "en")).toBeNull();
  });
});
