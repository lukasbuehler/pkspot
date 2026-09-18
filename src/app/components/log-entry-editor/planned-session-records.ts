import type { SessionRecordDocument } from '../../../db/schemas/SessionRecordSchema';

/** Suggestions use only the current user's records. Saving a plan is never attendance. */
export function matchingPlannedSessionRecords(
  records: readonly SessionRecordDocument[],
  plan: { spotId: string; startsAt: number; endsAt: number },
): string[] {
  return records.filter(record => record.spot_visits.some(visit =>
    visit.spot_id === plan.spotId &&
    visit.arrived_at_raw_ms <= plan.endsAt &&
    (visit.left_at_raw_ms ?? record.ended_at_raw_ms ?? record.last_activity_raw_ms) >= plan.startsAt,
  )).map(record => record.id);
}
