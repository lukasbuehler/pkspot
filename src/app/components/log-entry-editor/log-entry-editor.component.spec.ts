import { SpotSelectionDataService } from '../../services/spot-selection-data.service';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { LogEntryEditorComponent } from './log-entry-editor.component';
import { PlannedSessionsService } from '../../services/planned-sessions.service';
import { FeatureTelemetryService } from '../../services/feature-telemetry.service';
import { StoreReviewService } from '../../reviews/store-review.service';
import { LogEntriesService } from '../../services/firebase/firestore/log-entries.service';
import { SessionRecordsService } from '../../services/firebase/firestore/session-records.service';
import type { SessionRecordDocument } from '../../../db/schemas/SessionRecordSchema';
import type { LogEntryDocument } from '../../../db/schemas/LogEntrySchema';
const time = Timestamp.fromMillis(1000);
const record: SessionRecordDocument = {
  id: 'mine', owner_id: 'owner', source: 'check_in', time_zone: 'UTC',
  started_at: time, started_at_raw_ms: 1000, last_activity_at: time, last_activity_raw_ms: 1000,
  time_created: time, time_created_raw_ms: 1000, time_updated: time, time_updated_raw_ms: 1000,
  spot_visits: [{ spot_id: 'spot', arrived_at: time, arrived_at_raw_ms: 1000 }], people_present: [],
};
function setup(query: Record<string, string>, records: SessionRecordDocument[], lookup: SessionRecordDocument | null = null, entry?: LogEntryDocument) {
  const getMine = vi.fn().mockResolvedValue(lookup), createManual = vi.fn(), create = vi.fn(), update = vi.fn();
  TestBed.configureTestingModule({ providers: [
    { provide: SpotSelectionDataService, useValue: { resolveVisitNames: vi.fn().mockResolvedValue(new Map([["spot", "Riverside"]])) } },
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(entry ? {entryId: entry.id} : {}), queryParamMap: convertToParamMap(query) } } },
    { provide: Router, useValue: { navigateByUrl: vi.fn() } },
    { provide: StoreReviewService, useValue: { recordActivity: vi.fn(), offerAfterCompletion: vi.fn() } },
    { provide: FeatureTelemetryService, useValue: { failure: vi.fn() } },
    { provide: SessionRecordsService, useValue: { listMine: vi.fn().mockResolvedValue(records), getMine, createManual } },
    { provide: LogEntriesService, useValue: { create, update, getMine: vi.fn().mockResolvedValue(entry) } },
    { provide: PlannedSessionsService, useValue: { get: vi.fn().mockResolvedValue({ session: { spotId: 'spot', startsAt: 900, endsAt: 2000 } }) } },
  ] });
  return { component: TestBed.runInInjectionContext(() => new LogEntryEditorComponent()), getMine, createManual, create, update };
}
describe('private activity handoff', () => {
  it('saves a note against the selected check-in without creating another session', async () => {
    const { component, createManual, create } = setup({ sessionRecord: 'mine' }, [record]);
    await vi.waitFor(() => expect(component.loading()).toBe(false));
    component.form.controls.note.setValue('Worked on quiet landings');
    await component.save();
    expect(create).toHaveBeenCalledWith({ note: 'Worked on quiet landings', sessions: [record] });
    expect(createManual).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(component.sessionPlaces().get('mine')).toBe('Riverside'));
  });
  it('preserves a legacy note while removing its audience choice from the editor and save payload', async () => {
    const entry = {id: 'legacy', owner_id: 'owner', visibility: 'public', note: 'Keep my memory', session_record_ids: ['mine']} as LogEntryDocument;
    const {component, update} = setup({}, [record], null, entry);
    await vi.waitFor(() => expect(component.loading()).toBe(false));
    expect(component.form.getRawValue()).toEqual({note: 'Keep my memory'});
    await component.save();
    expect(update).toHaveBeenCalledWith('legacy', {note: 'Keep my memory', sessions: [record]});
    expect(entry.visibility).toBe('public');
  });
  it('selects an existing planned-session check-in without creating activity on page load', async () => {
    const { component, createManual, create } = setup({ plannedSession: 'plan' }, [record]);
    await vi.waitFor(() => expect(component.loading()).toBe(false));
    expect(component.selectedIds()).toEqual(['mine']);
    expect(component.showNewSession()).toBe(false);
    expect(createManual).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });
  it('loads an older history record through the owner-only service', async () => {
    const { component, getMine } = setup({ sessionRecord: 'mine' }, [], record);
    await vi.waitFor(() => expect(component.loading()).toBe(false));
    expect(getMine).toHaveBeenCalledWith('mine'); expect(component.selectedIds()).toEqual(['mine']);
  });
  it('does not select a missing or inaccessible history record', async () => {
    const { component } = setup({ sessionRecord: 'missing' }, []);
    await vi.waitFor(() => expect(component.loading()).toBe(false));
    expect(component.selectedIds()).toEqual([]); expect(component.error()).toBeTruthy();
  });
});
