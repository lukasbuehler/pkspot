import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
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

/**
 * Lightweight map picker for an event's geometry. Renders a required,
 * draggable event pin plus an optional editable area polygon. The form
 * derives Event.bounds from the polygon path.
 *
 * Emits the new bounds on every change. Doesn't reuse google-map-2d
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
export class BoundsPickerComponent implements OnInit {
  private _platformId = inject(PLATFORM_ID);
  mapsApiService = inject(MapsApiService);

  /** Current bounds. Null = no rectangle drawn yet. */
  bounds = input<EventBoundsSchema | null>(null);

  /** Current editable area path. Null = no event area drawn yet. */
  areaPath = input<Array<{ lat: number; lng: number }> | null>(null);

  /** Required event pin location. Null only before a new event has one. */
  location = input<{ lat: number; lng: number } | null>(null);

  /** Optional center hint for the initial map view when no bounds set. */
  centerHint = input<{ lat: number; lng: number } | null>(null);

  /** Initial size in degrees for newly-created rectangles (click-to-place). */
  defaultSizeDegrees = input<number>(0.02);

  /** Emits whenever the user moves / reshapes / creates the event area. */
  areaChange = output<Array<{ lat: number; lng: number }> | null>();

  /** Emits whenever the required event pin is dragged. */
  locationChange = output<{ lat: number; lng: number }>();

  @ViewChild(GoogleMap) private _googleMap?: GoogleMap;
  @ViewChild(MapPolygon) private _polygonRef?: MapPolygon;
  private _pathListeners: google.maps.MapsEventListener[] = [];

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
    mapTypeId: "satellite",
    mapId: "BOUNDS_PICKER",
  };

  readonly markerOptions: google.maps.MarkerOptions = {
    draggable: true,
    title: $localize`:@@bounds_picker.location_pin:Event pin`,
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
      const nextPath =
        path && path.length >= 3
          ? path
          : boundsFallback
          ? boundsToPath(boundsFallback)
          : null;

      if (nextPath) {
        this.internalAreaPath.set(nextPath);
        this.initialCenter.set(pathCenter(nextPath));
      } else if (this.centerHint()) {
        this.initialCenter.set(this.centerHint()!);
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
  }

  /**
   * Click on an empty map → drop a starter area of size
   * `defaultSizeDegrees` centered on the click. If an area already exists
   * this is a no-op.
   */
  onMapClick(event: google.maps.MapMouseEvent): void {
    if (this.internalAreaPath() || !event.latLng) return;
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    const half = this.defaultSizeDegrees() / 2;
    const next = boundsToPath({
      north: lat + half,
      south: lat - half,
      east: lng + half,
      west: lng - half,
    });
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

  onPolygonInitialized(polygon: google.maps.Polygon): void {
    this._pathListeners.forEach((listener) => listener.remove());
    const path = polygon.getPath();
    this._pathListeners = [
      path.addListener("insert_at", () => this.onPolygonChanged()),
      path.addListener("remove_at", () => this.onPolygonChanged()),
      path.addListener("set_at", () => this.onPolygonChanged()),
    ];
  }

  onPolygonChanged(): void {
    const polygon = this._polygonRef?.polygon;
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

  /** Reset the area so the user can click somewhere else to drop a fresh one. */
  clear(): void {
    this.internalAreaPath.set(null);
    this.areaChange.emit(null);
  }
}

function boundsToPath(bounds: EventBoundsSchema): Array<{ lat: number; lng: number }> {
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
