import {
  buildMapMarkerOptions,
  getMapMarkerCollisionBehavior,
  getMapMarkerPriority,
} from "./map-marker.model";
import type { MapMarkerSchema } from "./map-marker.model";

describe("map-marker.model", () => {
  beforeAll(() => {
    (globalThis as unknown as { google: typeof google }).google = {
      maps: {
        CollisionBehavior: {
          REQUIRED: "REQUIRED",
          OPTIONAL_AND_HIDES_LOWER_PRIORITY:
            "OPTIONAL_AND_HIDES_LOWER_PRIORITY",
        },
      },
    } as unknown as typeof google;
  });

  const marker = (
    markerOverrides: Partial<MapMarkerSchema> = {}
  ): MapMarkerSchema => ({
    location: { lat: 47.3769, lng: 8.5417 },
    ...markerOverrides,
  });

  it("uses explicit numeric priority before color defaults", () => {
    expect(
      getMapMarkerPriority(marker({ color: "secondary", priority: 42 }))
    ).toBe(42);
  });

  it("gives required markers the highest priority", () => {
    expect(getMapMarkerPriority(marker({ priority: "required" }))).toBe(
      10_000
    );
  });

  it("keeps amenity colors ordered below required markers", () => {
    expect(getMapMarkerPriority(marker({ color: "secondary" }))).toBe(500);
    expect(getMapMarkerPriority(marker({ color: "tertiary" }))).toBe(300);
    expect(getMapMarkerPriority(marker({ color: "primary" }))).toBe(100);
  });

  it("requires collision visibility for required or collision-ignoring markers", () => {
    expect(
      getMapMarkerCollisionBehavior(marker({ priority: "required" }))
    ).toBe(google.maps.CollisionBehavior.REQUIRED);
    expect(
      getMapMarkerCollisionBehavior(marker({ ignoreCollisions: true }))
    ).toBe(google.maps.CollisionBehavior.REQUIRED);
  });

  it("builds advanced marker options from marker metadata", () => {
    expect(buildMapMarkerOptions(marker({ priority: 700 }))).toEqual({
      gmpClickable: true,
      collisionBehavior:
        google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY,
      zIndex: 700,
    });
  });
});
