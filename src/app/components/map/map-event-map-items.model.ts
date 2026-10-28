import { Event as PkEvent } from "../../../db/models/Event";
import {
  MapBoundsOverlay,
  MapPointMarker,
  MapPolygonOverlay,
} from "../maps/map-overlays";
import { MapObjectMode } from "./map-object-mode.model";
import { getMapEventMarkerPriority } from "../map-page/map-island-event-ranking";
import { eventImageDisplaySrc } from "../event-display/event-display.helpers";

const eventBoundsColorFallback = "rgb(184 196 255)";
const eventAreaColorFallback = "rgb(0 54 186)";
const eventMarkerBackgroundFallback = "var(--mat-sys-primary-container)";

export interface EventMapMarker extends MapPointMarker {
  previewEvent?: PkEvent;
}

export interface VisibleEventMarkerParams {
  visibleEvents: readonly PkEvent[];
  selectedEvent: PkEvent | null;
  pendingEventRef: string | null;
  mode: MapObjectMode;
  now: Date;
  /**
   * Keys of the open community (including communities merged into it). When
   * set, only events listed under one of them, or inside `communityArea`,
   * get pins.
   */
  communityKeys?: readonly string[] | null;
  /**
   * The open community's area. Events are not always tagged with every
   * community they lie in, so an event inside the drawn community circle keeps
   * its pin even without a matching key.
   */
  communityArea?: { center: { lat: number; lng: number }; radiusM: number } | null;
}

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function buildVisibleEventMarkers({
  visibleEvents,
  selectedEvent,
  pendingEventRef,
  mode,
  now,
  communityKeys,
  communityArea,
}: VisibleEventMarkerParams): EventMapMarker[] {
  const selectedEventId = selectedEvent?.id ?? null;
  const community = communityKeys?.length ? new Set(communityKeys) : null;

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
      if (
        community &&
        !event.communityKeys.some((key) => community.has(key)) &&
        !(
          communityArea &&
          event.location &&
          distanceMeters(event.location, communityArea.center) <= communityArea.radiusM
        )
      ) {
        return false;
      }
      return Boolean(event.location);
    })
    .flatMap((event): EventMapMarker[] => {
      const location = event.location;
      if (!location) return [];
      const routeId = event.slug ?? event.id;
      const status = event.status(now);
      const description = [event.venueString, event.localityLabel]
        .filter(Boolean)
        .join(", ");
      return [
        {
          id: `event:${routeId}`,
          name: event.name,
          description,
          location,
          icons: [status === "live" ? "stars" : "event"],
          imageSrc: eventImageDisplaySrc(event.effectiveBadgeLogoSrc()),
          imageFit: event.effectiveBadgeLogoFit(),
          imageBackgroundColor:
            event.effectiveBadgeLogoBackgroundColor() ??
            eventMarkerBackgroundFallback,
          color: status === "live" ? "secondary" : "primary",
          type: "event",
          forceFullMarker: true,
          priority: getMapEventMarkerPriority(event, now),
          previewEvent: event,
        },
      ];
    });

  const selectedEventMarkers =
    selectedEvent && !selectedEvent.isPast(now)
      ? selectedEvent.customMarkers.map(
          (marker, index): EventMapMarker => ({
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
