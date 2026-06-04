export type MapMarkerCollisionKind = "event" | "spot" | "community";

export interface MapMarkerCollisionCandidate {
  id: string;
  kind: MapMarkerCollisionKind;
  location: google.maps.LatLngLiteral;
  priority: number;
  widthPx: number;
  heightPx: number;
  anchor: "center" | "bottom-center";
}

export interface MapMarkerCollisionLayout {
  hiddenEventIds: Set<string>;
  hiddenSpotIds: Set<string>;
  hiddenCommunityIds: Set<string>;
}

interface ProjectedCollisionCandidate extends MapMarkerCollisionCandidate {
  originalIndex: number;
  centerX: number;
  centerY: number;
  worldSizePx: number;
}

const TILE_SIZE_PX = 256;

export function filterEventSpotCollisions(
  candidates: readonly MapMarkerCollisionCandidate[],
  zoom: number,
): MapMarkerCollisionLayout {
  const projectedCandidates = candidates.map((candidate, originalIndex) =>
    projectCollisionCandidate(candidate, zoom, originalIndex),
  );
  const accepted: ProjectedCollisionCandidate[] = [];
  const hiddenEventIds = new Set<string>();
  const hiddenSpotIds = new Set<string>();
  const hiddenCommunityIds = new Set<string>();

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
      winner.id !== candidate.id && collisionBoxesOverlap(winner, candidate),
    );

    if (hasHigherPriorityCollision) {
      addHiddenId(candidate, {
        hiddenEventIds,
        hiddenSpotIds,
        hiddenCommunityIds,
      });
      continue;
    }

    accepted.push(candidate);
  }

  return { hiddenEventIds, hiddenSpotIds, hiddenCommunityIds };
}

function projectCollisionCandidate(
  candidate: MapMarkerCollisionCandidate,
  zoom: number,
  originalIndex: number,
): ProjectedCollisionCandidate {
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

function collisionBoxesOverlap(
  a: ProjectedCollisionCandidate,
  b: ProjectedCollisionCandidate,
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
      return 2;
    case "spot":
      return 1;
    case "community":
      return 0;
  }
}

function addHiddenId(
  candidate: ProjectedCollisionCandidate,
  hiddenIds: {
    hiddenEventIds: Set<string>;
    hiddenSpotIds: Set<string>;
    hiddenCommunityIds: Set<string>;
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
  }
}
