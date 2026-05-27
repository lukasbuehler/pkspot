import { Event as PkEvent } from "../../../db/models/Event";
import {
  MapBoundsOverlay,
  MapPointMarker,
  MapPolygonOverlay,
} from "../maps/map-overlays";
import { MapObjectMode } from "./map-object-mode.model";
import { getMapEventMarkerPriority } from "../map-page/map-island-event-ranking";

const eventBoundsColorFallback = "rgb(184 196 255)";
const eventAreaColorFallback = "rgb(0 54 186)";

export interface VisibleEventMarkerParams {
  visibleEvents: readonly PkEvent[];
  selectedEvent: PkEvent | null;
  pendingEventRef: string | null;
  mode: MapObjectMode;
  now: Date;
}

export function buildVisibleEventMarkers({
  visibleEvents,
  selectedEvent,
  pendingEventRef,
  mode,
  now,
}: VisibleEventMarkerParams): MapPointMarker[] {
  const selectedEventId = selectedEvent?.id ?? null;

  const eventMarkers = visibleEvents
    .filter((event) => {
      if (selectedEventId && event.id === selectedEventId) return false;
      if (
        pendingEventRef &&
        (event.id === pendingEventRef || event.slug === pendingEventRef)
      ) {
        return false;
      }
      if (event.isPast(now)) return false;
      return Boolean(event.location);
    })
    .map((event): MapPointMarker => {
      const routeId = event.slug ?? event.id;
      const status = event.status(now);
      return {
        id: `event:${routeId}`,
        name: event.name,
        location: event.location,
        icons: [status === "live" ? "stars" : "event"],
        imageSrc: event.effectiveBadgeLogoSrc(),
        imageBackgroundColor: event.effectiveBadgeLogoBackgroundColor(),
        color: status === "live" ? "secondary" : "primary",
        type: "event",
        forceFullMarker: true,
        priority: getMapEventMarkerPriority(event, now),
      };
    });

  const selectedEventMarkers =
    selectedEvent && !selectedEvent.isPast(now)
      ? selectedEvent.customMarkers.map(
          (marker, index): MapPointMarker => ({
            id: `event-custom:${selectedEvent.id}:${index}`,
            name: marker.name,
            location: marker.location,
            icons: marker.icons,
            color: marker.color,
            type: "event-custom",
            forceFullMarker: marker.priority === "required",
            priority:
              marker.priority === "required"
                ? 90_000
                : typeof marker.priority === "number"
                  ? 70_000 + marker.priority
                  : 70_000,
          }),
        )
      : [];

  if (mode !== "all" && mode !== "events") {
    return selectedEventMarkers;
  }

  return [...eventMarkers, ...selectedEventMarkers];
}

export function buildSelectedEventBoundsOverlays(
  event: PkEvent | null,
  resolveCssColor: (cssVarName: string, fallback: string) => string,
): MapBoundsOverlay[] {
  if (!event?.bounds || event.areaPolygon) return [];

  const color = resolveCssColor(
    "--mat-sys-primary-container",
    eventBoundsColorFallback,
  );

  return [
    {
      id: `event-bounds:${event.id}`,
      bounds: event.bounds,
      options: {
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.08,
        clickable: false,
        zIndex: 2,
      },
    },
  ];
}

export function buildSelectedEventPolygonOverlays(
  event: PkEvent | null,
  resolveCssColor: (cssVarName: string, fallback: string) => string,
): MapPolygonOverlay[] {
  if (!event?.areaPolygon) return [];

  const previewRing = getEventAreaPreviewRing(event.areaPolygon);
  if (previewRing.length < 3) return [];

  const color = resolveCssColor("--mat-sys-primary", eventAreaColorFallback);

  return [
    {
      id: `event-area:${event.id}`,
      paths: previewRing,
      options: {
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 3,
        fillColor: color,
        fillOpacity: 0.08,
        clickable: false,
        zIndex: 2,
      },
    },
  ];
}

export function getEventAreaPreviewRing(
  rings: Array<{ points: google.maps.LatLngLiteral[] }>,
): google.maps.LatLngLiteral[] {
  return (
    rings.find((ring) =>
      ring.points.every((point) => Math.abs(point.lat) < 85),
    )?.points ??
    rings[0]?.points ??
    []
  );
}
