import { describe, expect, it } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import {
  buildSelectedEventBoundsOverlays,
  buildSelectedEventPolygonOverlays,
  buildVisibleEventMarkers,
  getEventAreaPreviewRing,
} from "./map-event-map-items.model";

function eventStub(
  overrides: Partial<PkEvent> & { id: string },
): PkEvent {
  return {
    slug: overrides.id,
    name: overrides.id,
    location: { lat: 47, lng: 8 },
    customMarkers: [],
    isPast: () => false,
    isLive: () => false,
    isUpcoming: () => true,
    start: new Date("2026-06-01T10:00:00Z"),
    status: () => "upcoming",
    effectiveBadgeLogoSrc: () => undefined,
    effectiveBadgeLogoBackgroundColor: () => undefined,
    ...overrides,
  } as PkEvent;
}

describe("map event map items", () => {
  const now = new Date("2026-05-27T10:00:00Z");

  it("builds event markers without duplicating the open event", () => {
    const selectedEvent = eventStub({
      id: "event-1",
      customMarkers: [
        {
          name: "Stage",
          location: { lat: 47.1, lng: 8.1 },
          icons: ["flag"],
          priority: "required",
        },
      ],
    });

    const markers = buildVisibleEventMarkers({
      visibleEvents: [
        selectedEvent,
        eventStub({ id: "event-2", status: () => "live" }),
        eventStub({ id: "event-3", isPast: () => true }),
      ],
      selectedEvent,
      pendingEventRef: null,
      mode: "events",
      now,
    });

    expect(markers.map((marker) => marker.id)).toEqual([
      "event:event-2",
      "event-custom:event-1:0",
    ]);
    expect(markers[0].color).toBe("secondary");
  });

  it("keeps selected event custom markers visible outside event mode", () => {
    const markers = buildVisibleEventMarkers({
      visibleEvents: [eventStub({ id: "event-2" })],
      selectedEvent: eventStub({
        id: "event-1",
        customMarkers: [
          {
            name: "Meetup",
            location: { lat: 47.1, lng: 8.1 },
            icons: ["groups"],
          },
        ],
      }),
      pendingEventRef: null,
      mode: "spots",
      now,
    });

    expect(markers.map((marker) => marker.id)).toEqual([
      "event-custom:event-1:0",
    ]);
  });

  it("builds area overlays from event bounds or polygon data", () => {
    const resolveColor = () => "rgb(1 2 3)";
    const boundsEvent = eventStub({
      id: "event-1",
      bounds: {} as google.maps.LatLngBoundsLiteral,
    });
    const polygonEvent = eventStub({
      id: "event-2",
      areaPolygon: [
        {
          points: [
            { lat: 47, lng: 8 },
            { lat: 47.1, lng: 8 },
            { lat: 47, lng: 8.1 },
          ],
        },
      ],
    });

    expect(buildSelectedEventBoundsOverlays(boundsEvent, resolveColor)).toHaveLength(1);
    expect(buildSelectedEventPolygonOverlays(polygonEvent, resolveColor)).toHaveLength(1);
  });

  it("prefers the first non-polar event area ring", () => {
    const fallback = [{ lat: 89, lng: 8 }];
    const usable = [
      { lat: 47, lng: 8 },
      { lat: 47.1, lng: 8 },
      { lat: 47, lng: 8.1 },
    ];

    expect(
      getEventAreaPreviewRing([
        { points: fallback },
        { points: usable },
      ]),
    ).toBe(usable);
  });
});
