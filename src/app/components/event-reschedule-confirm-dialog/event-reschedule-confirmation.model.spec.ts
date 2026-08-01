import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { Event } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { eventRescheduleConfirmation } from "./event-reschedule-confirmation.model";

function buildEvent(published = true): Event {
  return new Event("event-1" as EventId, {
    name: "City Jam",
    published,
    start: Timestamp.fromDate(new Date("2099-08-10T10:00:00Z")),
    end: Timestamp.fromDate(new Date("2099-08-10T18:00:00Z")),
  } as EventSchema);
}

describe("eventRescheduleConfirmation", () => {
  it("returns confirmation data only when a published event time changes", () => {
    const changed = eventRescheduleConfirmation(buildEvent(), {
      start: Timestamp.fromDate(new Date("2099-08-10T11:00:00Z")),
      end: Timestamp.fromDate(new Date("2099-08-10T19:00:00Z")),
    });

    expect(changed).toEqual({
      previousStart: new Date("2099-08-10T10:00:00Z"),
      previousEnd: new Date("2099-08-10T18:00:00Z"),
      nextStart: new Date("2099-08-10T11:00:00Z"),
      nextEnd: new Date("2099-08-10T19:00:00Z"),
    });
    expect(eventRescheduleConfirmation(buildEvent(), {
      start: Timestamp.fromDate(new Date("2099-08-10T10:00:00Z")),
      end: Timestamp.fromDate(new Date("2099-08-10T18:00:00Z")),
    })).toBeNull();
    expect(eventRescheduleConfirmation(buildEvent(false), {
      start: Timestamp.fromDate(new Date("2099-08-10T11:00:00Z")),
      end: Timestamp.fromDate(new Date("2099-08-10T19:00:00Z")),
    })).toBeNull();
  });
});
