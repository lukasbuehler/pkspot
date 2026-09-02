import type { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import type { EventDiscoveryItem } from "../../services/search.service";

export interface RankedTrainingEvent extends EventDiscoveryItem {
  distanceKm?: number;
  live: boolean;
}

export interface NearbyTrainingEvents {
  items: RankedTrainingEvent[];
  radiusKm: number;
}

interface RankedSpotCandidate {
  spot: SpotPreviewData;
  index: number;
  distanceKm?: number;
}

/**
 * Ranks events for the immediate training decision: live sessions first, then
 * the soonest starting events, with distance deciding otherwise equal choices.
 */
export function rankNearbyTrainingEvents(
  events: readonly EventDiscoveryItem[],
  nowSeconds: number,
  center?: readonly [number, number],
): NearbyTrainingEvents {
  const items = events.map((event): RankedTrainingEvent => ({
    ...event,
    distanceKm: distanceToEvent(event, center),
    live: event.startSeconds <= nowSeconds && event.endSeconds >= nowSeconds,
  }));
  const radiusKm = selectEventRadius(items, !!center);
  return {
    radiusKm,
    items: items
      .filter(
        (event) =>
          !center ||
          event.distanceKm === undefined ||
          event.distanceKm <= radiusKm,
      )
      .sort(compareTrainingEvents),
  };
}

/**
 * Followed communities deserve their own recommendation surface. Their events
 * are deliberately not radius-limited because the relationship is meaningful
 * even when the event is not close to the selected training area.
 */
export function rankCommunityTrainingEvents(
  events: readonly EventDiscoveryItem[],
  nowSeconds: number,
  center?: readonly [number, number],
): RankedTrainingEvent[] {
  return events
    .map((event): RankedTrainingEvent => ({
      ...event,
      distanceKm: distanceToEvent(event, center),
      live: event.startSeconds <= nowSeconds && event.endSeconds >= nowSeconds,
    }))
    .sort(compareTrainingEvents);
}

/**
 * Search already returns quality-prioritized Spots. Apply a modest proximity
 * adjustment so a similarly good Spot that is easier to reach can surface,
 * without turning the list into a pure distance sort.
 */
export function rankTrainingSpots(
  spots: readonly SpotPreviewData[],
  center: readonly [number, number],
  radiusKm: number,
  maxResults: number,
): SpotPreviewData[] {
  return spots
    .map((spot, index) => ({
      spot,
      index,
      distanceKm: distanceToSpot(spot, center),
    }))
    .sort((left, right) => {
      const score = (candidate: RankedSpotCandidate) =>
        (candidate.spot.rating ?? 0) -
        distanceWeight(candidate.distanceKm, radiusKm);
      const scoreDifference = score(right) - score(left);
      if (Math.abs(scoreDifference) > 0.001) return scoreDifference;
      return left.index - right.index;
    })
    .slice(0, maxResults)
    .map(({ spot }) => spot);
}

function compareTrainingEvents(
  left: RankedTrainingEvent,
  right: RankedTrainingEvent,
): number {
  return (
    Number(right.live) - Number(left.live) ||
    left.startSeconds - right.startSeconds ||
    (left.distanceKm ?? Number.MAX_SAFE_INTEGER) -
      (right.distanceKm ?? Number.MAX_SAFE_INTEGER) ||
    left.name.localeCompare(right.name)
  );
}

function selectEventRadius(
  events: readonly RankedTrainingEvent[],
  hasCenter: boolean,
): number {
  if (!hasCenter) return 25;
  return (
    [25, 50, 100].find((radiusKm) =>
      events.some(
        (event) =>
          event.distanceKm === undefined || event.distanceKm <= radiusKm,
      ),
    ) ?? 100
  );
}

function distanceToEvent(
  event: EventDiscoveryItem,
  center?: readonly [number, number],
): number | undefined {
  const point = event.location ?? event.boundsCenter;
  return center && point ? distanceKm(center, point) : undefined;
}

function distanceToSpot(
  spot: SpotPreviewData,
  center: readonly [number, number],
): number | undefined {
  const point = spot.location_raw ?? spot.location;
  if (!point) return undefined;
  if ("latitude" in point && "longitude" in point) {
    return distanceKm(center, [point.latitude, point.longitude]);
  }
  return distanceKm(center, [point.lat, point.lng]);
}

function distanceWeight(distanceKmValue: number | undefined, radiusKm: number): number {
  if (distanceKmValue === undefined) return 0.25;
  return Math.min(1.5, (distanceKmValue / Math.max(radiusKm, 1)) * 1.5);
}

function distanceKm(
  from: readonly [number, number],
  to: readonly [number, number],
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat = toRadians(to[0] - from[0]);
  const lng = toRadians(to[1] - from[1]);
  const value =
    Math.sin(lat / 2) ** 2 +
    Math.cos(toRadians(from[0])) *
      Math.cos(toRadians(to[0])) *
      Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
