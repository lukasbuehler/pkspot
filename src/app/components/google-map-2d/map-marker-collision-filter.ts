export type MapMarkerCollisionKind = "event" | "spot" | "community" | "point";

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
  hiddenPointIds: Set<string>;
}

interface ProjectedCollisionCandidate extends MapMarkerCollisionCandidate {
  originalIndex: number;
  centerX: number;
  centerY: number;
  worldSizePx: number;
}

interface CollisionGrid {
  cellSizePx: number;
  cells: Map<string, ProjectedCollisionCandidate[]>;
  xCellCount: number;
}

const TILE_SIZE_PX = 256;
const COLLISION_GRID_CELL_SIZE_PX = 128;

export function filterEventSpotCollisions(
  candidates: readonly MapMarkerCollisionCandidate[],
  zoom: number,
): MapMarkerCollisionLayout {
  const projectedCandidates = candidates.map((candidate, originalIndex) =>
    projectCollisionCandidate(candidate, zoom, originalIndex),
  );
  const collisionGrid = createCollisionGrid(zoom);
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
    const hasHigherPriorityCollision = hasAcceptedCollision(
      collisionGrid,
      candidate,
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

    addToCollisionGrid(collisionGrid, candidate);
  }

  return { hiddenEventIds, hiddenSpotIds, hiddenCommunityIds, hiddenPointIds };
}

function createCollisionGrid(zoom: number): CollisionGrid {
  const worldSizePx = TILE_SIZE_PX * Math.pow(2, zoom);

  return {
    cellSizePx: COLLISION_GRID_CELL_SIZE_PX,
    cells: new Map(),
    xCellCount: Math.max(
      1,
      Math.ceil(worldSizePx / COLLISION_GRID_CELL_SIZE_PX),
    ),
  };
}

function hasAcceptedCollision(
  collisionGrid: CollisionGrid,
  candidate: ProjectedCollisionCandidate,
): boolean {
  const candidatesToCheck = new Set<ProjectedCollisionCandidate>();

  forEachCollisionCell(collisionGrid, candidate, (cellKey) => {
    const cellCandidates = collisionGrid.cells.get(cellKey);
    if (!cellCandidates) return;

    for (const cellCandidate of cellCandidates) {
      candidatesToCheck.add(cellCandidate);
    }
  });

  for (const winner of candidatesToCheck) {
    if (winner.id !== candidate.id && collisionBoxesOverlap(winner, candidate)) {
      return true;
    }
  }

  return false;
}

function addToCollisionGrid(
  collisionGrid: CollisionGrid,
  candidate: ProjectedCollisionCandidate,
): void {
  forEachCollisionCell(collisionGrid, candidate, (cellKey) => {
    const candidates = collisionGrid.cells.get(cellKey);
    if (candidates) {
      candidates.push(candidate);
      return;
    }

    collisionGrid.cells.set(cellKey, [candidate]);
  });
}

function forEachCollisionCell(
  collisionGrid: CollisionGrid,
  candidate: ProjectedCollisionCandidate,
  callback: (cellKey: string) => void,
): void {
  const halfWidthPx = candidate.widthPx / 2;
  const halfHeightPx = candidate.heightPx / 2;
  const yStart = Math.floor(
    (candidate.centerY - halfHeightPx) / collisionGrid.cellSizePx,
  );
  const yEnd = Math.floor(
    (candidate.centerY + halfHeightPx) / collisionGrid.cellSizePx,
  );
  const xStart = Math.floor(
    (candidate.centerX - halfWidthPx) / collisionGrid.cellSizePx,
  );
  const xEnd = Math.floor(
    (candidate.centerX + halfWidthPx) / collisionGrid.cellSizePx,
  );
  const visitedCellKeys = new Set<string>();

  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const wrappedX = wrapCellIndex(x, collisionGrid.xCellCount);
      const cellKey = `${wrappedX}:${y}`;
      if (visitedCellKeys.has(cellKey)) continue;

      visitedCellKeys.add(cellKey);
      callback(cellKey);
    }
  }
}

function wrapCellIndex(index: number, cellCount: number): number {
  return ((index % cellCount) + cellCount) % cellCount;
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
  candidate: ProjectedCollisionCandidate,
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
