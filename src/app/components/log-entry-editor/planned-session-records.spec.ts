import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { SessionRecordDocument } from '../../../db/schemas/SessionRecordSchema';
import { matchingPlannedSessionRecords } from './planned-session-records';

const time = Timestamp.fromMillis(1000);
const record: SessionRecordDocument = {
  id: 'mine', owner_id: 'owner', source: 'check_in', time_zone: 'UTC',
  started_at: time, started_at_raw_ms: 1000, last_activity_at: time, last_activity_raw_ms: 1000,
  time_created: time, time_created_raw_ms: 1000, time_updated: time, time_updated_raw_ms: 1000,
  spot_visits: [{ spot_id: 'spot', arrived_at: time, arrived_at_raw_ms: 1000 }], people_present: [],
};
const plan = { spotId: 'spot', startsAt: 900, endsAt: 2000 };
describe('planned activity suggestions', () => {
  it('reuses a matching check-in without creating or changing a record', () => {
    expect(matchingPlannedSessionRecords([record], plan)).toEqual(['mine']);
    expect(record.spot_visits).toHaveLength(1);
  });
  it('does not infer attendance from the plan or a different Spot/day', () => {
    expect(matchingPlannedSessionRecords([], plan)).toEqual([]);
    expect(matchingPlannedSessionRecords([record], { ...plan, spotId: 'other' })).toEqual([]);
    expect(matchingPlannedSessionRecords([record], { ...plan, startsAt: 3000, endsAt: 4000 })).toEqual([]);
  });
  it('uses the individual visit end instead of a later visit elsewhere', () => {
    expect(matchingPlannedSessionRecords([{ ...record, last_activity_raw_ms: 5000,
      spot_visits: [{ ...record.spot_visits[0], left_at_raw_ms: 1500 }] }],
      { ...plan, startsAt: 3000, endsAt: 4000 })).toEqual([]);
  });
});
