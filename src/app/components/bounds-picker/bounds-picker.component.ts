import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  ViewChild,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { PLATFORM_ID } from "@angular/core";
import { GoogleMap, MapMarker, MapPolygon } from "@angular/google-maps";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MapsApiService } from "../../services/maps-api.service";
import { EventBoundsSchema } from "../../../db/schemas/EventSchema";

export type MapPickerLocation = { lat: number; lng: number };

/** A read-only or draggable point rendered in the event map editor. */
export interface MapPickerPoint {
  id: string;
  title: string;
  location: MapPickerLocation | null;
}

/** An event-only Spot which can also own a small editable map area. */
export interface MapPickerInlineSpot extends MapPickerPoint {
  areaPath: MapPickerLocation[] | null;
}

/**
 * Lightweight map picker for an event's geometry. Renders a required,
 * draggable event pin plus editable event-only markers and areas. Event bounds
 * are server-owned; this component only uses the bounds input to frame
 * existing event context when no area exists yet.
 *
 * Emits the new area path on every change. Doesn't reuse google-map-2d
 * intentionally — that component is tuned for clustered spots, not
 * geometry editing, and the simple primitives here keep the surface
 * area predictable.
 */
@Component({
  selector: "app-bounds-picker",
  imports: [GoogleMap, MapMarker, MapPolygon, MatButtonModule, MatIconModule],
  templateUrl: "./bounds-picker.component.html",
  styleUrl: "./bounds-picker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoundsPickerComponent implements OnInit, OnDestroy {
  private _platformId = inject(PLATFORM_ID);
  mapsApiService = inject(MapsApiService);

  /** Server-derived event context bounds. Null = frame around the location. */
  bounds = input<EventBoundsSchema | null>(null);

  /** Current editable area path. Null = no event area drawn yet. */
  areaPath = input<Array<{ lat: number; lng: number }> | null>(null);

  /** Required event pin location. Null only before a new event has one. */
  location = input<{ lat: number; lng: number } | null>(null);

  /** Optional center hint for the initial map view when no bounds set. */
  centerHint = input<{ lat: number; lng: number } | null>(null);

  /** Initial size in degrees for newly-created rectangles (click-to-place). */
  defaultSizeDegrees = input<number>(0.02);

  /** Canonical Spots associated with the event. They remain read-only here. */
  eventSpots = input<readonly MapPickerPoint[]>([]);

  /** Event-only custom markers. Their location can be changed by dragging. */
  customMarkers = input<readonly MapPickerPoint[]>([]);

  /** Event-only Spots and their optional editable areas. */
  inlineSpots = input<readonly MapPickerInlineSpot[]>([]);

  /** A temporary Spot whose area should be placed by the next map click. */
  inlineSpotAreaPlacementId = input<string | null>(null);

  /** Emits whenever the user moves / reshapes / creates the event area. */
  areaChange = output<Array<{ lat: number; lng: number }> | null>();

  /** Emits whenever the required event pin is dragged. */
  locationChange = output<MapPickerLocation>();

  customMarkerLocationChange = output<{
    id: string;
    location: MapPickerLocation;
  }>();
  inlineSpotLocationChange = output<{
    id: string;
    location: MapPickerLocation;
  }>();
  inlineSpotAreaChange = output<{
    id: string;
    areaPath: MapPickerLocation[] | null;
  }>();
  inlineSpotAreaPlacementHandled = output<void>();

  @ViewChild(GoogleMap) private _googleMap?: GoogleMap;
  @ViewChild(MapPolygon) private _polygonRef?: MapPolygon;
  private _polygon?: google.maps.Polygon;
  private _pathListeners: google.maps.MapsEventListener[] = [];
  private _inlinePolygons = new Map<string, google.maps.Polygon>();
  private _inlinePathListeners = new Map<
    string,
    google.maps.MapsEventListener[]
  >();

  internalAreaPath = signal<Array<{ lat: number; lng: number }> | null>(null);
  internalLocation = signal<{ lat: number; lng: number }>({
    lat: 47.376888,
    lng: 8.541694,
  });

  /** Map options — minimal UI, disable POI clicks. */
  readonly mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    streetViewControl: false,
    clickableIcons: false,
    mapTypeId: "hybrid",
    mapId: "BOUNDS_PICKER",
  };

  readonly markerOptions: google.maps.MarkerOptions = {
    draggable: true,
    title: $localize`:@@bounds_picker.location_pin:Event pin`,
  };
  readonly eventSpotMarkerOptions: google.maps.MarkerOptions = {
    clickable: false,
    label: "S",
    zIndex: 10,
  };
  readonly customMarkerOptions: google.maps.MarkerOptions = {
    draggable: true,
    label: "M",
    zIndex: 20,
  };
  readonly inlineSpotMarkerOptions: google.maps.MarkerOptions = {
    draggable: true,
    label: "T",
    zIndex: 30,
  };

  /** Area options: high-contrast on satellite imagery, editable + draggable. */
  readonly areaPolygonOptions: google.maps.PolygonOptions = {
    fillColor: "#4f7cff",
    fillOpacity: 0.16,
    strokeColor: "#ffffff",
    strokeOpacity: 1,
    strokeWeight: 3,
    editable: true,
    draggable: true,
    clickable: false,
    zIndex: 5,
  };
  readonly inlineSpotPolygonOptions: google.maps.PolygonOptions = {
    fillOpacity: 0.1,
    strokeOpacity: 1,
    strokeWeight: 2,
    editable: true,
    draggable: true,
    clickable: false,
    zIndex: 4,
  };

  /** Map zoom that frames a typical event area on first render. */
  initialZoom = signal<number>(13);
  initialCenter = signal<{ lat: number; lng: number }>({
    lat: 47.376888,
    lng: 8.541694,
  });

  ngOnInit(): void {
    // Sync the input bounds into the internal signal on first load and
    // any subsequent parent-driven change (e.g., a form reset).
    if (!isPlatformBrowser(this._platformId)) return;
    if (!this.mapsApiService.isApiLoaded()) {
      this.mapsApiService.loadGoogleMapsApi();
    }
  }

  constructor() {
    effect(() => {
      const path = this.areaPath();
      const boundsFallback = this.bounds();
      const nextPath = path && path.length >= 3 ? path : null;

      if (nextPath) {
        this.internalAreaPath.set(nextPath);
        this.initialCenter.set(pathCenter(nextPath));
      } else if (boundsFallback) {
        this.internalAreaPath.set(null);
        this.initialCenter.set(pathCenter(boundsToPath(boundsFallback)));
      } else if (this.centerHint()) {
        this.internalAreaPath.set(null);
        this.initialCenter.set(this.centerHint()!);
      } else {
        this.internalAreaPath.set(null);
      }
    });

    effect(() => {
      const location = this.location();
      if (location) {
        this.internalLocation.set(location);
        if (!this.internalAreaPath()) {
          this.initialCenter.set(location);
        }
      }
    });

    effect(() => {
      const activeIds = new Set(this.inlineSpots().map((spot) => spot.id));
      for (const id of this._inlinePolygons.keys()) {
        if (!activeIds.has(id)) this._clearInlinePolygon(id);
      }
    });
  }

  /**
   * Click on an empty map → drop a starter area of size
   * `defaultSizeDegrees` centered on the click. If an area already exists
   * this is a no-op.
   */
  onMapClick(event: google.maps.MapMouseEvent): void {
    if (!event.latLng) return;
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    const half = this.defaultSizeDegrees() / 2;
    const next = boundsToPath({
      north: lat + half,
      south: lat - half,
      east: lng + half,
      west: lng - half,
    });
    const inlineSpotId = this.inlineSpotAreaPlacementId();
    if (inlineSpotId) {
      this.inlineSpotAreaChange.emit({ id: inlineSpotId, areaPath: next });
      this.inlineSpotAreaPlacementHandled.emit();
      return;
    }
    if (this.internalAreaPath()) return;
    this.internalAreaPath.set(next);
    this.areaChange.emit(next);
  }

  onLocationDragEnd(event: google.maps.MapMouseEvent): void {
    if (!event.latLng) return;
    const next = {
      lat: event.latLng.lat(),
      lng: event.latLng.lng(),
    };
    this.internalLocation.set(next);
    this.locationChange.emit(next);
  }

  onCustomMarkerDragEnd(
    id: string,
    event: google.maps.MapMouseEvent,
  ): void {
    const location = mapMouseLocation(event);
    if (location) this.customMarkerLocationChange.emit({ id, location });
  }

  onInlineSpotDragEnd(
    id: string,
    event: google.maps.MapMouseEvent,
  ): void {
    const location = mapMouseLocation(event);
    if (location) this.inlineSpotLocationChange.emit({ id, location });
  }

  onPolygonInitialized(polygon: google.maps.Polygon): void {
    this._polygon = polygon;
    this._pathListeners.forEach((listener) => listener.remove());
    const path = polygon.getPath();
    this._pathListeners = [
      path.addListener("insert_at", () => this.onPolygonChanged()),
      path.addListener("remove_at", () => this.onPolygonChanged()),
      path.addListener("set_at", () => this.onPolygonChanged()),
    ];
  }

  onPolygonChanged(): void {
    const polygon = this._polygon ?? this._polygonRef?.polygon;
    if (!polygon) return;
    const path = polygon.getPath();
    const next: Array<{ lat: number; lng: number }> = [];
    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i);
      next.push({ lat: point.lat(), lng: point.lng() });
    }
    if (next.length < 3) return;
    this.internalAreaPath.set(next);
    this.areaChange.emit(next);
  }

  onInlineSpotPolygonInitialized(id: string, polygon: google.maps.Polygon): void {
    this._clearInlinePolygon(id);
    this._inlinePolygons.set(id, polygon);
    const path = polygon.getPath();
    this._inlinePathListeners.set(id, [
      path.addListener("insert_at", () => this.onInlineSpotPolygonChanged(id)),
      path.addListener("remove_at", () => this.onInlineSpotPolygonChanged(id)),
      path.addListener("set_at", () => this.onInlineSpotPolygonChanged(id)),
    ]);
  }

  onInlineSpotPolygonChanged(id: string): void {
    const polygon = this._inlinePolygons.get(id);
    if (!polygon) return;
    const areaPath = polygonPath(polygon);
    if (areaPath.length < 3) return;
    this.inlineSpotAreaChange.emit({ id, areaPath });
  }

  currentAreaPath(): Array<{ lat: number; lng: number }> | null {
    const polygon = this._polygon ?? this._polygonRef?.polygon;
    if (!polygon) return this.internalAreaPath();
    const path = polygon.getPath();
    const next: Array<{ lat: number; lng: number }> = [];
    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i);
      next.push({ lat: point.lat(), lng: point.lng() });
    }
    return next.length >= 3 ? next : null;
  }

  /** Reset the area so the user can click somewhere else to drop a fresh one. */
  clear(): void {
    this.internalAreaPath.set(null);
    this.areaChange.emit(null);
  }

  ngOnDestroy(): void {
    this._pathListeners.forEach((listener) => listener.remove());
    for (const id of this._inlinePolygons.keys()) this._clearInlinePolygon(id);
  }

  private _clearInlinePolygon(id: string): void {
    this._inlinePathListeners.get(id)?.forEach((listener) => listener.remove());
    this._inlinePathListeners.delete(id);
    this._inlinePolygons.delete(id);
  }
}

