import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { EventLiveUpdate } from "./EventLiveUpdate";
import {
  EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH,
  EVENT_LIVE_UPDATE_TITLE_MAX_LENGTH,
  EVENT_LIVE_UPDATE_TYPES,
} from "../schemas/EventLiveUpdateSchema";

describe("EventLiveUpdate", () => {
  it("maps the Firestore event live update contract", () => {
    const publishedAt = Timestamp.fromDate(new Date("2026-07-21T12:00:00Z"));
    const update = new EventLiveUpdate("update-1", {
      event_id: "event-1",
      type: "location_spot_change",
      title: "Meet at the west entrance",
      message: "The main entrance is closed.",
      event_spot_id: "west-entrance",
      scheduled_for: publishedAt,
      status: "published",
      created_at: publishedAt,
      created_by: "organizer-1",
      published_at: publishedAt,
    });

    expect(update.id).toBe("update-1");
    expect(update.eventId).toBe("event-1");
    expect(update.type).toBe("location_spot_change");
    expect(update.publishedAt.toISOString()).toBe("2026-07-21T12:00:00.000Z");
    expect(update.eventSpotId).toBe("west-entrance");
  });

  it("keeps the controlled MVP types and copy limits stable", () => {
    expect(EVENT_LIVE_UPDATE_TYPES).toEqual([
      "event_cancelled",
      "event_restored",
      "event_rescheduled",
      "program_item_update",
      "program_plan_activated",
      "meet_up_time",
      "location_spot_change",
      "schedule_change",
      "weather_update",
      "session_starting_soon",
      "general_update",
    ]);
    expect(EVENT_LIVE_UPDATE_TITLE_MAX_LENGTH).toBe(80);
    expect(EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH).toBe(280);
  });
});
