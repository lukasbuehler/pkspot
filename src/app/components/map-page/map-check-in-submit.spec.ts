import {signal} from '@angular/core';
import {describe, expect, it, vi} from 'vitest';
import {MapPageComponent} from './map-page.component';
import {SpotId} from '../../../db/schemas/SpotSchema';

describe('map check-in submission', () => {
  it('shows a failure, releases pending state and permits retry', async () => {
    const open = vi.fn();
    const checkIn = vi.fn().mockRejectedValueOnce(new TypeError('Network error')).mockResolvedValue(undefined);
    const page = {checkInPending: signal(false), checkInService: {checkIn}, _snackbar: {open}};
    const submit = () => MapPageComponent.prototype.spotCheckIn.call(page as unknown as MapPageComponent, 'spot' as SpotId);
    await submit();
    expect(open).toHaveBeenCalledWith('Could not check in. Please try again.', 'Dismiss', {duration: 6000});
    expect(page.checkInPending()).toBe(false);
    await submit();
    expect(checkIn).toHaveBeenCalledTimes(2);
  });

  it('prevents duplicate submissions until the first request finishes', async () => {
    let resolve!: () => void;
    const checkIn = vi.fn(() => new Promise<void>(done => resolve = done));
    const page = {checkInPending: signal(false), checkInService: {checkIn}, _snackbar: {open: vi.fn()}};
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
