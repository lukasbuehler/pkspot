import type { EventProgramItem } from "../../db/models/Event";
import type { LocalSpot, Spot } from "../../db/models/Spot";
import type {
  EventProgramItemStatus,
  EventProgramSpotRefSchema,
} from "../../db/schemas/EventSchema";
import type { MarkerSchema } from "../components/map/markers/map-marker.model";
import { eventDateKey } from "../weather/event-weather";

export type EventProgramStoredSpotRef = EventProgramSpotRefSchema & {
  kind: "spot" | "inline_spot";
};

export type EventProgramMarkerRef = EventProgramSpotRefSchema & {
  kind: "custom_marker";
};

export interface EventSpotBinding {
  ref: EventProgramStoredSpotRef;
  spot: Spot | LocalSpot;
}

export interface EventMarkerBinding {
  ref: EventProgramMarkerRef;
  marker: MarkerSchema;
}

export type EventProgramLocationBinding = EventSpotBinding | EventMarkerBinding;

export function isEventProgramMarkerRef(
  ref: EventProgramSpotRefSchema,
): ref is EventProgramMarkerRef {
  return ref.kind === "custom_marker";
}

function isEventProgramMarkerBinding(
  binding: EventProgramLocationBinding,
): binding is EventMarkerBinding {
  return binding.ref.kind === "custom_marker";
}

interface EventProgramOccurrenceBase {
  key: string;
  item: EventProgramItem;
  start: Date;
  end?: Date;
  status: EventProgramItemStatus;
  day: string;
  isActive: boolean;
  isNext: boolean;
}

export interface EventProgramSpotOccurrence
  extends EventProgramOccurrenceBase {
  kind: "spot";
  ref: EventProgramStoredSpotRef;
  spot: Spot | LocalSpot;
}

export interface EventProgramMarkerOccurrence
  extends EventProgramOccurrenceBase {
  kind: "custom_marker";
  ref: EventProgramMarkerRef;
  marker: MarkerSchema;
}

export type EventProgramOccurrence =
  | EventProgramSpotOccurrence
  | EventProgramMarkerOccurrence;

export interface EventProgramSpotVisit {
  key: string;
  kind: "spot";
  ref: EventProgramStoredSpotRef;
  spot: Spot | LocalSpot;
  occurrences: EventProgramSpotOccurrence[];
  representative: EventProgramSpotOccurrence;
}

export interface EventProgramMarkerVisit {
  key: string;
  kind: "custom_marker";
  ref: EventProgramMarkerRef;
  marker: MarkerSchema;
  occurrences: EventProgramMarkerOccurrence[];
  representative: EventProgramMarkerOccurrence;
}

export type EventProgramLocationVisit =
  | EventProgramSpotVisit
  | EventProgramMarkerVisit;

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
  bindings: readonly EventProgramLocationBinding[],
  timeZone: string | undefined,
  now = new Date(),
): EventProgramOccurrence[] {
  const bindingsByRef = new Map(
    bindings.map((binding) => [eventProgramSpotRefKey(binding.ref), binding]),
  );
  const resolved = items.flatMap<EventProgramOccurrence>((item) => {
    const effective = effectiveProgramItem(item);
    if (effective.status === "cancelled") return [];

    return eventProgramSpotRefs(item).flatMap<EventProgramOccurrence>((ref) => {
      const binding = bindingsByRef.get(eventProgramSpotRefKey(ref));
      if (!binding) return [];
      const occurrence = {
        key: `${item.id}:${eventProgramSpotRefKey(ref)}`,
        item,
        start: effective.start,
        end: effective.end,
        status: effective.status,
        day: eventDateKey(effective.start, timeZone),
        isActive:
          !!effective.end && effective.start <= now && now < effective.end,
        isNext: false,
      } satisfies EventProgramOccurrenceBase;

      if (isEventProgramMarkerBinding(binding)) {
        return [
          {
            ...occurrence,
            kind: "custom_marker",
            ref: binding.ref,
            marker: binding.marker,
          },
        ];
      }

      return [
        {
          ...occurrence,
          kind: "spot",
          ref: binding.ref,
          spot: binding.spot,
        },
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

export function eventProgramLocationVisits(
  occurrences: readonly EventProgramOccurrence[],
  day: string,
  now = new Date(),
): EventProgramLocationVisit[] {
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

    if (isEventProgramMarkerOccurrence(representative)) {
      const markerVisits = sorted.filter(isEventProgramMarkerOccurrence);
      return {
        key,
        kind: "custom_marker",
        ref: representative.ref,
        marker: representative.marker,
        occurrences: markerVisits,
        representative,
      };
    }

    const spotVisits = sorted.filter(isEventProgramSpotOccurrence);
    return {
      key,
      kind: "spot",
      ref: representative.ref,
      spot: representative.spot,
      occurrences: spotVisits,
      representative,
    };
  });
}

export function eventProgramSpotVisits(
  occurrences: readonly EventProgramOccurrence[],
  day: string,
  now = new Date(),
): EventProgramSpotVisit[] {
  return eventProgramLocationVisits(
    occurrences.filter(isEventProgramSpotOccurrence),
    day,
    now,
  ).filter(isEventProgramSpotVisit);
}

export function isEventProgramSpotOccurrence(
  occurrence: EventProgramOccurrence,
): occurrence is EventProgramSpotOccurrence {
  return occurrence.kind === "spot";
}

export function isEventProgramMarkerOccurrence(
  occurrence: EventProgramOccurrence,
): occurrence is EventProgramMarkerOccurrence {
  return occurrence.kind === "custom_marker";
}

function isEventProgramSpotVisit(
  visit: EventProgramLocationVisit,
): visit is EventProgramSpotVisit {
  return visit.kind === "spot";
}
