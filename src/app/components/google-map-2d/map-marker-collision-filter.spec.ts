import { describe, expect, it } from "vitest";
import { filterEventSpotCollisions } from "./map-marker-collision-filter";
import type {
  MapMarkerCollisionCandidate,
  MapMarkerCollisionKind,
  MapMarkerCollisionLayout,
} from "./map-marker-collision-filter";

const event = (
  id: string,
  priority: number,
  location: google.maps.LatLngLiteral = { lat: 47, lng: 8 },
): MapMarkerCollisionCandidate => ({
  id,
  kind: "event",
  location,
  priority,
  widthPx: 48,
  heightPx: 48,
  anchor: "center",
});

const spot = (
  id: string,
  priority: number,
  location: google.maps.LatLngLiteral = { lat: 47, lng: 8 },
): MapMarkerCollisionCandidate => ({
  id,
  kind: "spot",
  location,
  priority,
  widthPx: 124,
  heightPx: 52,
  anchor: "bottom-center",
});

const community = (
  id: string,
  location: google.maps.LatLngLiteral = { lat: 47, lng: 8 },
): MapMarkerCollisionCandidate => ({
  id,
  kind: "community",
  location,
  priority: 40,
  widthPx: 10,
  heightPx: 10,
  anchor: "center",
});

const point = (
  id: string,
  priority: number,
  location: google.maps.LatLngLiteral = { lat: 47, lng: 8 },
): MapMarkerCollisionCandidate => ({
  id,
  kind: "point",
  location,
  priority,
  widthPx: 14,
  heightPx: 14,
  anchor: "center",
});

