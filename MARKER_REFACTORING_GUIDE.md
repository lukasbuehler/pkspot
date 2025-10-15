# Map Component Refactoring Guide

This guide explains how to migrate from your current scattered marker management to the new unified marker system.

## Overview

The refactoring introduces:

1. **MarkerManagerService** - Central service for managing all markers
2. **MapMarkerRendererComponent** - Unified component for rendering markers
3. **Enhanced marker interfaces** - Better type safety and metadata
4. **Simplified templates** - Clean separation of concerns

## Key Benefits

- ✅ **Unified marker management** - All markers handled consistently
- ✅ **Better performance** - Efficient rendering based on zoom levels
- ✅ **Type safety** - Strong typing for different marker types
- ✅ **Easier maintenance** - Centralized logic for marker operations
- ✅ **Flexible rendering** - Easy to add new marker types
- ✅ **Separation of concerns** - Business logic separated from presentation

## Migration Steps

### 1. Update Your MapComponent

Replace your existing map.component.ts with the refactored version:

```typescript
// OLD: Multiple marker inputs and complex template logic
markers: InputSignal<MarkerSchema[]> = input<MarkerSchema[]>([]);

// NEW: Unified marker management via service
private markerManager = inject(MarkerManagerService);
visibleMarkers = this.markerManager.visibleMarkers;
```

### 2. Update Your MapComponent Template

Replace complex marker rendering logic with:

```html
<!-- NEW: Simple, unified marker rendering -->
@for (marker of visibleMarkers(); track marker.id) {
<app-map-marker-renderer [marker]="marker" [zoom]="_zoom()" [isDarkMode]="isDarkMode()" (markerClick)="onMarkerClick({marker: marker, index: $index})" (markerDragEnd)="onMarkerDragEnd($event)"></app-map-marker-renderer>
}
```

### 3. Update SpotMapComponent

```typescript
// OLD: Manual marker management
effect(() => {
  const showAmenities = this.showAmenities();
  const inputMarkers = this.markers();

  if (showAmenities) {
    this._visibleMarkersSubscription = this.visibleAmenityMarkers$.subscribe((markers) => {
      // Complex marker combining logic...
    });
  }
});

// NEW: Clean marker management via service
effect(() => {
  const showAmenities = this.showAmenities();
  const inputMarkers = this.markers();

  this.markerManager.removeMarkersByType("amenity-water");
  this.markerManager.removeMarkersByType("amenity-toilet");

  if (showAmenities) {
    this._visibleMarkersSubscription = this.visibleAmenityMarkers$.subscribe((amenityMarkers) => {
      const waterMarkers = amenityMarkers.filter((m) => m.icons?.includes("water_full"));
      const toiletMarkers = amenityMarkers.filter((m) => m.icons?.includes("wc"));

      if (waterMarkers.length > 0) {
        this.markerManager.addAmenityMarkers(waterMarkers, "amenity-water");
      }
      if (toiletMarkers.length > 0) {
        this.markerManager.addAmenityMarkers(toiletMarkers, "amenity-toilet");
      }
    });
  }

  this.markerManager.removeMarkersByType("custom");
  if (inputMarkers.length > 0) {
    this.markerManager.addCustomMarkers(inputMarkers);
  }
});
```

### 4. Update Event Page for Swiss Jam

```typescript
// event-page.component.ts

export class EventPageComponent {
  private markerManager = inject(MarkerManagerService);

  ngOnInit() {
    // OLD: Pass markers directly to spot-map
    // NEW: Add markers through marker manager
    this.markerManager.addCustomMarkers(this.customMarkers);
  }

  ngOnDestroy() {
    // Clean up markers when leaving the page
    this.markerManager.clearMarkersOfType("custom");
  }
}
```

### 5. Update Amenity/OSM Data Integration

```typescript
// In SpotMapDataManager or similar service

private loadAmenityMarkers(bounds: google.maps.LatLngBounds) {
  this.osmDataService.getDrinkingWaterAndToilets(bounds).subscribe(data => {
    const waterMarkers = data.elements
      .filter(el => el.tags.amenity === 'drinking_water')
      .map((el, index) => MarkerUtils.createAmenityMarker(el, 'water', index));

    const toiletMarkers = data.elements
      .filter(el => el.tags.amenity === 'toilets')
      .map((el, index) => MarkerUtils.createAmenityMarker(el, 'toilet', index));

    this.markerManager.addAmenityMarkers(waterMarkers, 'amenity-water');
    this.markerManager.addAmenityMarkers(toiletMarkers, 'amenity-toilet');
  });
}
```

## File Structure Changes

```
src/app/map/
├── map.component.ts (refactored)
├── map.component.html (simplified)
├── services/
│   └── marker-manager.service.ts (new)
├── components/
│   └── map-marker-renderer.component.ts (new)
└── utils/
    └── marker-utils.ts (new)

src/app/spot-map/
├── spot-map.component.ts (refactored)
└── SpotMapDataManager.ts (updated to use marker manager)
```

## API Changes

### Before (Old API)

```typescript
// Scattered marker management
@Input() markers: MarkerSchema[] = [];
@Input() spots: Spot[] = [];
@Input() dots: SpotClusterDotSchema[] = [];

// Complex template with multiple marker types
@for(marker of markers(); track $index) { /* complex rendering */ }
@for(spot of spots; track $index) { /* different rendering */ }
@for(dot of dots; track $index) { /* another rendering method */ }
```

### After (New API)

```typescript
// Unified marker management
private markerManager = inject(MarkerManagerService);
visibleMarkers = this.markerManager.visibleMarkers;

// Simple template
@for (marker of visibleMarkers(); track marker.id) {
  <app-map-marker-renderer [marker]="marker" ... />
}

// Clean programmatic API
this.markerManager.addSpotsAsMarkers(spots);
this.markerManager.addClusterDotsAsMarkers(dots);
this.markerManager.addCustomMarkers(markers);
```

## Migration Checklist

- [ ] Install new marker manager service
- [ ] Update MapComponent to use MarkerManagerService
- [ ] Replace complex marker template logic with MapMarkerRendererComponent
- [ ] Update SpotMapComponent to use marker manager for amenities
- [ ] Update EventPageComponent to use marker manager for custom markers
- [ ] Update any other components that use markers
- [ ] Test all marker types render correctly
- [ ] Test marker interactions (click, drag)
- [ ] Test zoom-based visibility
- [ ] Verify performance improvements

## Breaking Changes

1. **Marker Input Removed**: The `markers` input on MapComponent is removed. Use MarkerManagerService instead.
2. **Event Changes**: Marker click events now provide `EnhancedMarkerSchema` instead of index-based access.
3. **Rendering Logic**: Custom marker rendering logic should be moved to MarkerManagerService configuration.

## Backward Compatibility

To maintain backward compatibility during migration:

```typescript
// Temporary adapter in MapComponent
@Input() set markers(markers: MarkerSchema[]) {
  this.markerManager.removeMarkersByType('custom');
  if (markers.length > 0) {
    this.markerManager.addCustomMarkers(markers);
  }
}
```

## Testing

1. **Unit Tests**: Test MarkerManagerService methods
2. **Integration Tests**: Test marker rendering at different zoom levels
3. **E2E Tests**: Test marker interactions in real scenarios
4. **Performance Tests**: Verify improved rendering performance

## Future Enhancements

With this new architecture, you can easily:

- Add new marker types (e.g., events, parking, food)
- Implement marker clustering for performance
- Add marker animations and effects
- Create custom marker rendering styles
- Implement advanced filtering and search
