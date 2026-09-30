import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { EventDiscoveryToolbarComponent } from './event-discovery-toolbar.component';

describe('event discovery chip rows', () => {
  it('keeps zero-count options visible and selectable', () => {
    const fixture = TestBed.createComponent(EventDiscoveryToolbarComponent);
    fixture.componentRef.setInput('view', 'list');
    fixture.componentRef.setInput('categoryOptions', [
      { id: 'jam', label: 'Jam', icon: 'groups', count: 1 },
      { id: 'camp', label: 'Camp', icon: 'groups', count: 0 },
    ]);
    expect(fixture.componentInstance.detailChips().map(chip => chip.urlParam)).toEqual(['category:jam', 'category:camp']);
    fixture.componentRef.setInput('selectedCategories', ['camp']);
    expect(fixture.componentInstance.detailChips()).toHaveLength(2);
    expect(fixture.componentInstance.selectedDetails()).toEqual(['category:camp']);
  });
  it('routes selections to the right filter group even when IDs match', () => {
    const fixture = TestBed.createComponent(EventDiscoveryToolbarComponent);
    fixture.componentRef.setInput('view', 'list');
    fixture.componentRef.setInput('categoryOptions', [{ id: 'jam', label: 'Jam', count: 2 }]);
    fixture.componentRef.setInput('seriesOptions', [{ id: 'jam', label: 'Series', count: 3 }]);
    const category = vi.fn(), series = vi.fn();
    fixture.componentInstance.categoryToggled.subscribe(category);
    fixture.componentInstance.seriesToggled.subscribe(series);
    fixture.componentInstance.toggleDetail('series:jam');
    expect(series).toHaveBeenCalledWith('jam');
    expect(category).not.toHaveBeenCalled();
  });
});
