import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LogEntryDocument } from '../../../db/schemas/LogEntrySchema';
import type { SessionRecordDocument } from '../../../db/schemas/SessionRecordSchema';
import { CheckInLogPromptComponent } from './check-in-log-prompt.component';

const session = (id: string, started: number, owner = 'owner') => ({
  id, owner_id: owner, source: 'check_in', started_at_raw_ms: started,
  spot_visits: [{ spot_id: 'spot', spot_name: 'Riverside' }],
} as SessionRecordDocument);
function setup(sessions = [session('latest', 2), session('older', 1)], logs: LogEntryDocument[] = []) {
  TestBed.configureTestingModule({ imports: [CheckInLogPromptComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(CheckInLogPromptComponent);
  fixture.componentRef.setInput('sessions', sessions);
  fixture.componentRef.setInput('logs', logs);
  return fixture;
}
describe('check-in log prompt', () => {
  beforeEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });
  it('offers the latest check-in and stops prompting after its entry is saved', () => {
    const fixture = setup();
    expect(fixture.componentInstance.session()?.id).toBe('latest');
    fixture.componentRef.setInput('logs', [{ session_record_ids: ['latest'] }]);
    expect(fixture.componentInstance.session()).toBeNull();
  });
  it('remembers dismissal across visits without prompting for older check-ins', () => {
    const fixture = setup();
    fixture.componentInstance.dismiss();
    expect(fixture.componentInstance.session()).toBeNull();
    fixture.destroy();
    TestBed.resetTestingModule();
    expect(setup().componentInstance.session()).toBeNull();
  });
  it('keeps dismissals separate between accounts and allows a new check-in', () => {
    const fixture = setup();
    fixture.componentInstance.dismiss();
    fixture.componentRef.setInput('sessions', [session('latest', 2, 'another-owner')]);
    expect(fixture.componentInstance.session()).not.toBeNull();
    fixture.componentRef.setInput('sessions', [session('newer', 3)]);
    expect(fixture.componentInstance.session()?.id).toBe('newer');
  });
  it('ignores manual activity and tolerates malformed storage', () => {
    localStorage.setItem('pkspot.dismissed-check-in-prompts', 'invalid json');
    const fixture = setup([{ ...session('manual', 3), source: 'manual' }]);
    expect(fixture.componentInstance.session()).toBeNull();
  });
});
