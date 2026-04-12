import { describe, expect, it } from "vitest";
import { resolveInitialMapViewport } from "./spot-map-initial-viewport";

const fallbackPreset = {
  center: { lat: 48.6270939, lng: 2.4305363 },
  zoom: 4,
};

describe("resolveInitialMapViewport", () => {
  it("should prefer the selected spot over every other input", () => {
    const viewport = resolveInitialMapViewport({
      selectedSpotLocation: { lat: 1, lng: 2 },
      centerStart: { lat: 3, lng: 4 },
      boundsCenter: { lat: 5, lng: 6 },
      lastLocationAndZoom: {
        location: { lat: 7, lng: 8 },
        zoom: 9,
      },
      fallbackPreset,
      focusZoom: 15,
    });

    expect(viewport).toEqual({
      center: { lat: 1, lng: 2 },
      zoom: 15,
      source: "selected-spot",
    });
  });

  it("should prefer an explicit center start over bounds, saved location, and fallback", () => {
    const viewport = resolveInitialMapViewport({
      centerStart: { lat: 3, lng: 4 },
      boundsCenter: { lat: 5, lng: 6 },
      lastLocationAndZoom: {
        location: { lat: 7, lng: 8 },
        zoom: 9,
      },
      fallbackPreset,
      focusZoom: 12,
    });

    expect(viewport).toEqual({
      center: { lat: 3, lng: 4 },
      zoom: 12,
      source: "center-start",
    });
  });

  it("should prefer bounds over saved location and fallback", () => {
    const viewport = resolveInitialMapViewport({
      boundsCenter: { lat: 5, lng: 6 },
      lastLocationAndZoom: {
        location: { lat: 7, lng: 8 },
        zoom: 9,
      },
      fallbackPreset,
      focusZoom: 10,
    });

    expect(viewport).toEqual({
      center: { lat: 5, lng: 6 },
      zoom: 10,
      source: "bounds",
    });
  });

  it("should restore the saved map position before using the regional fallback", () => {
    const viewport = resolveInitialMapViewport({
      lastLocationAndZoom: {
        location: { lat: 7, lng: 8 },
        zoom: 9,
      },
      fallbackPreset: {
        center: { lat: 40, lng: -100 },
        zoom: 4,
      },
      focusZoom: 10,
    });

    expect(viewport).toEqual({
      center: { lat: 7, lng: 8 },
      zoom: 9,
      source: "last-location",
    });
  });

  it("should use the fallback preset for a first-time consented visitor", () => {
    const viewport = resolveInitialMapViewport({
      fallbackPreset: {
        center: { lat: 39.8283, lng: -98.5795 },
        zoom: 4,
      },
      focusZoom: 10,
    });

    expect(viewport).toEqual({
      center: { lat: 39.8283, lng: -98.5795 },
      zoom: 4,
      source: "fallback",
    });
  });
});
