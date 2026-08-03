import { Timestamp } from "firebase/firestore";
import type { Event as PkEvent } from "../../../db/models/Event";
import type { EventSchema } from "../../../db/schemas/EventSchema";

export interface EventRescheduleConfirmationData {
  previousStart: Date;
  previousEnd: Date;
  nextStart: Date;
  nextEnd: Date;
}

type EventTimingPatch = Pick<Partial<EventSchema>, "start" | "end">;

export function eventRescheduleConfirmation(
  event: PkEvent | null,
  patch: EventTimingPatch,
): EventRescheduleConfirmationData | null {
  if (!event?.published) return null;
  const nextStart = toDate(patch.start);
  const nextEnd = toDate(patch.end);
  if (!nextStart || !nextEnd) return null;
  if (
    nextStart.getTime() === event.start.getTime() &&
    nextEnd.getTime() === event.end.getTime()
  ) return null;
  return {
    previousStart: event.start,
    previousEnd: event.end,
    nextStart,
    nextEnd,
  };
}

function toDate(value: EventSchema["start"] | undefined): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}
