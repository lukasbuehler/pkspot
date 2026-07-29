import type { EventProgramItem } from "../../db/models/Event";
import type { LocalSpot, Spot } from "../../db/models/Spot";
import type {
  EventProgramItemStatus,
  EventProgramSpotRefSchema,
} from "../../db/schemas/EventSchema";
import { eventDateKey } from "../weather/event-weather";

export interface EventSpotBinding {
  ref: EventProgramSpotRefSchema;
  spot: Spot | LocalSpot;
}

export interface EventProgramOccurrence {
  key: string;
  item: EventProgramItem;
  ref: EventProgramSpotRefSchema;
  spot: Spot | LocalSpot;
  start: Date;
  end?: Date;
  status: EventProgramItemStatus;
  day: string;
  isActive: boolean;
  isNext: boolean;
}

export interface EventProgramSpotVisit {
  key: string;
  ref: EventProgramSpotRefSchema;
  spot: Spot | LocalSpot;
  occurrences: EventProgramOccurrence[];
  representative: EventProgramOccurrence;
}

export function eventProgramSpotRefKey(
  ref: EventProgramSpotRefSchema,
): string {
  return `${ref.kind}:${ref.id}`;
}

export function eventProgramSpotRefs(
  item: Pick<EventProgramItem, "spot_ref" | "spot_refs">,
): EventProgramSpotRefSchema[] {
  const source =
    item.spot_refs && item.spot_refs.length > 0
      ? item.spot_refs
      : item.spot_ref
        ? [item.spot_ref]
        : [];
  const seen = new Set<string>();

  return source.filter((ref) => {
    const key = eventProgramSpotRefKey(ref);
    if (!ref.id.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function effectiveProgramItem(item: EventProgramItem): {
  start: Date;
  end?: Date;
  status: EventProgramItemStatus;
} {
  return {
    start: item.runtimeOverride?.start ?? item.start,
    end: item.runtimeOverride?.end ?? item.end,
    status: item.runtimeOverride?.status ?? item.status ?? "scheduled",
  };
}

export function eventProgramDays(
  items: readonly EventProgramItem[],
  timeZone?: string,
): string[] {
  return [
    ...new Set(
      items
        .filter((item) => effectiveProgramItem(item).status !== "cancelled")
        .map((item) =>
          eventDateKey(effectiveProgramItem(item).start, timeZone),
        ),
    ),
  ].sort();
}

export function smartEventProgramDay(
  days: readonly string[],
  timeZone: string | undefined,
  now = new Date(),
): string {
  if (days.length === 0) return "";
  const today = eventDateKey(now, timeZone);
  if (days.includes(today)) return today;
  return days.find((day) => day > today) ?? days.at(-1) ?? "";
}

export function resolveEventProgramOccurrences(
  items: readonly EventProgramItem[],
  bindings: readonly EventSpotBinding[],
  timeZone: string | undefined,
  now = new Date(),
): EventProgramOccurrence[] {
  const bindingsByRef = new Map(
    bindings.map((binding) => [eventProgramSpotRefKey(binding.ref), binding]),
  );
  const resolved = items.flatMap((item) => {
    const effective = effectiveProgramItem(item);
    if (effective.status === "cancelled") return [];

    return eventProgramSpotRefs(item).flatMap((ref) => {
      const binding = bindingsByRef.get(eventProgramSpotRefKey(ref));
      if (!binding) return [];
      return [
        {
          key: `${item.id}:${eventProgramSpotRefKey(ref)}`,
          item,
          ref,
          spot: binding.spot,
          start: effective.start,
          end: effective.end,
          status: effective.status,
          day: eventDateKey(effective.start, timeZone),
          isActive:
            !!effective.end && effective.start <= now && now < effective.end,
          isNext: false,
        } satisfies EventProgramOccurrence,
      ];
    });
  });

  const nextStart = resolved
    .filter((occurrence) => occurrence.start > now)
    .sort((left, right) => left.start.getTime() - right.start.getTime())[0]
    ?.start.getTime();

  return resolved
    .map((occurrence) => ({
      ...occurrence,
      isNext:
        !occurrence.isActive &&
        nextStart !== undefined &&
        occurrence.start.getTime() === nextStart,
    }))
    .sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function eventProgramSpotVisits(
  occurrences: readonly EventProgramOccurrence[],
  day: string,
  now = new Date(),
): EventProgramSpotVisit[] {
  const inScope = day
    ? occurrences.filter((occurrence) => occurrence.day === day)
    : [...occurrences];
  const grouped = new Map<string, EventProgramOccurrence[]>();

  for (const occurrence of inScope) {
    const key = eventProgramSpotRefKey(occurrence.ref);
    grouped.set(key, [...(grouped.get(key) ?? []), occurrence]);
  }

  return [...grouped.entries()].map(([key, visits]) => {
    const sorted = visits.sort(
      (left, right) => left.start.getTime() - right.start.getTime(),
    );
    const representative =
      sorted.find((occurrence) => occurrence.isActive) ??
      sorted.find((occurrence) => occurrence.start > now) ??
      sorted[0];

    return {
      key,
      ref: representative.ref,
      spot: representative.spot,
      occurrences: sorted,
      representative,
    };
  });
}
