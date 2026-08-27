import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpotMapComponent } from "./spot-map.component";

interface SpotMapLifecycleHarness {
  _filterBoundsDebounceTimer: ReturnType<typeof setTimeout> | null;
  _isDestroyed: boolean;
  _pendingTimers: Set<ReturnType<typeof setTimeout>>;
  _schedule(callback: () => void, delay?: number): ReturnType<typeof setTimeout>;
  _spotOpenRequestVersion: number;
}

function createLifecycleHarness(): SpotMapComponent & SpotMapLifecycleHarness {
  const component = Object.create(
    SpotMapComponent.prototype,
  ) as SpotMapComponent & SpotMapLifecycleHarness;
  component._filterBoundsDebounceTimer = null;
  component._isDestroyed = false;
  component._pendingTimers = new Set();
  component._spotOpenRequestVersion = 0;
  return component;
}

describe("SpotMapComponent lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels scheduled callbacks when the component is destroyed", () => {
    vi.useFakeTimers();
    const component = createLifecycleHarness();
    const callback = vi.fn();

    component._schedule(callback, 100);
    component.ngOnDestroy();
    vi.runAllTimers();

    expect(callback).not.toHaveBeenCalled();
  });

  it("does not forward child events after the component is destroyed", () => {
    const component = createLifecycleHarness();
    const emit = vi.fn();
    Object.defineProperty(component, "communityMarkerClick", {
      value: { emit },
    });

    component.ngOnDestroy();
    component.onCommunityMarkerClick("zurich");

    expect(emit).not.toHaveBeenCalled();
  });

  it("records create guard blocks only for unsaved Local Spots", () => {
    const source = readFileSync(
      resolve("src/app/components/spot-map/spot-map.component.ts"),
      "utf8",
    );
    expect(source.match(
      /spot instanceof LocalSpot && !\(spot instanceof Spot\)/g,
    )).toHaveLength(2);
  });

  it("chooses the save snackbar from the processed edit disposition", () => {
    const source = readFileSync(
      resolve("src/app/components/spot-map/spot-map.component.ts"),
      "utf8",
    );

    expect(source).toContain("waitForProcessingDisposition(spotId, editId)");
    expect(source).toContain("spotEditProcessingFailed(disposition)");
    expect(source).toContain("spotEditAwaitsOrganizationReview(disposition)");
    expect(source).not.toContain("const requiresOrganizationReview =");
  });
});