function mapMouseLocation(event: google.maps.MapMouseEvent): MapPickerLocation | null {
  if (!event.latLng) return null;
  return { lat: event.latLng.lat(), lng: event.latLng.lng() };
}

function polygonPath(polygon: google.maps.Polygon): MapPickerLocation[] {
  const path = polygon.getPath();
  const next: MapPickerLocation[] = [];
  for (let i = 0; i < path.getLength(); i++) {
    const point = path.getAt(i);
    next.push({ lat: point.lat(), lng: point.lng() });
  }
  return next;
}

function boundsToPath(
  bounds: EventBoundsSchema,
): Array<{ lat: number; lng: number }> {
  return [
    { lat: bounds.north, lng: bounds.west },
    { lat: bounds.north, lng: bounds.east },
    { lat: bounds.south, lng: bounds.east },
    { lat: bounds.south, lng: bounds.west },
  ];
}

function pathCenter(path: Array<{ lat: number; lng: number }>): {
  lat: number;
  lng: number;
} {
  const bounds = path.reduce(
    (acc, point) => ({
      north: Math.max(acc.north, point.lat),
      south: Math.min(acc.south, point.lat),
      east: Math.max(acc.east, point.lng),
      west: Math.min(acc.west, point.lng),
    }),
    {
      north: Number.NEGATIVE_INFINITY,
      south: Number.POSITIVE_INFINITY,
      east: Number.NEGATIVE_INFINITY,
      west: Number.POSITIVE_INFINITY,
    },
  );
  return {
    lat: (bounds.north + bounds.south) / 2,
    lng: (bounds.east + bounds.west) / 2,
  };
}
