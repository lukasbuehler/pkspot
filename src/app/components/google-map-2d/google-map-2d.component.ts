import {
  OnInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  QueryList,
  ViewChild,
  ViewChildren,
  computed,
  input,
  InputSignal,
  Signal,
  model,
  ModelSignal,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  signal,
  effect,
  AfterViewInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";

import {
  GoogleMap,
  MapPolygon,
  MapCircle,
  MapAdvancedMarker,
  MapRectangle,
} from "@angular/google-maps";
import { Subscription } from "rxjs";
import { environment } from "../../../environments/environment";
import { MapsApiService } from "../../services/maps-api.service";
import { ConsentService } from "../../services/consent.service";
import { GeoPoint } from "firebase/firestore";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { trigger, transition, style, animate } from "@angular/animations";
import { MarkerComponent } from "../marker/marker.component";
import { getMapMarkerPriority } from "../map/markers/map-marker.model";
import type { MarkerSchema } from "../map/markers/map-marker.model";
import { getSpotMarkerPriority } from "../map/markers/spot-marker-priority";
import { MapHelpers } from "../../../scripts/MapHelpers";
import { MapBase, VisibleViewport } from "../maps/map-base";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import {
  LocalSpotChallenge,
  SpotChallenge,
  SpotChallengePreview,
} from "../../../db/models/SpotChallenge";
import { AnyMedia } from "../../../db/models/Media";
import { ThemeService } from "../../services/theme.service";
import { HighlightMarkerComponent } from "../highlight-marker/highlight-marker.component";
import { AdvancedMapMarkerComponent } from "../map/advanced-map-marker/advanced-map-marker.component";
import { EventDotMarkerComponent } from "../map/event-dot-marker/event-dot-marker.component";
import { GeolocationService } from "../../services/geolocation.service";
import { SpotPreviewMarkerComponent } from "../spot-preview-marker/spot-preview-marker.component";
import {
  MapBoundsOverlay,
  MapCircleOverlay,
  MapFeatureBoundaryOverlay,
  MapPolygonOverlay,
  MapPointMarker,
} from "../maps/map-overlays";
import {
  filterEventSpotCollisions,
} from "./map-marker-collision-filter";
import type {
  MapMarkerCollisionCandidate,
  MapMarkerCollisionLayout,
} from "./map-marker-collision-filter";

function enumerateTileRangeX(
  start: number,
  end: number,
  zoom: number
): number[] {
  const tileCount = 1 << zoom;
  const normalize = (value: number) => {
    const mod = value % tileCount;
    return mod < 0 ? mod + tileCount : mod;
  };

  const from = normalize(start);
  const to = normalize(end);
  const range: number[] = [];

  range.push(from);

  let current = from;
  const safetyLimit = tileCount + 1;
  while (current !== to && range.length <= safetyLimit) {
    current = (current + 1) % tileCount;
    range.push(current);
  }

  return range;
}

interface SpotPreviewAreaOverlay {
  id: string;
  spot: SpotPreviewData;
  path?: google.maps.LatLngLiteral[];
  center?: google.maps.LatLngLiteral;
  radiusM?: number;
}

const SPOT_AREA_MIN_ZOOM = 14;
const EVENT_MARKER_COLLISION_SIZE_PX = 48;
const SPOT_MARKER_COLLISION_WIDTH_PX = 124;
const SPOT_MARKER_COLLISION_HEIGHT_PX = 52;
const COMMUNITY_MARKER_COLLISION_SIZE_PX = 16;

interface MarkerCollisionLayoutCache {
  highlightedSpots: SpotPreviewData[];
  pointMarkers: MapPointMarker[];
  regularSpots: (LocalSpot | Spot)[];
  zoom: number;
  layout: MapMarkerCollisionLayout;
}

interface VisibleRegularSpotMarkersCache {
  spots: (LocalSpot | Spot)[];
  selectedSpot: LocalSpot | Spot | null;
  isEditing: boolean;
  shouldRenderRegularSpotMarkers: boolean;
  visibleSpots: (LocalSpot | Spot)[];
}

export interface TilesObject {
  zoom: number;
  tiles: { x: number; y: number }[];
  ne: { x: number; y: number };
  sw: { x: number; y: number };
  center?: google.maps.LatLngLiteral;
  viewportBounds?: google.maps.LatLngBoundsLiteral;
}

@Component({
  selector: "app-google-map-2d",
  templateUrl: "./google-map-2d.component.html",
  styleUrls: ["./google-map-2d.component.scss"],
  imports: [
    GoogleMap,
    MapCircle,
    MapPolygon,
    MapRectangle,
    MapAdvancedMarker,
    MarkerComponent,
    SpotPreviewCardComponent,
    HighlightMarkerComponent,
    AdvancedMapMarkerComponent,
    EventDotMarkerComponent,
    SpotPreviewMarkerComponent,
    MatSnackBarModule,
  ],
  animations: [
    trigger("fadeInOut", [
      transition(":enter", [
        style({ opacity: 0, scale: 0.8 }),
        animate("0.3s ease-out", style({ opacity: 1, scale: 1 })),
      ]),
      transition(":leave", [
        style({ opacity: 1, scale: 1 }),
        animate("0.3s ease-in", style({ opacity: 0, scale: 0.8 })),
      ]),
    ]),
  ],
  host: {
    "[class.with-bottom-offset]": "bottomSheetOffset",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleMap2dComponent
  extends MapBase
  implements OnChanges, AfterViewInit, OnDestroy
{
  private static readonly ZOOM_SYNC_EPSILON = 0.5;
  private _isInternalZoomChange = false;
  private _hasInitializedNativeMap = false;
  private _hasStartedAutoLocationWatch = false;

  readonly autoStartLocationWatch = environment.features.checkIns;
  // @ViewChildren(MapPolygon) spotPolygons: QueryList<MapPolygon> | undefined;
  // @ViewChildren(MapPolygon, { read: ElementRef })
  polygonElements: QueryList<ElementRef> | undefined;

  public googleMap: GoogleMap | undefined;

  @ViewChild("googleMap") set googleMapSetter(content: GoogleMap) {
    if (content) {
      if (content === this.googleMap && this._hasInitializedNativeMap) {
        return;
      }

      this.googleMap = content;
      this.onMapReady();
    }
  }
  @ViewChild("selectedSpotMarkerNode") selectedSpotMarkerNode: Node | undefined;
  @ViewChild("selectedChallengeMarker") selectedChallengeMarker:
    | MapAdvancedMarker
    | undefined;
  @ViewChild("selectedSpotPolygon", { static: false, read: MapPolygon })
  selectedSpotPolygon: MapPolygon | undefined;

  // add math function to markup
  sqrt = Math.sqrt;
  Math = Math; // expose Math for template usage
  // Expose the global Google namespace to the template to satisfy Angular's
  // template type-checker where expressions reference `google.maps.*`.
  // Use `any` because the global may be undefined at build-time.
  readonly google: any =
    typeof window !== "undefined" ? (window as any).google : undefined;

  focusZoom = input<number>(17);
  isDebug = input<boolean>(false);
  showSpotPreview = input<boolean>(false);
  isEditing = input<boolean>(false);

  headingIsNotNorth = signal<boolean>(false);

  // Deprecated: use global theme via ThemeService instead. Kept for backward-compat; if bound, it overrides global.
  isDarkMode = input<boolean | null | undefined>(null);
  markers: InputSignal<MarkerSchema[]> = input<MarkerSchema[]>([]);
  priorityMarkers: InputSignal<MarkerSchema[]> = input<MarkerSchema[]>([]);
  // Optional parallel spot IDs for markers to allow opening a spot on marker click.
  @Input() markerSpotIds: (SpotId | null)[] | null = null;

  private _center: google.maps.LatLngLiteral = {
    lat: 48.6270939,
    lng: 2.4305363,
  };
  @Input() set center(coords: google.maps.LatLngLiteral) {
    this._center = coords;
    if (this.googleMap) {
      this.googleMap.panTo(this._center);
    }
  }
  @Output() centerChange = new EventEmitter<google.maps.LatLngLiteral>();
  get center(): google.maps.LatLngLiteral {
    return this._center;
  }

  _zoom = signal<number>(4);
  private readonly _communityVisualZoom = signal<number>(4);
  private readonly COMMUNITY_VISUAL_ZOOM_STEP = 0.1;
  private readonly COMMUNITY_CIRCLE_CLICK_MAX_DIAMETER_PX = 320;

  @Input() set zoom(newZoom: number) {
    this._setCommunityVisualZoom(newZoom);

    if (this._isInternalZoomChange) {
      this._zoom.set(newZoom);
      return;
    }

    this._zoom.set(newZoom);
    if (this.googleMap?.googleMap) {
      const currentZoom = this.googleMap.googleMap.getZoom();
      if (
        currentZoom === undefined ||
        Math.abs(currentZoom - newZoom) >
          GoogleMap2dComponent.ZOOM_SYNC_EPSILON
      ) {
        this.googleMap.googleMap.setZoom(newZoom);
      }
    }
  }
  @Output() zoomChange = new EventEmitter<number>();
  get zoom() {
    return this._zoom();
  }
  setZoom(newZoom: number) {
    this.zoom = newZoom;
    this.zoomChange.emit(this._zoom());
  }

  setCenter(center: google.maps.LatLngLiteral): void {
    this.center = center;
  }

  onViewportChanged(_viewport: VisibleViewport): void {
    // default no-op. Implementations may override this to react to viewport changes.
  }

  getAndEmitChangedZoom() {
    if (!this.googleMap) return;
    const mapZoom = this.googleMap.getZoom();
    if (typeof mapZoom !== "number") return;

    this._setCommunityVisualZoom(mapZoom);

    const newZoom = Math.floor(mapZoom);
    if (newZoom === this._zoom()) return;

    this._debugMapEvent("zoomChanged", { zoom: newZoom, mapZoom });
    this._isInternalZoomChange = true;
    this._zoom.set(newZoom);
    this.zoomChange.emit(newZoom);
    // Reset flag after change detection cycle
    setTimeout(() => {
      this._isInternalZoomChange = false;
    }, 0);
  }

  private _setCommunityVisualZoom(mapZoom: number): void {
    const steppedZoomUnits = Math.round(
      mapZoom / this.COMMUNITY_VISUAL_ZOOM_STEP,
    );
    const currentZoomUnits = Math.round(
      this._communityVisualZoom() / this.COMMUNITY_VISUAL_ZOOM_STEP,
    );

    if (steppedZoomUnits === currentZoomUnits) {
      return;
    }

    this._communityVisualZoom.set(
      steppedZoomUnits * this.COMMUNITY_VISUAL_ZOOM_STEP,
    );
  }

  onMapClick(event: google.maps.MapMouseEvent | google.maps.IconMouseEvent) {
    if (!event.latLng) return;

    // Check if it's a POI click (IconMouseEvent has placeId)
    const placeId = (event as google.maps.IconMouseEvent).placeId;

    if (placeId) {
      // Prevent Google Maps POIs from opening a default info window or app panel.
      event.stop();
      return;
    }

    this.mapClick.emit(event.latLng.toJSON());
  }

  @Output() boundsChange = new EventEmitter<google.maps.LatLngBounds>();
  @Output() visibleTilesChange = new EventEmitter<TilesObject>();
  @Output() visibleViewportChange = new EventEmitter<VisibleViewport>();
  @Output() mapClick = new EventEmitter<google.maps.LatLngLiteral>();
  @Output() poiClick = new EventEmitter<{
    location: google.maps.LatLngLiteral;
    placeId: string;
  }>();
  @Output() spotClick = new EventEmitter<
    LocalSpot | Spot | SpotPreviewData | SpotId
  >();
  @Output() polygonChanged = new EventEmitter<{
    spotId: string;
    path: google.maps.LatLngLiteral[][];
  }>();
  @Output() hasGeolocationChange = new EventEmitter<boolean>();
  @Output() markerClickEvent = new EventEmitter<number>();

  @Input() spots: (LocalSpot | Spot)[] = [];

  private readonly _highlightedSpotsSignal = signal<SpotPreviewData[]>([]);

  @Input()
  set highlightedSpots(value: SpotPreviewData[] | null | undefined) {
    this._highlightedSpotsSignal.set(value ? [...value] : []);
  }
  get highlightedSpots(): SpotPreviewData[] {
    return this._highlightedSpotsSignal();
  }
  // Optional mapping from marker index -> SpotId to open spot directly on marker click.

  /**
   * Get highlighted spots for display, excluding the currently selected spot.
   *
   * Note: This method intentionally does NOT filter by viewport bounds to prevent
   * DOM element destruction/recreation issues. When markers are filtered by bounds,
   * Angular removes and recreates components as they enter/leave the viewport,
   * causing Advanced Markers to lose their HTML content references.
   *
   * Google Maps efficiently handles off-screen markers natively, and the
   * SpotMapDataManager already filters spots by visible tiles, so additional
   * bounds filtering here is unnecessary and problematic.
   *
   * @returns Array of SpotPreviewData to display as highlight markers
   */
  getVisibleHighlightedSpots(): SpotPreviewData[] {
    const spots = this._getVisibleHighlightedSpotPreviews();
    const hiddenSpotIds = this._getMarkerCollisionLayout().hiddenSpotIds;

    if (hiddenSpotIds.size === 0) {
      return spots;
    }

    return spots.filter(
      (spot) => !hiddenSpotIds.has(this._getSpotPreviewCollisionId(spot)),
    );
  }

  getVisibleSpotMarkers(): (LocalSpot | Spot)[] {
    const spots = this._getVisibleRegularSpotMarkers();
    const hiddenSpotIds = this._getMarkerCollisionLayout().hiddenSpotIds;

    if (hiddenSpotIds.size === 0) {
      return spots;
    }

    return spots.filter(
      (spot) => !hiddenSpotIds.has(this._getSpotModelCollisionId(spot)),
    );
  }

  getVisiblePointMarkers(): MapPointMarker[] {
    const { hiddenCommunityIds, hiddenEventIds } =
      this._getMarkerCollisionLayout();

    if (hiddenEventIds.size === 0 && hiddenCommunityIds.size === 0) {
      return this.pointMarkers;
    }

    return this.pointMarkers.filter(
      (marker) =>
        (!this._isEventCollisionMarker(marker) ||
          !hiddenEventIds.has(marker.id)) &&
        (!this._isCommunityCollisionMarker(marker) ||
          !hiddenCommunityIds.has(marker.id)),
    );
  }

  private _getVisibleHighlightedSpotPreviews(): SpotPreviewData[] {
    const spots = this._highlightedSpotsSignal();
    if (spots.length === 0) {
      return spots;
    }

    const selectedSpot = this.selectedSpot();
    const selectedSpotId =
      selectedSpot && "id" in selectedSpot ? selectedSpot.id : null;

    // Only filter out the selected spot - don't filter by bounds
    if (selectedSpotId) {
      return spots.filter((spot) => spot.id !== selectedSpotId);
    }

    return spots;
  }

  private _getVisibleRegularSpotMarkers(): (LocalSpot | Spot)[] {
    const shouldRenderRegularSpotMarkers =
      ((this.zoom >= 16 && this.showSpotPreview()) ||
        this.showVisibleSpotPins()) &&
      !this.hideRegularSpotPins();
    const selectedSpot = this.selectedSpot();
    const isEditing = this.isEditing();

    if (!shouldRenderRegularSpotMarkers) {
      return [];
    }

    if (
      this._visibleRegularSpotMarkersCache &&
      this._visibleRegularSpotMarkersCache.spots === this.spots &&
      this._visibleRegularSpotMarkersCache.selectedSpot === selectedSpot &&
      this._visibleRegularSpotMarkersCache.isEditing === isEditing &&
      this._visibleRegularSpotMarkersCache.shouldRenderRegularSpotMarkers ===
        shouldRenderRegularSpotMarkers
    ) {
      return this._visibleRegularSpotMarkersCache.visibleSpots;
    }

    const visibleSpots = this.spots.filter(
      (spot) =>
        !this.isSelectedSpotBeingEdited(spot) && !this.isSameAsSelectedSpot(spot),
    );

    this._visibleRegularSpotMarkersCache = {
      spots: this.spots,
      selectedSpot,
      isEditing,
      shouldRenderRegularSpotMarkers,
      visibleSpots,
    };

    return visibleSpots;
  }

  private _getMarkerCollisionLayout(): MapMarkerCollisionLayout {
    const highlightedSpots = this._getVisibleHighlightedSpotPreviews();
    const regularSpots = this._getVisibleRegularSpotMarkers();
    const zoom = this._getMarkerCollisionZoom();

    if (
      this._markerCollisionLayoutCache &&
      this._markerCollisionLayoutCache.highlightedSpots === highlightedSpots &&
      this._markerCollisionLayoutCache.regularSpots === regularSpots &&
      this._markerCollisionLayoutCache.pointMarkers === this.pointMarkers &&
      this._markerCollisionLayoutCache.zoom === zoom
    ) {
      return this._markerCollisionLayoutCache.layout;
    }

    const layout = filterEventSpotCollisions(
      [
        ...this._getEventCollisionCandidates(zoom),
        ...this._getCommunityCollisionCandidates(zoom),
        ...this._getSpotPreviewCollisionCandidates(highlightedSpots),
        ...this._getSpotModelCollisionCandidates(regularSpots),
      ],
      zoom,
    );

    this._markerCollisionLayoutCache = {
      highlightedSpots,
      pointMarkers: this.pointMarkers,
      regularSpots,
      zoom,
      layout,
    };

    return layout;
  }

  private _getEventCollisionCandidates(
    zoom: number,
  ): MapMarkerCollisionCandidate[] {
    return this.pointMarkers
      .filter(
        (marker) =>
          this._isEventCollisionMarker(marker) &&
          this._isPointMarkerVisibleAtZoom(marker, zoom),
      )
      .map((marker): MapMarkerCollisionCandidate => ({
        id: marker.id,
        kind: "event",
        location: marker.location,
        priority: getMapMarkerPriority(marker),
        widthPx: EVENT_MARKER_COLLISION_SIZE_PX,
        heightPx: EVENT_MARKER_COLLISION_SIZE_PX,
        anchor: "center",
      }));
  }

  private _getCommunityCollisionCandidates(
    zoom: number,
  ): MapMarkerCollisionCandidate[] {
    return this.pointMarkers
      .filter(
        (marker) =>
          this._isCommunityCollisionMarker(marker) &&
          this._isPointMarkerVisibleAtZoom(marker, zoom),
      )
      .map((marker): MapMarkerCollisionCandidate => ({
        id: marker.id,
        kind: "community",
        location: marker.location,
        priority: getMapMarkerPriority(marker),
        widthPx: COMMUNITY_MARKER_COLLISION_SIZE_PX,
        heightPx: COMMUNITY_MARKER_COLLISION_SIZE_PX,
        anchor: "center",
      }));
  }

  private _getSpotPreviewCollisionCandidates(
    spots: readonly SpotPreviewData[],
  ): MapMarkerCollisionCandidate[] {
    return spots.flatMap((spot): MapMarkerCollisionCandidate[] => {
      if (!spot.location) {
        return [];
      }

      return [
        {
          id: this._getSpotPreviewCollisionId(spot),
          kind: "spot",
          location: {
            lat: spot.location.latitude,
            lng: spot.location.longitude,
          },
          priority: getSpotMarkerPriority({
            rating: spot.rating,
            access: spot.access,
            isIconic: spot.isIconic,
          }),
          widthPx: SPOT_MARKER_COLLISION_WIDTH_PX,
          heightPx: SPOT_MARKER_COLLISION_HEIGHT_PX,
          anchor: "bottom-center",
        },
      ];
    });
  }

  private _getSpotModelCollisionCandidates(
    spots: readonly (LocalSpot | Spot)[],
  ): MapMarkerCollisionCandidate[] {
    return spots.map((spot): MapMarkerCollisionCandidate => ({
      id: this._getSpotModelCollisionId(spot),
      kind: "spot",
      location: spot.location(),
      priority: getSpotMarkerPriority({
        rating: spot.rating,
        access: spot.access(),
        isIconic: spot.isIconic,
      }),
      widthPx: SPOT_MARKER_COLLISION_WIDTH_PX,
      heightPx: SPOT_MARKER_COLLISION_HEIGHT_PX,
      anchor: "bottom-center",
    }));
  }

  private _getMarkerCollisionZoom(): number {
    return this.googleMap?.getZoom() ?? this.zoom;
  }

  private _isEventCollisionMarker(marker: MapPointMarker): boolean {
    return marker.type === "event";
  }

  private _isCommunityCollisionMarker(marker: MapPointMarker): boolean {
    return marker.type === "community";
  }

  private _isPointMarkerVisibleAtZoom(
    marker: MapPointMarker,
    zoom: number,
  ): boolean {
    return (
      (marker.minZoom === undefined || zoom >= marker.minZoom) &&
      (marker.maxZoom === undefined || zoom <= marker.maxZoom)
    );
  }

  private _getSpotPreviewCollisionId(spot: SpotPreviewData): string {
    return `spot:${spot.id}`;
  }

  private _getSpotModelCollisionId(spot: LocalSpot | Spot): string {
    if (spot instanceof Spot) {
      return `spot:${spot.id}`;
    }

    const location = spot.location();
    return `local-spot:${location.lat}:${location.lng}`;
  }

  getVisibleHighlightedSpotAreas(): SpotPreviewAreaOverlay[] {
    if (this.zoom < SPOT_AREA_MIN_ZOOM) {
      return [];
    }

    return this.getVisibleHighlightedSpots()
      .map((spot) => this._getSpotPreviewAreaOverlay(spot))
      .filter((area): area is SpotPreviewAreaOverlay => !!area);
  }

  getHighlightZIndex(_spot: SpotPreviewData): number {
    return 0;
  }

  resetMapOrientation() {
    if (!this.googleMap) return;

    this.googleMap?.fitBounds(this.googleMap.getBounds()!, {
      bottom: -100,
      top: -100,
      left: -100,
      right: -100,
    });
  }

  selectedSpot = input<Spot | LocalSpot | null>(null);
  selectedSpotChallenges = input<SpotChallengePreview[]>([]);
  checkInSpot = input<Spot | SpotPreviewData | null>(null);
  @Input() selectedChallenge: SpotChallenge | LocalSpotChallenge | null = null;

  @Input() showGeolocation: boolean = false;
  @Input() selectedMarker: google.maps.LatLngLiteral | null = null;
  hideRegularSpotPins = input(false);
  showVisibleSpotPins = input(false);
  readonly hoveredCircleSpot = signal<Spot | LocalSpot | null>(null);

  @Input() boundRestriction: {
    north: number;
    south: number;
    west: number;
    east: number;
  } | null = null;
  @Input() fitToBounds: google.maps.LatLngBoundsLiteral | null = null;
  @Input() minZoom: number | null = null;
  /**
   * Whether to apply a bottom offset (via CSS) to the Google Maps logo/copyright.
   * Useful when a bottom sheet is overlaying the map on mobile.
   */
  @Input() bottomSheetOffset: boolean = false;

  @Input() pointMarkers: MapPointMarker[] = [];
  @Input() circleOverlays: MapCircleOverlay[] = [];
  @Input() boundsOverlays: MapBoundsOverlay[] = [];
  @Input() polygonOverlays: MapPolygonOverlay[] = [];
  @Input() featureBoundaryOverlay: MapFeatureBoundaryOverlay | null = null;
  @Output() pointMarkerClick = new EventEmitter<MapPointMarker>();
  @Output() circleOverlayClick = new EventEmitter<MapCircleOverlay>();
  @Output() boundsOverlayClick = new EventEmitter<MapBoundsOverlay>();
  @Output() polygonOverlayClick = new EventEmitter<MapPolygonOverlay>();
  private _featureBoundaryLayer: google.maps.FeatureLayer | null = null;
  private _featureBoundaryRequestVersion = 0;
  private _featureBoundaryPlaceIdCache = new Map<string, string | null>();
  private _markerCollisionLayoutCache: MarkerCollisionLayoutCache | null = null;
  private _visibleRegularSpotMarkersCache: VisibleRegularSpotMarkersCache | null =
    null;

  /**
   * Passive locality circles begin with the stronger dot treatment while
   * they are tiny, then ease toward the softer active-circle treatment as
   * they become large on screen. This avoids an abrupt visual hand-off when
   * a user opens a community and also keeps close-up circles out of the way.
   */
  circleOverlayOptions(
    circle: MapCircleOverlay,
  ): google.maps.CircleOptions {
    const diameterPx = this._circleDiameterPx(circle);
    const fade = this._smoothstep(
      10,
      320,
      diameterPx,
    );
    const primary = this._getCssColorAsHex("--mat-sys-primary", "#0036ba");
    const primaryBorder = this._getCssColorAsHex(
      "--mat-sys-on-primary-container",
      "#001a67",
    );

    return {
      fillColor: primary,
      fillOpacity: this._lerp(0.85, 0.08, fade),
      strokeColor: this._mixHexColor(primaryBorder, primary, fade),
      strokeOpacity: this._lerp(1, 0.28, fade),
      strokeWeight: this._lerp(1, 1, fade),
      clickable: circle.options?.clickable ?? true,
      ...circle.options,
    };
  }

  isCircleOverlayClickable(circle: MapCircleOverlay): boolean {
    if (circle.options?.clickable === false) return false;
    return (
      this._circleDiameterPx(circle) <=
      this.COMMUNITY_CIRCLE_CLICK_MAX_DIAMETER_PX
    );
  }

  private _circleDiameterPx(circle: MapCircleOverlay): number {
    return (
      (circle.radiusM * 2) /
      this._metersPerPixelAtLatitude(
        circle.center.lat,
        this._communityVisualZoom(),
      )
    );
  }

  private _metersPerPixelAtLatitude(latitude: number, zoom: number): number {
    const latitudeRadians = (latitude * Math.PI) / 180;
    return (
      (156_543.033_92 * Math.cos(latitudeRadians)) / Math.pow(2, zoom)
    );
  }

  private _lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress;
  }

  private _smoothstep(start: number, end: number, value: number): number {
    const normalized = Math.max(0, Math.min(1, (value - start) / (end - start)));
    return normalized * normalized * (3 - 2 * normalized);
  }

  private _mixHexColor(start: string, end: string, progress: number): string {
    const parse = (hex: string) => ({
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    });
    const from = parse(start);
    const to = parse(end);
    const channel = (left: number, right: number) =>
      Math.round(this._lerp(left, right, progress))
        .toString(16)
        .padStart(2, "0");

    return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
  }

  mapStyle = input<"roadmap" | "satellite" | "hybrid" | "terrain">("roadmap");
  polygons = input<PolygonSchema[]>([]);

  // defaultMarkerCollisionBehavior: google.maps.CollisionBehavior =
  //   google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY;

  mapTypeId: Signal<google.maps.MapTypeId> = computed(() => {
    // Create dependency on isApiLoaded signal so this re-evaluates when API loads
    const isLoaded = this.mapsApiService.isApiLoaded();

    // Guard against google maps not being loaded
    if (
      !isLoaded ||
      typeof google === "undefined" ||
      !google.maps ||
      !google.maps.MapTypeId
    ) {
      return "roadmap" as any;
    }

    switch (this.mapStyle()) {
      case "roadmap":
        return google.maps.MapTypeId.ROADMAP;
      case "satellite":
        return google.maps.MapTypeId.SATELLITE;
      case "hybrid":
        return google.maps.MapTypeId.HYBRID;
      case "terrain":
        return google.maps.MapTypeId.TERRAIN;
      default:
        return google.maps.MapTypeId.ROADMAP;
    }
  });

  boundsToRender = signal<google.maps.LatLngBounds | null>(null);

  private _previouslyVisibleTiles: TilesObject | null = null;
  visibleTiles = computed<TilesObject | null>(() => {
    const zoom = this.googleMap?.getZoom(); // this needs to be getZoom because _zoom is still outdated if panning
    const boundsToRender = this.boundsToRender();

    if (!boundsToRender || typeof zoom !== "number") {
      return null;
    }

    // Use an integer zoom for tile calculations. Google Maps may report
    // fractional zoom levels during smooth zooming; tile systems expect
    // integer zooms. Flooring the zoom ensures consistent tile keys and
    // allows the cluster logic to handle zooms below the minimum cluster
    // zoom (e.g., 2 or 3) by mapping them to the cluster zoom levels.
    const intZoom = Math.max(0, Math.floor(zoom));

    const neTile = MapHelpers.getTileCoordinatesForLocationAndZoom(
      boundsToRender.getNorthEast().toJSON(),
      intZoom
    );
    const swTile = MapHelpers.getTileCoordinatesForLocationAndZoom(
      boundsToRender.getSouthWest().toJSON(),
      intZoom
    );

    // Check if we cover effectively the whole world horizontally
    const tilesObj: TilesObject = {
      zoom: intZoom,
      tiles: [],
      ne: neTile,
      sw: swTile,
      center: boundsToRender.getCenter().toJSON(),
      viewportBounds: boundsToRender.toJSON(),
    };

    // Check if we cover effectively the whole world horizontally
    const ne = boundsToRender.getNorthEast();
    const sw = boundsToRender.getSouthWest();
    const lngDiff = ne.lng() - sw.lng();
    // Special case: when east === west, the viewport has wrapped around the entire world (360°)
    const isFullWorldWrap = sw.lng() === ne.lng();
    const lngSpan = isFullWorldWrap
      ? 360
      : lngDiff < 0
      ? lngDiff + 360
      : lngDiff;

    // Maximum valid tile index for Y at this zoom level
    const maxTileIndex = (1 << intZoom) - 1;
    const clampY = (y: number) => Math.max(0, Math.min(maxTileIndex, y));

    let xRange: number[];
    if (lngSpan > 359 || isFullWorldWrap) {
      const tileCount = 1 << intZoom;
      xRange = Array.from({ length: tileCount }, (_, i) => i);
    } else {
      xRange = enumerateTileRangeX(swTile.x, neTile.x, intZoom);
    }

    // Clamp Y values to valid tile bounds before iterating
    const yMin = clampY(Math.min(swTile.y, neTile.y));
    const yMax = clampY(Math.max(swTile.y, neTile.y));

    xRange.forEach((x) => {
      for (let y = yMin; y <= yMax; y++) {
        tilesObj.tiles.push({ x, y });
      }
    });

    this._previouslyVisibleTiles = tilesObj;
    return tilesObj;
  });

  /**
   * Track changes to the selected spot for proper polygon updates
   */
  selectedSpotTracker = computed(() => {
    const selectedSpot = this.selectedSpot();
    if (!selectedSpot) return null;

    // Create a unique identifier for the selected spot
    const id = "id" in selectedSpot ? selectedSpot.id : "local";
    const location = selectedSpot.location();
    return {
      id,
      location: `${location.lat},${location.lng}`,
    };
  });

  shouldShowCheckInMarker = computed(() => {
    const checkInSpot = this.checkInSpot();
    const checkInSpotLocation = this.getCheckInSpotLocation();
    const selectedSpot = this.selectedSpot();

    if (!checkInSpot || !checkInSpotLocation) return false;

    if (!selectedSpot) return true;

    // Both have IDs (Spot or SpotPreviewData) - safely access ID
    const selectedId = "id" in selectedSpot ? selectedSpot.id : null;
    const checkInId = "id" in checkInSpot ? checkInSpot.id : null;

    if (selectedId && checkInId) {
      return selectedId !== checkInId;
    }

    // If selected spot is LocalSpot, it's not the check-in spot
    return true;
  });

  isSelectedSpotCheckIn = computed(() => {
    const checkInSpot = this.checkInSpot();
    const selectedSpot = this.selectedSpot();

    if (!checkInSpot || !selectedSpot) return false;

    const selectedId = "id" in selectedSpot ? selectedSpot.id : null;
    const checkInId = "id" in checkInSpot ? checkInSpot.id : null;

    if (selectedId && checkInId) {
      return selectedId === checkInId;
    }

    return false;
  });

  getCheckInSpotLocation(): google.maps.LatLngLiteral | null {
    const spot = this.checkInSpot();
    if (!spot) return null;

    // Check if it's a Spot (location is a signal/function)
    if (typeof spot.location === "function") {
      const loc = spot.location();
      if (
        loc &&
        typeof loc.lat === "number" &&
        typeof loc.lng === "number" &&
        Number.isFinite(loc.lat) &&
        Number.isFinite(loc.lng)
      ) {
        return loc;
      }
    }

    // Check if it's SpotPreviewData / GeoPoint-like
    if (spot.location && typeof spot.location === "object") {
      const loc = spot.location as any;

      if (
        typeof loc.latitude === "number" &&
        typeof loc.longitude === "number" &&
        Number.isFinite(loc.latitude) &&
        Number.isFinite(loc.longitude)
      ) {
        return { lat: loc.latitude, lng: loc.longitude };
      }

      if (
        typeof loc._latitude === "number" &&
        typeof loc._longitude === "number" &&
        Number.isFinite(loc._latitude) &&
        Number.isFinite(loc._longitude)
      ) {
        return { lat: loc._latitude, lng: loc._longitude };
      }

      if (
        typeof loc.lat === "number" &&
        typeof loc.lng === "number" &&
        Number.isFinite(loc.lat) &&
        Number.isFinite(loc.lng)
      ) {
        return { lat: loc.lat, lng: loc.lng };
      }
    }

    const spotWithRawLocation = spot as any;
    if (
      spotWithRawLocation.location_raw &&
      typeof spotWithRawLocation.location_raw.lat === "number" &&
      typeof spotWithRawLocation.location_raw.lng === "number" &&
      Number.isFinite(spotWithRawLocation.location_raw.lat) &&
      Number.isFinite(spotWithRawLocation.location_raw.lng)
    ) {
      return {
        lat: spotWithRawLocation.location_raw.lat,
        lng: spotWithRawLocation.location_raw.lng,
      };
    }

    return null;
  }

  /**
   * Get a unique key for the selected spot to force polygon recreation
   */
  selectedSpotKey = computed(() => {
    const selectedSpot = this.selectedSpot();
    if (!selectedSpot) {
      return null;
    }

    // Create a unique key that changes when the spot changes
    const id = "id" in selectedSpot ? selectedSpot.id : "local";
    const location = selectedSpot.location();
    const key = `${id}-${location.lat}-${location.lng}`;

    return key;
  });

  /**
   * Signal to force polygon recreation by changing the template key
   */

  constructor(
    private cdr: ChangeDetectorRef,
    public mapsApiService: MapsApiService,
    private _consentService: ConsentService,
    private theme: ThemeService,
    private geolocationService: GeolocationService,
    private snackBar: MatSnackBar
  ) {
    super();

    // Clear any stale error state from previous sessions
    this.geolocationService.error.set(null);

    // Connect geolocation signal
    effect(() => {
      const loc = this.geolocationService.currentLocation();
      if (loc) {
        this.geolocation.set(loc);
        this.hasGeolocationChange.emit(true);
      } else {
        this.hasGeolocationChange.emit(false);
      }
    });

    // Effect to handle geolocation errors
    effect(() => {
      const error = this.geolocationService.error();
      if (error) {
        console.error("Geolocation error signal:", error);

        // Reset started status so user can try again
        this._geolocationStarted = false;

        this.snackBar.open(
          $localize`:Snackbar message for disabled geolocation info|Message shown when user clicks geolocation button but permissions are denied@@map.geolocation_denied.snackbar:Location permission denied. Please enable it to use this feature.`,
          $localize`:Snackbar action for disabled geolocation info|Action button on snackbar shown when user clicks geolocation button but permissions are denied@@map.geolocation_denied.snackbar_action:OK`,
          {
            duration: 5000,
          }
        );
      }
    });
    // Effect to handle selected spot changes and editing state changes for polygon updates
    effect(() => {
      const tracker = this.selectedSpotTracker();
      const isEditing = this.isEditing();

      // Also trigger the debug computed signals
      // Also trigger the debug computed signals
      // this.polygonTemplateConditions();

      // Only update polygon when we have a spot AND we're in editing mode
      if (tracker && isEditing) {
        // Use setTimeout to ensure the DOM and ViewChild are updated
        setTimeout(() => {}, 50);
      }
    });

    // Effect to update map color scheme when dark mode changes or map type changes
    effect(() => {
      // Create dependency on resolvedDarkMode and mapTypeId
      const _ = this.resolvedDarkMode();
      const __ = this.mapTypeId(); // Ensure we react to map type changes too

      this._updateMapConfig();
    });

    // if (this.selectedSpot) {
    //   this.selectedSpotMarkerNode = this.buildAdvancedMarkerContent(
    //     this.selectedSpot
    //   );
    // }

    effect(() => {
      const visibleTiles = this.visibleTiles();
      if (!visibleTiles) return;

      const tooManyTiles = 100;
      if (visibleTiles.tiles.length > tooManyTiles) {
        console.warn(
          "Visible tiles are more than " + tooManyTiles + ", not rendering.",
          "Would have rendered: ",
          visibleTiles.tiles.length,
          "tiles"
        );
        return;
      }

      this.visibleTilesChange.emit(visibleTiles);

      // Emit a viewport (bbox + zoom) for consumers that prefer bbox-driven loading
      const bounds = this.boundsToRender();
      const zoom = this.googleMap?.getZoom();
      if (bounds && typeof zoom === "number") {
        const b = bounds.toJSON();
        const viewport: VisibleViewport = {
          zoom,
          bbox: { north: b.north, south: b.south, west: b.west, east: b.east },
        };
        this.visibleViewportChange.emit(viewport);
        // Allow subclasses or external consumers to react
        this.onViewportChanged(viewport);
      }

      if (this.googleMap) {
        this._subscribeToHeadingChanges();
      }
    });

    // effect(() => {
    //   const isEditing = this.isEditing();

    //   this.cdr.detectChanges();

    //   console.log("Setting!", this.selectedChallengeMarker);
    //   if (this.selectedChallengeMarker) {
    //     this.selectedChallengeMarker.options.gmpDraggable = isEditing;
    //   }
    // });
  }

  // Resolve dark mode: prefer explicit input when provided, else use global ThemeService with mapStyle
  resolvedDarkMode = computed<boolean>(() => {
    const explicit = this.isDarkMode();
    if (typeof explicit === "boolean") return explicit;
    const mapStyle = this.mapStyle();
    return this.theme.isDark(mapStyle);
  });

  isApiLoadedSubscription: Subscription | null = null;
  consentSubscription: Subscription | null = null;
  private _headingChangedSubscription: Subscription | null = null;
  private _mapCapabilitiesChangedListener: google.maps.MapsEventListener | null =
    null;

  ngAfterViewInit() {
    if (!this.mapsApiService.isApiLoaded()) {
      console.error("Google Maps API is not loaded!");
      return;
    }

    // Initial config update - this will trigger optionsInitialized
    // which eventually renders the map
    this._updateMapConfig();
  }

  onMapReady() {
    if (!this.googleMap) {
      console.error("GoogleMap component is not available!");
      return;
    }

    this._debugMapEvent("onMapReady", {
      center: this.center,
      zoom: this.zoom,
      hasInitializedNativeMap: this._hasInitializedNativeMap,
    });

    if (this.googleMap.googleMap && !this._hasInitializedNativeMap) {
      this.googleMap.googleMap.setCenter(this.center);
      this.googleMap.googleMap.setZoom(this.zoom);
      this._hasInitializedNativeMap = true;
    }

    if (this.autoStartLocationWatch && !this._hasStartedAutoLocationWatch) {
      this._hasStartedAutoLocationWatch = true;
      this.initGeolocation();
    }

    if (this.boundRestriction) {
      this.mapOptions.restriction = {
        latLngBounds: this.boundRestriction,
        strictBounds: false,
      };
      // Apply restriction dynamically after map is initialized using setOptions
      this._applyBoundRestriction();
    }
    if (this.minZoom) {
      this.mapOptions.minZoom = this.minZoom;
      // Also apply minZoom dynamically
      this.googleMap.googleMap?.setOptions({ minZoom: this.minZoom });
    }
    this._applyFitBounds();

    this.positionGoogleMapsLogo();
    this._subscribeToHeadingChanges();
    this._subscribeToMapCapabilitiesChanges();
    void this._updateFeatureBoundaryStyle();

    if (this.isDebug()) {
      this._startFpsLoop();
    } else {
      this._stopFpsLoop(true);
    }
  }

  private async _updateMapConfig() {
    const desiredMapTypeId = this.mapTypeId();
    const isMapInitialized = !!this.googleMap?.googleMap;
    const nextOptions: google.maps.MapOptions = {
      ...this.mapOptions,
      mapTypeId: desiredMapTypeId,
    };
    const vectorRenderingType = this._getVectorRenderingType();
    const colorScheme = await this._loadDarkColorScheme();

    if (!isMapInitialized) {
      if (vectorRenderingType) {
        nextOptions.renderingType = vectorRenderingType;
      } else if (environment.mapId) {
        // Fallback: if Map ID is present but enum not loaded yet, force VECTOR string
        (nextOptions as any).renderingType = "VECTOR";
      }
    } else {
      delete (nextOptions as Partial<google.maps.MapOptions>).renderingType;
    }

    if (colorScheme) {
      (nextOptions as google.maps.MapOptions & { colorScheme: string }).colorScheme =
        colorScheme;
    } else {
      delete (nextOptions as google.maps.MapOptions & {
        colorScheme?: unknown;
      }).colorScheme;
    }

    // If map is already initialized, use setOptions.
    // `renderingType` must not be changed after instantiation.
    if (isMapInitialized && this.googleMap?.googleMap) {
      try {
        this.googleMap.googleMap.setOptions(nextOptions);
      } catch (e) {
        console.warn("Failed to update map config:", e);
      }
      return;
    }

    // Otherwise update mapOptions before initialization
    try {
      this.mapOptions = nextOptions;
      this.optionsInitialized.set(true);
    } catch (e) {
      console.warn("Failed to set map config:", e);
      this.optionsInitialized.set(true); // Proceed anyway
    }
  }

  private _getGoogleMapsApi(): (typeof google)["maps"] | null {
    if (typeof google === "undefined" || !google.maps) {
      return null;
    }

    return google.maps;
  }

  private _getVectorRenderingType(): google.maps.RenderingType | null {
    const mapsApi = this._getGoogleMapsApi();
    return mapsApi?.RenderingType?.VECTOR ?? null;
  }

  private async _loadDarkColorScheme(): Promise<string | null> {
    const mapsApi = this._getGoogleMapsApi() as
      | ((typeof google)["maps"] & {
          importLibrary?: (libraryName: string) => Promise<{
            ColorScheme?: { DARK?: unknown };
          }>;
        })
      | null;

    if (!mapsApi || typeof mapsApi.importLibrary !== "function") {
      return null;
    }

    try {
      const coreLibrary = (await mapsApi.importLibrary("core")) as {
        ColorScheme?: { DARK?: string };
      };
      return coreLibrary.ColorScheme?.DARK ?? null;
    } catch (error) {
      console.warn("Failed to load Google Maps core library:", error);
      return null;
    }
  }

  /**
   * Apply bound restriction to the map using setOptions.
   * This ensures the restriction is applied even after map initialization.
   */
  private _applyBoundRestriction(): void {
    if (!this.googleMap?.googleMap || !this.boundRestriction) return;

    this.googleMap.googleMap.setOptions({
      restriction: {
        latLngBounds: this.boundRestriction,
        strictBounds: false,
      },
    });
  }

  private _applyFitBounds(): void {
    if (!this.googleMap?.googleMap || !this.fitToBounds) return;

    this.googleMap.fitBounds(this.fitToBounds, 40);
  }

  ngOnChanges(changes: SimpleChanges) {
    // Check if selectedSpot has changed
    if (changes["selectedSpot"]) {
      console.debug("Selected spot changed:", {
        previous: changes["selectedSpot"].previousValue,
        current: changes["selectedSpot"].currentValue,
      });
    }

    // Reapply bound restriction if it changes
    if (changes["boundRestriction"] && this.googleMap?.googleMap) {
      this._applyBoundRestriction();
    }

    if (changes["fitToBounds"] && this.googleMap?.googleMap) {
      this._applyFitBounds();
    }

    if (changes["featureBoundaryOverlay"]) {
      void this._updateFeatureBoundaryStyle();
    }

    if (changes["isDebug"]) {
      if (this.isDebug()) {
        this._startFpsLoop();
      } else {
        this._stopFpsLoop(true);
      }
    }
  }

  ngOnDestroy() {
    if (this.isApiLoadedSubscription)
      this.isApiLoadedSubscription.unsubscribe();
    if (this.consentSubscription) this.consentSubscription.unsubscribe();
    if (this._headingChangedSubscription)
      this._headingChangedSubscription.unsubscribe();
    this._mapCapabilitiesChangedListener?.remove();
    this._mapCapabilitiesChangedListener = null;
    this._featureBoundaryRequestVersion++;
    this._clearFeatureBoundaryStyle();
    this._stopFpsLoop();
  }

  private async _updateFeatureBoundaryStyle(): Promise<void> {
    const requestVersion = ++this._featureBoundaryRequestVersion;
    this._clearFeatureBoundaryStyle();

    const boundary = this.featureBoundaryOverlay;
    const map = this.googleMap?.googleMap;
    if (!boundary || !map || typeof google === "undefined") {
      return;
    }

    const capabilities = map.getMapCapabilities();
    if (!capabilities.isDataDrivenStylingAvailable) {
      console.warn(
        "Google Maps data-driven styling is not available for this map yet.",
        capabilities
      );
      return;
    }

    const featureType = await this._getFeatureBoundaryFeatureType(
      boundary.featureType
    );
    if (requestVersion !== this._featureBoundaryRequestVersion) {
      return;
    }
    if (!featureType) {
      console.warn("Google Maps boundary feature types are not available.");
      return;
    }

    const layer = map.getFeatureLayer(featureType);
    if (!layer.isAvailable) {
      console.warn(
        "Google Maps COUNTRY boundary layer is not available for this map ID. Enable data-driven styling for COUNTRY boundaries in the Google Cloud map style."
      );
      return;
    }

    const placeId =
      boundary.placeId || (await this._resolveFeatureBoundaryPlaceId(boundary));
    if (requestVersion !== this._featureBoundaryRequestVersion || !placeId) {
      return;
    }

    const style = boundary.options ?? this._getFeatureBoundaryStyle();
    layer.style = ({ feature }) => {
      const placeFeature = feature as google.maps.PlaceFeature;
      return placeFeature.placeId === placeId ? style : undefined;
    };

    this._featureBoundaryLayer = layer;
  }

  private _clearFeatureBoundaryStyle(): void {
    if (this._featureBoundaryLayer) {
      this._featureBoundaryLayer.style = null;
      this._featureBoundaryLayer = null;
    }
  }

  private async _getFeatureBoundaryFeatureType(
    featureType: "COUNTRY"
  ): Promise<google.maps.FeatureType | null> {
    const mapsApi = this._getGoogleMapsApi() as
      | ((typeof google)["maps"] & {
          importLibrary?: (libraryName: string) => Promise<{
            FeatureType?: typeof google.maps.FeatureType;
          }>;
        })
      | null;
    if (!mapsApi) {
      return null;
    }

    if (mapsApi.FeatureType?.[featureType]) {
      return mapsApi.FeatureType[featureType];
    }

    if (typeof mapsApi.importLibrary !== "function") {
      return null;
    }

    try {
      const mapsLibrary = (await mapsApi.importLibrary("maps")) as {
        FeatureType?: typeof google.maps.FeatureType;
      };
      return mapsLibrary.FeatureType?.[featureType] ?? null;
    } catch (error) {
      console.warn("Failed to load Google Maps feature types:", error);
      return null;
    }
  }

  private async _resolveFeatureBoundaryPlaceId(boundary: {
    query?: string;
    region?: string;
  }): Promise<string | null> {
    const query = boundary.query?.trim();
    if (!query || typeof google === "undefined") {
      return null;
    }

    const cacheKey = `${boundary.region ?? ""}:${query}`.toLowerCase();
    if (this._featureBoundaryPlaceIdCache.has(cacheKey)) {
      return this._featureBoundaryPlaceIdCache.get(cacheKey) ?? null;
    }

    try {
      const { Place } = (await google.maps.importLibrary(
        "places"
      )) as google.maps.PlacesLibrary;
      const { places } = await Place.searchByText({
        textQuery: query,
        fields: ["id"],
        includedType: "country",
        maxResultCount: 1,
        region: boundary.region,
        useStrictTypeFiltering: true,
      });
      const placeId = places[0]?.id ?? null;
      if (!placeId) {
        console.warn("No Google boundary Place ID found for community:", query);
      }
      this._featureBoundaryPlaceIdCache.set(cacheKey, placeId);
      return placeId;
    } catch (error) {
      console.warn("Failed to resolve community boundary Place ID:", error);
      this._featureBoundaryPlaceIdCache.set(cacheKey, null);
      return null;
    }
  }

  private _getFeatureBoundaryStyle(): google.maps.FeatureStyleOptions {
    const color = this._getCssColorAsHex("--mat-sys-primary", "#0036ba");
    return {
      fillColor: color,
      strokeColor: color,
      fillOpacity: 0.06,
      strokeOpacity: 0.72,
      strokeWeight: 2,
    };
  }

  private _getCssColorAsHex(cssVarName: string, fallback: string): string {
    if (typeof window === "undefined") {
      return fallback;
    }

    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(cssVarName)
      .trim();

    if (/^#[0-9a-f]{6}$/iu.test(value)) {
      return value;
    }

    const rgbMatch = value.match(
      /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/iu
    );
    if (!rgbMatch) {
      return fallback;
    }

    const [red, green, blue] = rgbMatch
      .slice(1, 4)
      .map((part) => Math.max(0, Math.min(255, Number(part))));
    return `#${[red, green, blue]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  private _subscribeToHeadingChanges(): void {
    if (this._headingChangedSubscription || !this.googleMap) return;

    this._headingChangedSubscription = this.googleMap.headingChanged.subscribe(
      () => {
        this.headingIsNotNorth.set(this.googleMap!.getHeading() !== 0);
      }
    );
  }

  private _subscribeToMapCapabilitiesChanges(): void {
    if (this._mapCapabilitiesChangedListener || !this.googleMap?.googleMap) {
      return;
    }

    this._mapCapabilitiesChangedListener =
      this.googleMap.googleMap.addListener("mapcapabilities_changed", () => {
        void this._updateFeatureBoundaryStyle();
      });
  }

  private _geoPointToLatLng(
    geoPoint: GeoPoint
  ): google.maps.LatLngLiteral | null {
    return geoPoint
      ? { lat: geoPoint.latitude, lng: geoPoint.longitude }
      : null;
  }

  geopointToLatLngLiteral(geoPoint: GeoPoint): google.maps.LatLngLiteral {
    if (!geoPoint) throw new Error("No GeoPoint provided");
    if (!geoPoint.latitude || !geoPoint.longitude)
      throw new Error("Invalid GeoPoint provided");

    return { lat: geoPoint.latitude, lng: geoPoint.longitude };
  }

  getBoundsForTile(tile: { zoom: number; x: number; y: number }) {
    return MapHelpers.getBoundsForTile(tile.zoom, tile.x, tile.y);
  }

  async initGeolocation() {
    // Check permissions and auto-start if already granted
    const hasPermission = await this.geolocationService.checkPermissions();
    if (hasPermission) {
      await this.geolocationService.startWatching();
    }
  }

  private _geolocationStarted = false;

  async useGeolocation() {
    // Start watching if not already started
    if (!this._geolocationStarted) {
      await this.geolocationService.startWatching();
      this._geolocationStarted = true;
    }

    // Pan to current position if available, otherwise it will happen when location updates
    const pos = this.geolocationService.currentLocation();
    if (pos && this.googleMap) {
      this.googleMap.panTo(pos.location);
      this.googleMap.zoom = 17;
    } else {
      // If we don't have a location yet, try to get it once
      const pos = await this.geolocationService.getCurrentPosition();
      if (pos && this.googleMap) {
        this.googleMap.panTo(pos.location);
        this.googleMap.zoom = 17;
      }
    }
  }

  geolocation = signal<{
    location: google.maps.LatLngLiteral;
    accuracy: number;
  } | null>(null);

  geolocationLoading = this.geolocationService.loading;

  //spotDotZoomRadii: number[] = Array<number>(16);

  mapOptions: google.maps.MapOptions = {
    mapId: environment.mapId,
    backgroundColor: "#000000",
    clickableIcons: false,
    gestureHandling: "greedy",
    disableDefaultUI: true,
    isFractionalZoomEnabled: true,
    tilt: 0,
    headingInteractionEnabled: false,
  };

  optionsInitialized = signal<boolean>(false);

  spotCircleDarkOptions: google.maps.CircleOptions = {
    fillColor: "#b8c4ff",
    strokeColor: "#0036ba",
    strokeOpacity: 0.8,
    fillOpacity: 0.6,
    strokeWeight: 3,
    draggable: false,
    clickable: true,
  };
  spotCircleLightOptions: google.maps.CircleOptions = {
    fillColor: "#0036ba",
    strokeColor: "#b8c4ff",
    fillOpacity: 0.6,
    strokeOpacity: 0.8,
    strokeWeight: 3,
    draggable: false,
    clickable: true,
  };
  spotCircleOptions: google.maps.CircleOptions = this.spotCircleDarkOptions;

  spotPolygonDarkOptions: google.maps.PolygonOptions = {
    fillColor: "#b8c4ff",
    strokeColor: "#0036ba",
    strokeOpacity: 0.8,
    fillOpacity: 0.6,
    strokeWeight: 3,
    editable: false,
    draggable: false,
    clickable: true,
  };

  // spotPolygonLightOptions: google.maps.PolygonOptions = {
  //   fillColor: "#0036ba",
  //   strokeColor: "#b8c4ff",
  //   strokeOpacity: 0.8,
  //   fillOpacity: 0.5,
  //   strokeWeight: 3,
  //   editable: false,
  //   draggable: false,
  //   clickable: true,
  // };
  spotPolygonOptions: google.maps.PolygonOptions = this.spotPolygonDarkOptions;

  selectedSpotPolygonEditingOptions: google.maps.PolygonOptions = {
    ...this.spotPolygonOptions,
    editable: true,
    strokeColor: "#0036ba",
    fillColor: "#b8c4ff",
    strokeWeight: 4,
    strokeOpacity: 0.9,
    fillOpacity: 0.3,
  };

  geolocationCircleOptions: google.maps.CircleOptions = {
    fillColor: "#0000ff",
    fillOpacity: 0.1,
    draggable: false,
    clickable: false,
    strokeWeight: 0,
  };

  // convert options to computed signals
  // setLightMode() {
  //   this.isDarkMode = false;
  //   //     this.heatmapOptions = this.heatmapLightOptions;
  //   this.spotCircleOptions = this.spotCircleLightOptions;
  //   this.spotPolygonOptions = this.spotPolygonLightOptions;
  //   //     this.selectedSpotMarkerOptions = this.selectedSpotMarkerLightOptions;
  // }
  // setDarkMode() {
  //   this.isDarkMode = true;
  //   //     this.heatmapOptions = this.heatmapDarkOptions;
  //   this.spotCircleOptions = this.spotCircleDarkOptions;
  //   this.spotPolygonOptions = this.spotPolygonDarkOptions;

  // }

  private _lastBoundsChangeTime = 0;
  private _boundsThrottleTimer: any = null;
  private readonly BOUNDS_THROTTLE_MS = 1000;

  // FPS Counter
  fps = signal<number>(0);
  private _lastFrameTime = 0;
  private _frameCount = 0;
  private _lastFpsUpdate = 0;
  private _fpsAnimationFrameId: number | null = null;

  private _resetFpsCounters() {
    this.fps.set(0);
    this._lastFrameTime = 0;
    this._frameCount = 0;
    this._lastFpsUpdate = 0;
  }

  private _stopFpsLoop(resetCounters: boolean = false) {
    if (this._fpsAnimationFrameId !== null) {
      cancelAnimationFrame(this._fpsAnimationFrameId);
      this._fpsAnimationFrameId = null;
    }

    if (resetCounters) {
      this._resetFpsCounters();
    }
  }

  private _startFpsLoop() {
    // Prevent multiple RAF loops from running concurrently.
    if (this._fpsAnimationFrameId !== null) {
      return;
    }

    this._resetFpsCounters();

    const loop = (time: number) => {
      if (this._lastFrameTime === 0) {
        this._lastFrameTime = time;
        this._lastFpsUpdate = time;
      }

      this._frameCount++;
      const now = time;

      // Update FPS every 500ms
      if (now - this._lastFpsUpdate >= 500) {
        const fps = Math.round(
          (this._frameCount * 1000) / (now - this._lastFpsUpdate)
        );
        this.fps.set(fps);
        this._frameCount = 0;
        this._lastFpsUpdate = now;
      }

      this._lastFrameTime = now;
      this._fpsAnimationFrameId = requestAnimationFrame(loop);
    };
    this._fpsAnimationFrameId = requestAnimationFrame(loop);
  }

  boundsChanged() {
    const now = Date.now();

    // If enough time has passed, execute immediately
    if (now - this._lastBoundsChangeTime > this.BOUNDS_THROTTLE_MS) {
      this._executeBoundsChange();
      this._lastBoundsChangeTime = now;
      // Clear any pending timer since we just executed
      if (this._boundsThrottleTimer) {
        clearTimeout(this._boundsThrottleTimer);
        this._boundsThrottleTimer = null;
      }
    } else {
      // Otherwise, schedule a trailing update to ensure the final state is captured
      // This handles the case where the user stops moving between throttle intervals
      if (this._boundsThrottleTimer) clearTimeout(this._boundsThrottleTimer);

      this._boundsThrottleTimer = setTimeout(() => {
        this._executeBoundsChange();
        this._lastBoundsChangeTime = Date.now();
        this._boundsThrottleTimer = null;
      }, this.BOUNDS_THROTTLE_MS);
    }
  }

  cameraIdle() {
    this._executeBoundsChange();
    this.centerChanged();
  }

  private _executeBoundsChange() {
    if (!this.googleMap) return;
    const bounds = this.googleMap.getBounds()!;

    this.boundsToRender.set(bounds);
    this._debugMapEvent("boundsChanged", {
      center: bounds.getCenter().toJSON(),
      zoom: this.googleMap.getZoom(),
      bounds: bounds.toJSON(),
    });
    this.boundsChange.emit(this.boundsToRender() ?? undefined);
  }

  centerChanged() {
    if (!this.googleMap) return;
    const center = this.googleMap.getCenter()!;
    this._debugMapEvent("centerChanged", {
      center: center.toJSON(),
      zoom: this.googleMap.getZoom(),
    });
    this.centerChange.emit(center.toJSON());
  }

  fitBounds(bounds: google.maps.LatLngBounds) {
    if (!this.googleMap) return;

    this._debugMapEvent("fitBounds", {
      center: bounds.getCenter().toJSON(),
      bounds: bounds.toJSON(),
    });
    this.googleMap.fitBounds(bounds);
  }

  editingSpotPositionChanged(position: google.maps.LatLng) {
    const selectedSpot = this.selectedSpot();
    if (!selectedSpot) return;

    selectedSpot.location.set(position.toJSON());
  }

  editingChallengePositionChanged(position: google.maps.LatLng) {
    if (!this.selectedChallenge) return;

    this.selectedChallenge.location.set(position.toJSON());
  }
  showSelectedSpotPolygon(): boolean {
    const hasSpot = !!this.selectedSpot;
    const isEditing = this.isEditing();
    const result = hasSpot && isEditing;

    // console.log(
    //   "showSelectedSpotPolygon - hasSpot:",
    //   hasSpot,
    //   "isEditing:",
    //   isEditing,
    //   "result:",
    //   result
    // );

    if (!hasSpot || !isEditing) {
      return false;
    }

    // Show polygon when in editing mode - this allows creating new bounds
    // or editing existing bounds
    return true;
  }
  /**
   * Check if a given spot is the currently selected spot and is being edited
   */
  isSelectedSpotBeingEdited(spot: LocalSpot | Spot): boolean {
    const selectedSpot = this.selectedSpot();
    if (!selectedSpot || !this.isEditing()) return false;

    // First check: same object reference
    if (selectedSpot === spot) {
      return true;
    }

    // For Spot instances (with ID), compare by ID
    if ("id" in selectedSpot && "id" in spot) {
      const result = (selectedSpot as any).id === (spot as any).id;
      if (result) return true;
    }

    // For LocalSpot instances or mixed cases, compare by location
    // This is a fallback that should work for most cases
    const selectedLoc = selectedSpot?.location();
    if (!selectedLoc) return false;
    const spotLoc = spot.location();
    const result =
      selectedLoc.lat === spotLoc.lat && selectedLoc.lng === spotLoc.lng;

    return result;
  }

  isSameAsSelectedSpot(spot: LocalSpot | Spot): boolean {
    const selectedSpot = this.selectedSpot();
    if (!selectedSpot) return false;

    if (selectedSpot === spot) {
      return true;
    }

    if ("id" in selectedSpot && "id" in spot) {
      return (selectedSpot as Spot).id === (spot as Spot).id;
    }

    const selectedLoc = selectedSpot.location();
    const spotLoc = spot.location();

    return selectedLoc.lat === spotLoc.lat && selectedLoc.lng === spotLoc.lng;
  }

  showCirclePreview(spot: LocalSpot | Spot): void {
    this.hoveredCircleSpot.set(spot);
  }

  hideCirclePreview(spot: LocalSpot | Spot): void {
    if (this.hoveredCircleSpot() === spot) {
      this.hoveredCircleSpot.set(null);
    }
  }

  /**
   * Debug method to check the state of the selectedSpotPolygon ViewChild
   * Can be called from browser console for debugging
   */
  debugPolygonState() {
    if (this.selectedSpotPolygon?.polygon) {
      const paths = this.selectedSpotPolygon.polygon.getPaths();
      console.log("Polygon paths:", paths);

      if (paths && paths.getLength() > 0) {
        const firstPath = paths.getAt(0);
        console.log("First path length:", firstPath.getLength());
        for (let i = 0; i < firstPath.getLength(); i++) {
          const point = firstPath.getAt(i);
          console.log(`Point ${i}:`, { lat: point.lat(), lng: point.lng() });
        }
      }
    }
  }

  /**
   * Debug method to check polygon state - can be called from console
   */
  debugPolygonStateForSpotSwitch() {
    console.log("=== POLYGON DEBUG FOR SPOT SWITCH ===");
    console.log("selectedSpot:", this.selectedSpot);
    console.log("isEditing():", this.isEditing());
    console.log("selectedSpotPolygon ViewChild:", this.selectedSpotPolygon);

    if (this.selectedSpotPolygon?.polygon) {
      const paths = this.selectedSpotPolygon.polygon.getPaths();
      console.log("Current polygon paths count:", paths.getLength());

      for (let i = 0; i < paths.getLength(); i++) {
        const path = paths.getAt(i);
        console.log(`Path ${i} length:`, path.getLength());

        if (path.getLength() > 0) {
          console.log(`First point of path ${i}:`, {
            lat: path.getAt(0).lat(),
            lng: path.getAt(0).lng(),
          });
        }
      }
    }

    console.log("selectedSpotPaths():", this.selectedSpotPaths());
    console.log("selectedSpotFirstPath():", this.selectedSpotFirstPath());
    console.log("=== END POLYGON DEBUG ===");
  }

  /**
   * Get the current paths of the selected spot polygon from the map component.
   * This should be called when saving to get the updated polygon data.
   */
  async getSelectedSpotPolygonPaths(): Promise<
    google.maps.LatLngLiteral[][] | null
  > {
    if (!this.selectedSpot) {
      console.log("No selected spot, returning null");
      return null;
    }

    if (this.isEditing()) {
      console.log("🔄 In editing mode, trying to get live polygon paths...");

      // Try to get the current paths using the waiting method
      const livePaths = await this.waitForPolygonAndGetPaths();
      if (livePaths && livePaths.length > 0) {
        console.log("✅ Got live polygon paths, updating spot");
        return livePaths;
      }

      console.log(
        "⚠️ Could not get live polygon paths, falling back to existing paths"
      );
    }

    // Fall back to existing paths - DO NOT create default paths
    const selectedSpot = this.selectedSpot();
    const paths = selectedSpot?.paths();
    if (paths && paths.length > 0) {
      console.log("Falling back to existing spot paths");
      return paths;
    }

    // Return null if no paths exist - don't create default paths
    console.log("No paths exist, returning null");
    return null;
  }

  /**
   * Update the selected spot's paths and emit polygon change event
   */
  updateSelectedSpotPaths(paths: google.maps.LatLngLiteral[][]) {
    const selectedSpot = this.selectedSpot();
    if (!selectedSpot) return;

    // Update the spot's paths signal
    selectedSpot.paths.set(paths);

    // Emit the polygon change event
    // Check if it's a Spot (has id) vs LocalSpot (no id)
    if ("id" in selectedSpot && selectedSpot.id) {
      this.polygonChanged.emit({
        spotId: selectedSpot.id as string,
        path: paths,
      });
    }
  }

  /**
   * Converts a Google Maps Polygon to an array of coordinate paths
   */
  private getPathFromPolygon(
    polygon: google.maps.Polygon
  ): google.maps.LatLngLiteral[][] {
    const paths: google.maps.LatLngLiteral[][] = [];

    // Get the first path (main polygon)
    const path = polygon.getPath();
    if (path) {
      const coordinates: google.maps.LatLngLiteral[] = [];
      for (let i = 0; i < path.getLength(); i++) {
        const point = path.getAt(i);
        coordinates.push({
          lat: point.lat(),
          lng: point.lng(),
        });
      }
      if (coordinates.length > 0) {
        paths.push(coordinates);
      }
    }

    // Handle holes (additional paths)
    const polygonPaths = polygon.getPaths();
    if (polygonPaths && polygonPaths.getLength() > 1) {
      for (let i = 1; i < polygonPaths.getLength(); i++) {
        const holePath = polygonPaths.getAt(i);
        const holeCoordinates: google.maps.LatLngLiteral[] = [];
        for (let j = 0; j < holePath.getLength(); j++) {
          const point = holePath.getAt(j);
          holeCoordinates.push({
            lat: point.lat(),
            lng: point.lng(),
          });
        }
        if (holeCoordinates.length > 0) {
          paths.push(holeCoordinates);
        }
      }
    }

    return paths;
  }

  onHighlightedSpotClick(spot: SpotPreviewData) {
    console.log("Highlighted spot clicked:", spot);
    this.spotClick.emit(spot);
  }

  focusOnLocation(
    location: google.maps.LatLngLiteral | google.maps.LatLng,
    zoom: number = this.focusZoom()
  ) {
    if (!this.googleMap) return;

    if (!location) {
      console.warn("No or invalid location provided to focus on", location);
      console.trace();
      return;
    }

    this._debugMapEvent("focusOnLocation", {
      location: "toJSON" in location ? location.toJSON() : location,
      zoom,
      currentZoom: this.zoom,
    });

    if (this.zoom !== zoom) {
      this.setZoom(zoom);
      setTimeout(() => {
        this.googleMap?.panTo(location);
      }, 200);
    } else {
      this.googleMap?.panTo(location);
    }
  }

  focusOnGeolocation() {
    const geolocation = this.geolocation();
    if (geolocation) {
      this.focusOnLocation(geolocation.location);
    } else {
      // TODO maybe ask again for geolocation in the future
    }
  }

  markerClick(markerIndex: number) {
    this.markerClickEvent.emit(markerIndex);
    // If we have a mapped spot id, emit spotClick too so parent can open it directly
    if (this.markerSpotIds && this.markerSpotIds[markerIndex]) {
      this.spotClick.emit(this.markerSpotIds[markerIndex]!);
    }
  }

  /**
   * Computed signal for selected spot paths to avoid infinite change detection loops
   */
  selectedSpotPaths = computed(() => {
    // Force dependency tracking on the debug signal
    const debugInfo = this.selectedSpotDebug();

    const selectedSpot = this.selectedSpot();
    if (!selectedSpot) {
      return [];
    }

    // Always use the current stored paths when available
    const paths = selectedSpot.paths();
    if (paths && paths.length > 0 && paths[0] && paths[0].length > 0) {
      return paths;
    }

    // Return empty array if no valid paths exist - don't create default paths
    // This ensures spots without bounds don't show polygons
    return [];
  });

  /**
   * Get the first path for the template binding (safe access)
   */
  selectedSpotFirstPath = computed(() => {
    const paths = this.selectedSpotPaths();

    if (paths.length > 0) {
      return paths[0];
    }

    // If we're in editing mode and no paths exist, DO NOT create a default path automatically.
    // Bounds should only be added via the "Add Bounds" action.

    return [];
  });

  getSelectedSpotPaths(): google.maps.LatLngLiteral[][] {
    return this.selectedSpotPaths();
  }

  /**
   * Finds the Google Maps logo element by its title attribute and adjusts its parent's
   * bottom position to account for the bottom sheet (150px).
   */
  private positionGoogleMapsLogo(): void {
    // Use a small delay to ensure the logo is fully rendered
    setTimeout(() => {
      // Get the native Google Map instance
      const googleMapInstance = this.googleMap?.googleMap;
      const mapContainer = googleMapInstance?.getDiv();
      if (!mapContainer) return;

      // Find the element with "Google Maps" in the title
      const logoElements = mapContainer.querySelectorAll(
        '[title*="Google Maps"]'
      );

      if (logoElements.length > 0) {
        logoElements.forEach((element: Element) => {
          // Get the parent element that we need to adjust
          const parent = element.parentElement;
          if (parent) {
            parent.classList.add("gm-logo");
            // Force reflow to ensure animation plays
            void parent.offsetHeight;
            // Add animate class to trigger the fade-in animation
            parent.classList.add("gm-logo-animate");
          }
        });
      }
    }, 2500); // Delay to ensure map is fully rendered
  }

  /**
   * Wait for the polygon to be fully initialized and then get its paths
   * This handles the case where the ViewChild is available but the underlying Google Maps polygon isn't ready yet
   */
  async waitForPolygonAndGetPaths(
    maxRetries: number = 10,
    retryDelay: number = 100
  ): Promise<google.maps.LatLngLiteral[][] | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Force change detection to ensure ViewChild is updated
      this.cdr.detectChanges();

      if (
        this.selectedSpotPolygon &&
        this.selectedSpotPolygon instanceof MapPolygon
      ) {
        // Check if the underlying Google Maps polygon is available
        const googlePolygon = this.selectedSpotPolygon.polygon;

        if (googlePolygon && typeof googlePolygon.getPaths === "function") {
          try {
            const mvcPaths = googlePolygon.getPaths();

            if (
              mvcPaths &&
              typeof mvcPaths.getLength === "function" &&
              mvcPaths.getLength() > 0
            ) {
              const paths: google.maps.LatLngLiteral[][] = [];

              for (let i = 0; i < mvcPaths.getLength(); i++) {
                const mvcPath = mvcPaths.getAt(i);
                const coordinates: google.maps.LatLngLiteral[] = [];

                if (mvcPath && typeof mvcPath.getLength === "function") {
                  for (let j = 0; j < mvcPath.getLength(); j++) {
                    const point = mvcPath.getAt(j);
                    coordinates.push({
                      lat: point.lat(),
                      lng: point.lng(),
                    });
                  }
                }

                if (coordinates.length > 0) {
                  paths.push(coordinates);
                }
              }

              if (paths.length > 0) {
                console.log("✅ Successfully retrieved polygon paths");
                return paths;
              }
            }
          } catch (error) {
            console.error("❌ Error getting paths:", error);
          }
        }
      }

      // Wait before retrying
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    console.log("❌ Failed to get polygon paths after", maxRetries, "attempts");
    return null;
  }

  /**
   * Completely reset and recreate the polygon for the current selected spot
   * This is the most aggressive approach for ensuring clean polygon state
   */

  /**
   * Debug computed signal to trace when selectedSpot changes
   */
  selectedSpotDebug = computed(() => {
    const spot = this.selectedSpot();
    if (spot) {
      const id = "id" in spot ? spot.id : "local";
      const location = spot.location();
      const paths = spot.paths();

      return { id, location, paths };
    }
    return null;
  });

  /**
   * Debug computed signal to track template conditions
   */
  polygonTemplateConditions = computed(() => {
    const selectedSpot = this.selectedSpot();
    const isEditing = this.isEditing();
    const showPolygon = this.showSelectedSpotPolygon();
    const firstPath = this.selectedSpotFirstPath();

    const result = {
      selectedSpot: !!selectedSpot,
      isEditing,
      showPolygon,
      firstPathLength: firstPath.length,
      // polygonRecreationKey: this.polygonRecreationKey(),
      shouldShowPolygon: !!selectedSpot && isEditing && showPolygon,
    };

    return result;
  });

  closeSelectedSpot() {
    // Emit null to parent component to close the selected spot
    this.spotClick.emit(null as any);
  }

  trackSpot(index: number, spot: LocalSpot | Spot): string {
    if ("id" in spot && spot.id) {
      return spot.id as string;
    }

    const location = spot.location();
    return `local-${location.lat}_${location.lng}_${index}`;
  }

  trackSpotPreviewArea(index: number, area: SpotPreviewAreaOverlay): string {
    return area.id || index.toString();
  }

  private _getSpotPreviewAreaOverlay(
    spot: SpotPreviewData,
  ): SpotPreviewAreaOverlay | null {
    const path = this._getSpotPreviewPath(spot);
    if (path && path.length >= 3) {
      return {
        id: `${spot.id}-bounds`,
        spot,
        path,
      };
    }

    const radiusM = spot.bounds_radius_m;
    const center = this._getSpotPreviewCenter(spot);
    if (center && typeof radiusM === "number" && radiusM > 0) {
      return {
        id: `${spot.id}-bounds-radius`,
        spot,
        center,
        radiusM,
      };
    }

    return null;
  }

  private _getSpotPreviewPath(
    spot: SpotPreviewData,
  ): google.maps.LatLngLiteral[] | null {
    const rawPath =
      spot.bounds_raw ??
      spot.bounds?.map((point) => this._getLatLngLiteralFromPoint(point));

    const path = rawPath?.filter(
      (point): point is google.maps.LatLngLiteral =>
        !!point &&
        typeof point.lat === "number" &&
        typeof point.lng === "number",
    );

    return path && path.length >= 3 ? path : null;
  }

  private _getSpotPreviewCenter(
    spot: SpotPreviewData,
  ): google.maps.LatLngLiteral | null {
    return (
      this._getLatLngLiteralFromPoint(spot.bounds_center) ??
      spot.location_raw ??
      this._getLatLngLiteralFromPoint(spot.location)
    );
  }

  private _getLatLngLiteralFromPoint(
    point:
      | google.maps.LatLngLiteral
      | GeoPoint
      | { latitude?: number; longitude?: number }
      | null
      | undefined,
  ): google.maps.LatLngLiteral | null {
    if (!point) {
      return null;
    }

    if ("lat" in point && "lng" in point) {
      return { lat: point.lat, lng: point.lng };
    }

    if ("latitude" in point && "longitude" in point) {
      const lat = point.latitude;
      const lng = point.longitude;
      if (typeof lat === "number" && typeof lng === "number") {
        return { lat, lng };
      }
    }

    return null;
  }

  /**
   * Track function for custom markers
   */
  trackMarker(index: number, marker: MarkerSchema): string {
    // If marker has a unique ID (e.g. spot ID), use it
    // For now fall back to index if no unique ID is apparent, or combine properties
    // Using name and location as unique key
    if (marker.name)
      return `${marker.name}_${marker.location.lat}_${marker.location.lng}`;
    return `${index}_${marker.location.lat}_${marker.location.lng}`;
  }

  trackSpotMarker(index: number, spot: LocalSpot | Spot): string {
    if ("id" in spot && spot.id) {
      return spot.id as string;
    }

    const location = spot.location();
    return `${index}_${location.lat}_${location.lng}`;
  }

  private _debugMapEvent(event: string, payload: Record<string, unknown>): void {
    if (!this.isDebug()) return;

    console.debug("[MapDebug][GoogleMap2d]", event, {
      ...payload,
      selectedSpot: this._debugSelectedSpotKey(),
      timestamp: Math.round(performance.now()),
    });
  }

  private _debugSelectedSpotKey(): string | null {
    const spot = this.selectedSpot();
    if (!spot) return null;
    if ("id" in spot && spot.id) return spot.id as string;

    const location = spot.location();
    return `local-${location.lat}_${location.lng}`;
  }
}
