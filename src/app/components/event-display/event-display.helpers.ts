import { Event as PkEvent } from "../../../db/models/Event";
import {
  AnyMedia,
  ExternalImage,
  ExternalVideo,
} from "../../../db/models/Media";
import { MediaType } from "../../../db/models/Interfaces";
import { MediaSchema } from "../../../db/schemas/Media";

export type EventStatus = "upcoming" | "live" | "past";

export function eventMediaFromSchema(media: MediaSchema): AnyMedia {
  return media.type === MediaType.Video
    ? new ExternalVideo(
        media.src,
        media.uid,
        media.attribution,
        media.origin,
        media.isReported,
      )
    : new ExternalImage(
        media.src,
        media.uid,
        media.attribution,
        media.origin,
        media.isReported,
      );
}

export function eventHeroMedia(event: PkEvent): AnyMedia[] {
  const media = [
    ...(event.bannerSrc ? [new ExternalImage(event.bannerSrc)] : []),
    ...event.media.map(eventMediaFromSchema),
    ...event.inlineSpots
      .flatMap((spot) => spot.images ?? [])
      .map((src) => new ExternalImage(src)),
  ];
  const seen = new Set<string>();
  return media.filter((item) => {
    if (seen.has(item.baseSrc)) return false;
    seen.add(item.baseSrc);
    return true;
  });
}

export function eventVenueLine(event: PkEvent): string {
  return [event.venueString, event.localityString].filter(Boolean).join(", ");
}

export function relativeFromNow(target: Date, locale: string): string {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) {
    return $localize`:@@events.now_or_past:now`;
  }

  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "always",
  });

  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 48) {
    return hours >= 2
      ? formatter.format(hours, "hour")
      : formatter.format(1, "hour");
  }

  const days = Math.max(1, Math.round(diffMs / 86_400_000));
  if (days < 14) {
    return formatter.format(days, "day");
  }

  const weeks = Math.round(days / 7);
  if (weeks < 8) {
    return formatter.format(weeks, "week");
  }

  const months = Math.round(days / 30);
  return formatter.format(months, "month");
}

export function eventStatusLabel(
  event: PkEvent,
  status: EventStatus,
  locale: string,
): string {
  if (status === "past") {
    return $localize`:@@events.status.past:Past event`;
  }

  const target = status === "live" ? event.end : event.start;
  const relative = relativeFromNow(target, locale);
  if (status === "live") {
    return $localize`:@@events.status.live_with_end:Ongoing — ends ${relative}`;
  }
  return $localize`:@@events.status.upcoming_starts:Starts ${relative}`;
}
