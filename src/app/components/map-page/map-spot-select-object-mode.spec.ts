import { signal } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import type { MapObjectMode } from "../map/map-object-mode.model";
import { MapPageComponent } from "./map-page.component";

describe("selecting a Spot with a map object filter", () => {
  function pageWith(mode: MapObjectMode) {
    const page = {
      mapObjectMode: signal<MapObjectMode>(mode),
      mapObjectModeChanged: vi.fn((next: MapObjectMode) => page.mapObjectMode.set(next)),
      selectedSpot: signal<unknown>(null),
      selectedEvent: signal<unknown>(null),
      pendingEventPreview: signal<unknown>(null),
      selectedCommunityLanding: signal<unknown>(null),
      pendingCommunityLanding: signal<unknown>(null),
      selectedPoi: signal<unknown>(null),
      pendingSpotPreview: signal<unknown>(null),
      _spotLoadRequestVersion: 0,
      _getSelectedSpotKey: (spot: { id?: string } | null) => spot?.id ?? null,
      closeChallenge: vi.fn(),
      resetPanelContentToTop: vi.fn(),
      _openInfoPanel: vi.fn(),
      _analytics: { trackEvent: vi.fn() },
      _debugMapEvent: vi.fn(),
      spotMap: { focusSpot: vi.fn() },
      updateMapURL: vi.fn(),
    };
    return page;
  }

  // A loaded Spot is recognised by its `clone` method.
  const spot = { id: "spot-1", clone: () => spot };

  it.each<MapObjectMode>(["events", "communities"])("leaves the %s filter for All", (mode) => {
    const page = pageWith(mode);
    MapPageComponent.prototype.selectSpot.call(page as unknown as MapPageComponent, spot as never, false);
    expect(page.mapObjectModeChanged).toHaveBeenCalledWith("all");
    expect(page.mapObjectMode()).toBe("all");
  });

  it.each<MapObjectMode>(["spots", "all"])("keeps the %s filter", (mode) => {
    const page = pageWith(mode);
    MapPageComponent.prototype.selectSpot.call(page as unknown as MapPageComponent, spot as never, false);
    expect(page.mapObjectModeChanged).not.toHaveBeenCalled();
    expect(page.mapObjectMode()).toBe(mode);
  });
});
