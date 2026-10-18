import {signal} from '@angular/core';
import {describe, expect, it, vi} from 'vitest';
import {MapPageComponent} from './map-page.component';
import {SpotId} from '../../../db/schemas/SpotSchema';

describe('map check-in submission', () => {
  it('shows a failure, releases pending state and permits retry', async () => {
    const open = vi.fn();
    const checkIn = vi.fn().mockRejectedValueOnce(new TypeError('Network error')).mockResolvedValue({checkInId: 'c', sessionRecordId: 's', duplicate: false, spotVisitCount: 3});
    const sheet = vi.fn();
    const page = {checkInPending: signal(false), checkInService: {checkIn}, _snackbar: {open}, _bottomSheet: {open: sheet}, proximityCheckInSpot: signal({name: 'Riverside'})};
    const submit = () => MapPageComponent.prototype.spotCheckIn.call(page as unknown as MapPageComponent, 'spot' as SpotId);
    await submit();
    expect(open).toHaveBeenCalledWith('Could not check in. Please try again.', 'Dismiss', {duration: 6000});
    expect(page.checkInPending()).toBe(false);
    await submit();
    expect(checkIn).toHaveBeenCalledTimes(2);
    // A confirmed check-in opens the private reward sheet with the visit number.
    expect(sheet).toHaveBeenCalledWith(expect.anything(), {data: expect.objectContaining({spotId: 'spot', spotName: 'Riverside', response: expect.objectContaining({spotVisitCount: 3})})});
  });

  it('does not celebrate a duplicate check-in', async () => {
    const open = vi.fn();
    const sheet = vi.fn();
    const checkIn = vi.fn().mockResolvedValue({checkInId: 'c', sessionRecordId: 's', duplicate: true});
    const page = {checkInPending: signal(false), checkInService: {checkIn}, _snackbar: {open}, _bottomSheet: {open: sheet}, proximityCheckInSpot: signal(null)};
    await MapPageComponent.prototype.spotCheckIn.call(page as unknown as MapPageComponent, 'spot' as SpotId);
    expect(sheet).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith("You're already checked in here.", 'Dismiss', {duration: 4000});
  });

  it('prevents duplicate submissions until the first request finishes', async () => {
    let resolve!: () => void;
    const checkIn = vi.fn(() => new Promise<null>(done => resolve = () => done(null)));
    const page = {checkInPending: signal(false), checkInService: {checkIn}, _snackbar: {open: vi.fn()}, _bottomSheet: {open: vi.fn()}, proximityCheckInSpot: signal(null)};
    const submit = () => MapPageComponent.prototype.spotCheckIn.call(page as unknown as MapPageComponent, 'spot' as SpotId);
    const first = submit();
    await submit();
    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(page.checkInPending()).toBe(true);
    resolve();
    await first;
    expect(page.checkInPending()).toBe(false);
  });
});
