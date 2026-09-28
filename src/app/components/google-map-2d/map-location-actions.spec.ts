import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { GoogleMap2dComponent } from './google-map-2d.component';

function locationActions() {
  const component = Object.create(GoogleMap2dComponent.prototype) as GoogleMap2dComponent;
  const location = { lat: 47.3769, lng: 8.5417 };
  const emit = vi.fn();
  const directions = vi.fn();
  Object.defineProperties(component, {
    droppedLocation: { value: signal<google.maps.LatLngLiteral | null>(location) },
    createSpotAt: { value: { emit } },
    mapsApiService: { value: { openDirectionsInMaps: directions } },
  });
  return { component, location, emit, directions };
}

describe('dropped map location actions', () => {
  it('passes the selected coordinates into Spot creation, then clears the pin', () => {
    const { component, location, emit } = locationActions();
    component.createAtDroppedLocation();
    expect(emit).toHaveBeenCalledWith(location);
    expect(component.droppedLocation()).toBeNull();
    component.createAtDroppedLocation();
    expect(emit).toHaveBeenCalledTimes(1);
  });
  it('uses platform directions for the selected point and ignores a dismissed pin', () => {
    const { component, location, directions } = locationActions();
    component.navigateToDroppedLocation();
    expect(directions).toHaveBeenCalledWith(location);
    component.droppedLocation.set(null);
    component.navigateToDroppedLocation();
    expect(directions).toHaveBeenCalledTimes(1);
  });
});
