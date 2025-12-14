export interface VisibleViewport {
  zoom: number;
  bbox: { north: number; south: number; west: number; east: number };
}

export abstract class MapBase {
  abstract focusOnLocation(
    location: google.maps.LatLngLiteral | google.maps.LatLng,
    zoom?: number
  ): void;

  abstract setCenter(center: google.maps.LatLngLiteral): void;
  abstract setZoom(zoom: number): void;

  // Called by map implementations when the viewport (bounds+zoom) changed
  abstract onViewportChanged(viewport: VisibleViewport): void;

  protected expandBbox(
    bbox: VisibleViewport["bbox"],
    margin = 0.2
  ): VisibleViewport["bbox"] {
    const latSpan = bbox.north - bbox.south;
    const lngSpan = bbox.east - bbox.west;
    return {
      north: bbox.north + latSpan * margin,
      south: bbox.south - latSpan * margin,
      west: bbox.west - lngSpan * margin,
      east: bbox.east + lngSpan * margin,
    };
  }
}
