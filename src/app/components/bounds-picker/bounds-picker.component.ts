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
import { GoogleMap, MapMarker, MapRectangle } from "@angular/google-maps";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MapsApiService } from "../../services/maps-api.service";
import { EventBoundsSchema } from "../../../db/schemas/EventSchema";

/**
 * Lightweight map picker for an event's geometry. Renders a required,
 * draggable event pin plus an optional editable area rectangle. The area
 * rectangle maps to Event.bounds and is also used by the form to derive
 * the event's area_polygon.
 *
 * Emits the new bounds on every change. Doesn't reuse google-map-2d
 * intentionally — that component is tuned for clustered spots, not
 * geometry editing, and the simple primitives here keep the surface
 * area predictable.
 */
@Component({
  selector: "app-bounds-picker",
  imports: [GoogleMap, MapMarker, MapRectangle, MatButtonModule, MatIconModule],
  templateUrl: "./bounds-picker.component.html",
  styleUrl: "./bounds-picker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoundsPickerComponent implements OnInit {
  private _platformId = inject(PLATFORM_ID);
  mapsApiService = inject(MapsApiService);

  /** Current bounds. Null = no rectangle drawn yet. */
  bounds = input<EventBoundsSchema | null>(null);

  /** Required event pin location. Null only before a new event has one. */
  location = input<{ lat: number; lng: number } | null>(null);

  /** Optional center hint for the initial map view when no bounds set. */
  centerHint = input<{ lat: number; lng: number } | null>(null);

  /** Initial size in degrees for newly-created rectangles (click-to-place). */
  defaultSizeDegrees = input<number>(0.02);

  /** Emits whenever the user moves / resizes / drops a new rectangle. */
  boundsChange = output<EventBoundsSchema | null>();

  /** Emits whenever the required event pin is dragged. */
  locationChange = output<{ lat: number; lng: number }>();

  @ViewChild(GoogleMap) private _googleMap?: GoogleMap;
  @ViewChild(MapRectangle) private _rectangleRef?: MapRectangle;

  /** Internal copy of the bounds — needed because google.maps mutates the
   * underlying object on drag/resize; we re-sync from `bounds_changed`. */
  internalBounds = signal<EventBoundsSchema | null>(null);
  internalLocation = signal<{ lat: number; lng: number }>({
    lat: 47.376888,
    lng: 8.541694,
  });

  /** Live center derived from internal bounds, for the optional helper pin. */
  readonly center = computed(() => {
    const b = this.internalBounds();
    if (!b) return null;
    return {
      lat: (b.north + b.south) / 2,
      lng: (b.east + b.west) / 2,
    };
  });

  /** Map options — minimal UI, disable POI clicks. */
  readonly mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    streetViewControl: false,
    clickableIcons: false,
    mapId: "BOUNDS_PICKER",
  };

  readonly markerOptions: google.maps.MarkerOptions = {
    draggable: true,
    title: $localize`:@@bounds_picker.location_pin:Event pin`,
  };

  /** Rectangle options: editable + draggable so the user can manipulate. */
  readonly rectangleOptions: google.maps.RectangleOptions = {
    fillColor: "#b8c4ff",
    fillOpacity: 0.18,
    strokeColor: "#b8c4ff",
    strokeOpacity: 0.85,
    strokeWeight: 2,
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
      const b = this.bounds();
      if (b) {
        this.internalBounds.set(b);
        this.initialCenter.set({
          lat: (b.north + b.south) / 2,
          lng: (b.east + b.west) / 2,
        });
      } else if (this.centerHint()) {
        this.initialCenter.set(this.centerHint()!);
      }
    });

    effect(() => {
      const location = this.location();
      if (location) {
        this.internalLocation.set(location);
        if (!this.internalBounds()) {
          this.initialCenter.set(location);
        }
      }
    });
  }

  /**
   * Click on an empty map → drop a starter rectangle of size
   * `defaultSizeDegrees` centered on the click. If a rectangle already
   * exists this is a no-op (the rectangle absorbs clicks via its own
   * drag handles).
   */
  onMapClick(event: google.maps.MapMouseEvent): void {
    if (this.internalBounds() || !event.latLng) return;
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    const half = this.defaultSizeDegrees() / 2;
    const next: EventBoundsSchema = {
      north: lat + half,
      south: lat - half,
      east: lng + half,
      west: lng - half,
    };
    this.internalBounds.set(next);
    this.boundsChange.emit(next);
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

  /**
   * Fires when the rectangle is dragged or resized. Google passes the
   * new google.maps.LatLngBounds via the directive; we re-read the
   * current bounds from the rectangle instance.
   */
  onRectangleBoundsChanged(): void {
    const rectangle = this._rectangleRef?.rectangle;
    if (!rectangle) return;
    const gBounds = rectangle.getBounds();
    if (!gBounds) return;
    const ne = gBounds.getNorthEast();
    const sw = gBounds.getSouthWest();
    const next: EventBoundsSchema = {
      north: ne.lat(),
      south: sw.lat(),
      east: ne.lng(),
      west: sw.lng(),
    };
    // Only emit if it actually changed — google emits bounds_changed
    // during drag at high frequency.
    const prev = this.internalBounds();
    if (
      prev &&
      prev.north === next.north &&
      prev.south === next.south &&
      prev.east === next.east &&
      prev.west === next.west
    ) {
      return;
    }
    this.internalBounds.set(next);
    this.boundsChange.emit(next);
  }

  /** Reset the rectangle so the user can click somewhere else to drop a fresh one. */
  clear(): void {
    this.internalBounds.set(null);
    this.boundsChange.emit(null);
  }
}
