import type { EventLiveUpdateSchema, EventLiveUpdateType } from "../schemas/EventLiveUpdateSchema";

type TimestampLike = EventLiveUpdateSchema["created_at"];

const toDate = (value: TimestampLike): Date => {
  const candidate = value as unknown as {
    toDate?: () => Date;
    seconds?: number;
  };
  if (typeof candidate.toDate === "function") return candidate.toDate();
  if (typeof candidate.seconds === "number") {
    return new Date(candidate.seconds * 1_000);
  }
  return new Date(value as unknown as string);
};

export class EventLiveUpdate {
  readonly eventId: string;
  readonly type: EventLiveUpdateType;
  readonly title: string;
  readonly message?: string;
  readonly scheduledFor?: Date;
  readonly eventSpotId?: string;
  readonly status: "published";
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly publishedAt: Date;

  constructor(readonly id: string, data: EventLiveUpdateSchema) {
    this.eventId = data.event_id;
    this.type = data.type;
    this.title = data.title;
    this.message = data.message;
    this.scheduledFor = data.scheduled_for
      ? toDate(data.scheduled_for)
      : undefined;
    this.eventSpotId = data.event_spot_id;
    this.status = data.status;
    this.createdAt = toDate(data.created_at);
    this.createdBy = data.created_by;
    this.publishedAt = toDate(data.published_at);
  }
}