describe("filterEventSpotCollisions", () => {
  it("keeps a higher-priority event over an overlapping spot", () => {
    const layout = filterEventSpotCollisions(
      [spot("low-spot", 100), event("event", 250)],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(new Set(["low-spot"]));
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("keeps a higher-priority spot over an overlapping event", () => {
    const layout = filterEventSpotCollisions(
      [spot("iconic-spot", 600), event("event", 250)],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set(["event"]));
    expect(layout.hiddenSpotIds).toEqual(new Set());
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("lets events win priority ties with spots", () => {
    const layout = filterEventSpotCollisions(
      [spot("spot", 250), event("event", 250)],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(new Set(["spot"]));
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("keeps both markers when they have enough screen-space separation", () => {
    const layout = filterEventSpotCollisions(
      [spot("spot", 100), event("event", 250, { lat: 47, lng: 8.1 })],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(new Set());
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("keeps only the strongest spot in an overlapping spot cluster", () => {
    const layout = filterEventSpotCollisions(
      [
        spot("weak-spot", 150),
        spot("medium-spot", 300),
        spot("strong-spot", 500),
      ],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(
      new Set(["medium-spot", "weak-spot"]),
    );
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("does not hide alternate marker candidates for the same spot", () => {
    const layout = filterEventSpotCollisions(
      [spot("spot", 500), spot("spot", 100)],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(new Set());
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("hides overlapping communities behind spots and events", () => {
    const layout = filterEventSpotCollisions(
      [community("community"), spot("spot", 500), event("event", 600)],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(new Set(["spot"]));
    expect(layout.hiddenCommunityIds).toEqual(new Set(["community"]));
  });

  it("hides lower-priority generic points before rendering", () => {
    const layout = filterEventSpotCollisions(
      [point("point", 100), event("event", 250)],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenPointIds).toEqual(new Set(["point"]));
  });

  it("detects collisions across the anti-meridian", () => {
    const layout = filterEventSpotCollisions(
      [
        spot("west-spot", 500, { lat: 0, lng: -179.998 }),
        event("east-event", 250, { lat: 0, lng: 179.998 }),
      ],
      10,
    );

    expect(layout.hiddenEventIds).toEqual(new Set(["east-event"]));
    expect(layout.hiddenSpotIds).toEqual(new Set());
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("matches the previous scanner and reports dense-marker speed", () => {
    const candidates = createDenseBenchmarkCandidates(2_000);
    const zoom = 14;
    const oldLayout = filterEventSpotCollisionsSlow(candidates, zoom);
    const newLayout = filterEventSpotCollisions(candidates, zoom);

    expect(newLayout.hiddenEventIds).toEqual(oldLayout.hiddenEventIds);
    expect(newLayout.hiddenSpotIds).toEqual(oldLayout.hiddenSpotIds);
    expect(newLayout.hiddenCommunityIds).toEqual(oldLayout.hiddenCommunityIds);
    expect(newLayout.hiddenPointIds).toEqual(oldLayout.hiddenPointIds);

    const oldMs = measureMs(() =>
      filterEventSpotCollisionsSlow(candidates, zoom),
    );
    const newMs = measureMs(() => filterEventSpotCollisions(candidates, zoom));
    const improvement = ((oldMs - newMs) / oldMs) * 100;

    console.info(
      `map collision spatial grid: ${improvement.toFixed(1)}% faster ` +
        `(${oldMs.toFixed(2)}ms -> ${newMs.toFixed(2)}ms, ` +
        `${candidates.length} candidates)`,
    );
  });
});

interface ProjectedBenchmarkCandidate extends MapMarkerCollisionCandidate {
  originalIndex: number;
  centerX: number;
  centerY: number;
  worldSizePx: number;
}

const TILE_SIZE_PX = 256;

function filterEventSpotCollisionsSlow(
  candidates: readonly MapMarkerCollisionCandidate[],
  zoom: number,
): MapMarkerCollisionLayout {
  const projectedCandidates = candidates.map((candidate, originalIndex) =>
    projectBenchmarkCandidate(candidate, zoom, originalIndex),
  );
  const accepted: ProjectedBenchmarkCandidate[] = [];
  const hiddenEventIds = new Set<string>();
  const hiddenSpotIds = new Set<string>();
  const hiddenCommunityIds = new Set<string>();
  const hiddenPointIds = new Set<string>();

  const orderedCandidates = [...projectedCandidates].sort((a, b) => {
    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) return priorityDiff;

    const kindDiff = markerKindRank(b.kind) - markerKindRank(a.kind);
    if (kindDiff !== 0) return kindDiff;

    const idDiff = a.id.localeCompare(b.id);
    if (idDiff !== 0) return idDiff;

    return a.originalIndex - b.originalIndex;
  });

  for (const candidate of orderedCandidates) {
    const hasHigherPriorityCollision = accepted.some((winner) =>
      winner.id !== candidate.id &&
      benchmarkCollisionBoxesOverlap(winner, candidate),
    );

    if (hasHigherPriorityCollision) {
      addHiddenId(candidate, {
        hiddenEventIds,
        hiddenSpotIds,
        hiddenCommunityIds,
        hiddenPointIds,
      });
      continue;
    }

    accepted.push(candidate);
  }

  return { hiddenEventIds, hiddenSpotIds, hiddenCommunityIds, hiddenPointIds };
}

function projectBenchmarkCandidate(
  candidate: MapMarkerCollisionCandidate,
  zoom: number,
  originalIndex: number,
): ProjectedBenchmarkCandidate {
  const projected = projectLatLng(candidate.location, zoom);
  const yOffset =
    candidate.anchor === "bottom-center" ? -candidate.heightPx / 2 : 0;

  return {
    ...candidate,
    originalIndex,
    centerX: projected.x,
    centerY: projected.y + yOffset,
    worldSizePx: projected.worldSizePx,
  };
}

function benchmarkCollisionBoxesOverlap(
  a: ProjectedBenchmarkCandidate,
  b: ProjectedBenchmarkCandidate,
): boolean {
  const dx = wrappedDistancePx(a.centerX, b.centerX, a.worldSizePx);
  const dy = Math.abs(a.centerY - b.centerY);

  return dx < (a.widthPx + b.widthPx) / 2 && dy < (a.heightPx + b.heightPx) / 2;
}

function projectLatLng(
  location: google.maps.LatLngLiteral,
  zoom: number,
): { x: number; y: number; worldSizePx: number } {
  const worldSizePx = TILE_SIZE_PX * Math.pow(2, zoom);
  const sinLatitude = Math.sin((location.lat * Math.PI) / 180);
  const clampedSinLatitude = Math.max(-0.9999, Math.min(0.9999, sinLatitude));

  return {
    x: ((location.lng + 180) / 360) * worldSizePx,
    y:
      (0.5 -
        Math.log((1 + clampedSinLatitude) / (1 - clampedSinLatitude)) /
          (4 * Math.PI)) *
      worldSizePx,
    worldSizePx,
  };
}

function wrappedDistancePx(a: number, b: number, worldSizePx: number): number {
  const directDistance = Math.abs(a - b);
  return Math.min(directDistance, worldSizePx - directDistance);
}

function markerKindRank(kind: MapMarkerCollisionKind): number {
  switch (kind) {
    case "event":
      return 3;
    case "spot":
      return 2;
    case "community":
      return 1;
    case "point":
      return 0;
  }
}

function addHiddenId(
  candidate: ProjectedBenchmarkCandidate,
  hiddenIds: {
    hiddenEventIds: Set<string>;
    hiddenSpotIds: Set<string>;
    hiddenCommunityIds: Set<string>;
    hiddenPointIds: Set<string>;
  },
): void {
  switch (candidate.kind) {
    case "event":
      hiddenIds.hiddenEventIds.add(candidate.id);
      return;
    case "spot":
      hiddenIds.hiddenSpotIds.add(candidate.id);
      return;
    case "community":
      hiddenIds.hiddenCommunityIds.add(candidate.id);
      return;
    case "point":
      hiddenIds.hiddenPointIds.add(candidate.id);
      return;
  }
}

function createDenseBenchmarkCandidates(
  count: number,
): MapMarkerCollisionCandidate[] {
  let seed = 0x5eed;
  const candidates: MapMarkerCollisionCandidate[] = [];

  for (let index = 0; index < count; index++) {
    seed = nextSeed(seed);
    const latOffset = (seed / 0xffffffff - 0.5) * 0.24;
    seed = nextSeed(seed);
    const lngOffset = (seed / 0xffffffff - 0.5) * 0.24;
    const location = {
      lat: 47.3769 + latOffset,
      lng: 8.5417 + lngOffset,
    };

    if (index % 7 === 0) {
      candidates.push(event(`event-${index}`, 250 + (index % 11), location));
      continue;
    }

    if (index % 11 === 0) {
      candidates.push(community(`community-${index}`, location));
      continue;
    }

    if (index % 5 === 0) {
      candidates.push(point(`point-${index}`, 100 + (index % 90), location));
      continue;
    }

    candidates.push(spot(`spot-${index}`, 100 + (index % 500), location));
  }

  return candidates;
}

function nextSeed(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0;
}

function measureMs(callback: () => void): number {
  callback();
  const start = performance.now();
  callback();
  return performance.now() - start;
}
