import { Event as PkEvent } from "../../../db/models/Event";

export interface MapIslandEventRank {
  event: PkEvent;
  distanceToPromoCenterM: number;
  promoRadiusM: number;
  /**
   * 0 means the viewport is at the promo center; 1 means it is on the edge.
   * This keeps a 10 km offset inside a 20 km local promo from looking the
   * same as a 10 km offset inside a 500 km regional campaign.
   */
  normalizedCenterDistance: number;
}

const EVENT_MARKER_PRIORITY_BASE = 1_000;
const EVENT_MARKER_PRIORITY_MAX_BOOST = 999;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getMapEventMarkerPriority(
  event: PkEvent,
  now: Date = new Date(),
): number {
  if (event.isLive(now)) {
    return EVENT_MARKER_PRIORITY_BASE + EVENT_MARKER_PRIORITY_MAX_BOOST;
  }

  const daysUntilStart = Math.max(
    0,
    Math.floor((event.start.getTime() - now.getTime()) / ONE_DAY_MS),
  );
  return (
    EVENT_MARKER_PRIORITY_BASE +
    Math.max(0, EVENT_MARKER_PRIORITY_MAX_BOOST - daysUntilStart)
  );
}

function getMapIslandStatusRank(event: PkEvent, now: Date): number {
  if (event.isLive(now)) return 0;
  if (event.isUpcoming(now)) return 1;
  return 2;
}

/**
 * Explain and rank active event promos for one map point.
 *
 * The map island intentionally uses a small lexicographic rule instead of a
 * hidden weighted score:
 * 1. The promo must be active and contain the viewport center.
 * 2. Prefer live events, then the event that starts sooner.
 * 3. Prefer the event whose viewport center sits deepest inside its promo
 *    region (`distance / radius`, lower is better).
 * 4. If equally central, prefer the smaller promo region (more specific).
 * 5. If still tied, prefer the stable event id.
 *
 * Returning the full rank rows keeps the decision inspectable in tests and
 * future debugging instead of collapsing the result straight to one event.
 */
export function rankMapIslandEventsForPoint(
  events: readonly PkEvent[],
  point: { lat: number; lng: number },
  now: Date = new Date(),
): MapIslandEventRank[] {
  return events
    .filter((event) => event.isPromotable(now) && event.containsPromoPoint(point))
    .map((event) => {
      const distanceToPromoCenterM = event.distanceFromPromoCenterMeters(point);
      const promoRadiusM = event.promoRadiusMeters();

      return {
        event,
        distanceToPromoCenterM,
        promoRadiusM,
        normalizedCenterDistance:
          promoRadiusM > 0
            ? distanceToPromoCenterM / promoRadiusM
            : Number.POSITIVE_INFINITY,
      };
    })
    .sort((left, right) => {
      const statusDelta =
        getMapIslandStatusRank(left.event, now) -
        getMapIslandStatusRank(right.event, now);
      if (statusDelta !== 0) return statusDelta;

      const startDelta =
        left.event.start.getTime() - right.event.start.getTime();
      if (startDelta !== 0) return startDelta;

      const normalizedDelta =
        left.normalizedCenterDistance - right.normalizedCenterDistance;
      if (normalizedDelta !== 0) return normalizedDelta;

      const radiusDelta = left.promoRadiusM - right.promoRadiusM;
      if (radiusDelta !== 0) return radiusDelta;

      return left.event.id.localeCompare(right.event.id);
    });
}
