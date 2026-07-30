import type { EventProgramItem } from "../../db/models/Event";
import type { MapMarkerColor } from "../components/map/markers/map-marker.model";
import {
  isEventProgramMarkerOccurrence,
  isEventProgramSpotOccurrence,
  resolveEventProgramOccurrences,
  type EventProgramLocationBinding,
  type EventProgramLocationVisit,
  type EventProgramOccurrence,
  type EventMarkerBinding,
  type EventSpotBinding,
} from "./event-program-spots";

export function eventProgramLocationColor(
  visit: EventProgramLocationVisit,
): MapMarkerColor {
  return visit.kind === "custom_marker" && visit.marker.color
    ? visit.marker.color
    : visit.representative.isActive
      ? "secondary"
      : "primary";
}

export interface EventProgramTimelineSpot {
  binding: EventSpotBinding;
  occurrence: EventProgramOccurrence;
}

export interface EventProgramTimelineMarker {
  binding: EventMarkerBinding;
  occurrence: EventProgramOccurrence;
}

export interface EventProgramTimelineLocations {
  spots: readonly EventProgramTimelineSpot[];
  markers: readonly EventProgramTimelineMarker[];
}

/**
 * Resolves the location previews used by every program timeline surface.
 * Supplied occurrences win over locally resolved ones so map-owned live state
 * and selection identity remain intact.
 */
export function eventProgramTimelineLocationsByItem(
  items: readonly EventProgramItem[],
  bindings: readonly EventProgramLocationBinding[],
  occurrences: readonly EventProgramOccurrence[],
  timeZone: string | undefined,
  now: Date,
): ReadonlyMap<string, EventProgramTimelineLocations> {
  const mergedOccurrences = new Map(
    [
      ...resolveEventProgramOccurrences(items, bindings, timeZone, now),
      ...occurrences,
    ].map((occurrence) => [occurrence.key, occurrence]),
  );
  const grouped = new Map<
    string,
    {
      spots: EventProgramTimelineSpot[];
      markers: EventProgramTimelineMarker[];
    }
  >();

  for (const occurrence of mergedOccurrences.values()) {
    const locations = grouped.get(occurrence.item.id) ?? {
      spots: [],
      markers: [],
    };

    if (isEventProgramMarkerOccurrence(occurrence)) {
      locations.markers.push({
        binding: {
          ref: occurrence.ref,
          marker: occurrence.marker,
        },
        occurrence,
      });
    } else if (isEventProgramSpotOccurrence(occurrence)) {
      locations.spots.push({
        binding: {
          ref: occurrence.ref,
          spot: occurrence.spot,
        },
        occurrence,
      });
    }

    grouped.set(occurrence.item.id, locations);
  }

  return grouped;
}
