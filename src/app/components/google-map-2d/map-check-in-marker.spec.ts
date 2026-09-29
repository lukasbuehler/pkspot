import {signal} from '@angular/core';
import {describe, expect, it} from 'vitest';
import {GoogleMap2dComponent} from './google-map-2d.component';

type MarkerFilter = {
  _getVisibleHighlightedSpotPreviews(): {id: string}[];
  _getVisibleRegularSpotMarkers(): {id: string}[];
};

describe('check-in marker replacement', () => {
  it('hides only the matching pill and restores it when the check-in marker disappears', () => {
    const spots = [{id: 'nearby'}, {id: 'other'}];
    const show = signal(true);
    const current = signal({id: 'nearby'});
    const component = Object.assign(Object.create(GoogleMap2dComponent.prototype), {
      highlightedSpots: () => spots,
      selectedSpot: () => null,
      shouldShowCheckInMarker: show,
      checkInSpot: current,
    }) as MarkerFilter;
    expect(component._getVisibleHighlightedSpotPreviews()).toEqual([{id: 'other'}]);
    current.set({id: 'other'});
    expect(component._getVisibleHighlightedSpotPreviews()).toEqual([{id: 'nearby'}]);
    show.set(false);
    expect(component._getVisibleHighlightedSpotPreviews()).toEqual(spots);
  });

  it('also replaces regular Spot markers without hiding neighboring Spots', () => {
    const spots = [{id: 'nearby'}, {id: 'other'}];
    const show = signal(true);
    const component = Object.assign(Object.create(GoogleMap2dComponent.prototype), {
      _zoom: () => 18, showSpotPreview: () => true, showVisibleSpotPins: () => true,
      hideRegularSpotPins: () => false, selectedSpot: () => null, isEditing: () => false,
      highlightedSpots: () => [], spots: () => spots,
      shouldShowCheckInMarker: show, checkInSpot: () => ({id: 'nearby'}),
      isSelectedSpotBeingEdited: () => false, isSameAsSelectedSpot: () => false,
    }) as MarkerFilter;
    expect(component._getVisibleRegularSpotMarkers()).toEqual([{id: 'other'}]);
    show.set(false);
    expect(component._getVisibleRegularSpotMarkers()).toEqual(spots);
  });
});
