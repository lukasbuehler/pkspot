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
  NgZone,
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
import { environment } from "../../../environments/environment.default";
import { MapsApiService } from "../../services/maps-api.service";
import { MapPerformanceProfilerService } from "../../services/map-performance-profiler.service";
import { ConsentService } from "../../services/consent.service";
import { AppSettingsService } from "../../services/app-settings.service";
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
import { MapPresenceDotMarkerComponent } from "../map/map-presence-dot-marker/map-presence-dot-marker.component";
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
  getSpotMarkerCollisionDimensions,
} from "./map-marker-collision-filter";
import type {
  MapMarkerCollisionCandidate,
  MapMarkerCollisionLayout,
} from "./map-marker-collision-filter";
import {
  isFiniteBoundsLiteral,
  isFiniteLatLngBounds,
  isUsableMapCenterLiteral,
  reportInvalidMapCoordinate,
  toUsableMapCenterLiteral,
} from "../../shared/map-coordinate-utils";

function enumerateTileRangeX(
  start: number,
  end: number,
  zoom: number,
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
const DEFAULT_SPOT_AREA_RADIUS_M = 10;
const EVENT_MARKER_COLLISION_SIZE_PX = 48;
const COMMUNITY_FULL_MARKER_COLLISION_SIZE_PX = 44;
const COMMUNITY_DOT_COLLISION_SIZE_PX = 24;
const POINT_MARKER_DOT_COLLISION_SIZE_PX = 28;
const POINT_MARKER_FULL_COLLISION_SIZE_PX = 48;
const MAP_PROFILE_FULL_SNAPSHOT_INTERVAL_MS = 1_000;
const POINT_MARKER_NATIVE_CIRCLE_MAX_ZOOM = 13;

interface MarkerCollisionLayoutCache {
  highlightedSpots: SpotPreviewData[];
  pointMarkers: MapPointMarker[];
  regularSpots: (LocalSpot | Spot)[];
  zoom: number;
  layout: MapMarkerCollisionLayout;
}

interface VisibleRegularSpotMarkersCache {
  spots: (LocalSpot | Spot)[];
  highlightedSpots: SpotPreviewData[];
  selectedSpot: LocalSpot | Spot | null;
  isEditing: boolean;
  shouldRenderRegularSpotMarkers: boolean;
  visibleSpots: (LocalSpot | Spot)[];
}

interface VisibleHighlightedSpotPreviewsCache {
  spots: SpotPreviewData[];
  selectedSpotId: string | null;
  visibleSpots: SpotPreviewData[];
}

interface FilteredHighlightedSpotMarkersCache {
  spots: SpotPreviewData[];
  layout: MapMarkerCollisionLayout;
  visibleSpots: SpotPreviewData[];
}

interface FilteredRegularSpotMarkersCache {
  spots: (LocalSpot | Spot)[];
  layout: MapMarkerCollisionLayout;
  visibleSpots: (LocalSpot | Spot)[];
}

interface FilteredPointMarkersCache {
  markers: MapPointMarker[];
  layout: MapMarkerCollisionLayout;
  zoom: number;
  visibleMarkers: MapPointMarker[];
  collapsedCommunityMarkers: MapPointMarker[];
}

interface VisibleHighlightedSpotAreasCache {
  spots: SpotPreviewData[];
  areas: SpotPreviewAreaOverlay[];
}

interface CircleOverlayRenderState {
  darkMode: boolean;
  inputOptions: MapCircleOverlay["options"] | undefined;
  options: google.maps.CircleOptions;
  clickable: boolean;
  visualZoom: number;
}

interface PointMarkerCircleRenderState {
  darkMode: boolean;
  marker: MapPointMarker;
  options: google.maps.CircleOptions;
  radiusM: number;
  visualZoom: number;
}

export interface TilesObject {
  zoom: number;
  tiles: { x: number; y: number }[];
  ne: { x: number; y: number };
  sw: { x: number; y: number };
  center?: google.maps.LatLngLiteral;
  viewportBounds?: google.maps.LatLngBoundsLiteral;
}

interface MapCameraSnapshot {
  bounds: google.maps.LatLngBoundsLiteral | null;
  center: google.maps.LatLngLiteral;
  source: string;
  timestampMs: number;
  zoom: number;
}

interface ProgrammaticCameraJumpAllowance {
  source: string;
  untilMs: number;
}

interface PendingCameraOperation {
  attempt: number;
  hasReportedWait: boolean;
  isRecovery: boolean;
  reason: string;
  requestedAtMs: number;
  run: () => void;
}

interface WatchedMapCanvas {
  canvas: HTMLCanvasElement;
  lostListener: (event: Event) => void;
  restoredListener: (event: Event) => void;
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
    MapPresenceDotMarkerComponent,
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
  private static readonly CAMERA_JUMP_WINDOW_MS = 600;
  private static readonly MAX_CAMERA_ZOOM_JUMP = 3;
  private static readonly CAMERA_IDLE_WATCHDOG_MS = 2_500;
  private static readonly CAMERA_OPERATION_MIN_VIEWPORT_SIZE_PX = 32;
  private static readonly CAMERA_OPERATION_WAIT_TIMEOUT_MS = 1_500;
  private _isInternalZoomChange = false;
  private _isRecoveringInvalidCamera = false;
  private _hasInitializedNativeMap = false;
  private _hasStartedPassiveLocationWatch = false;
  private _invalidCameraRecoveryCount = 0;
  private _invalidCameraRecoveryTimeoutId: ReturnType<typeof setTimeout> | null =
    null;
  private _cameraRecoveryVerificationTimeoutId: ReturnType<typeof setTimeout> | null =
    null;
  private _cameraIdleWatchdogTimeoutId: ReturnType<typeof setTimeout> | null =
    null;
  private _lastValidCamera: MapCameraSnapshot | null = null;
  private _lastFullMapProfileTimestamp = 0;
  private _programmaticCameraJumpAllowance: ProgrammaticCameraJumpAllowance | null =
    null;
  private _mapCanvasObserver: MutationObserver | null = null;
  private readonly _watchedMapCanvases = new Map<
    HTMLCanvasElement,
    WatchedMapCanvas
  >();
  private _webGlContextRecoveryTimeoutId: ReturnType<typeof setTimeout> | null =
    null;
  private _pendingCameraOperation: PendingCameraOperation | null = null;
  private _pendingCameraOperationFrameId: number | null = null;

  // @ViewChildren(MapPolygon) spotPolygons: QueryList<MapPolygon> | undefined;
  // @ViewChildren(MapPolygon, { read: ElementRef })
  polygonElements: QueryList<ElementRef> | undefined;

  public googleMap: GoogleMap | undefined;

  @ViewChild("googleMap") set googleMapSetter(content: GoogleMap) {
    if (content) {
      if (content === this.googleMap && this._hasInitializedNativeMap) {
        return;
      }

      if (content !== this.googleMap) {
        this._clearCameraEventListeners();
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
  readonly google: typeof google | undefined =
    typeof window !== "undefined"
      ? (window as Window & { google?: typeof google }).google
      : undefined;

  focusZoom = input<number>(17);
  isDebug = input<boolean>(false);
  showSpotPreview = input<boolean>(false);
  showAllHighlightedSpotPins = input<boolean>(false);
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
    if (!isUsableMapCenterLiteral(coords)) {
      reportInvalidMapCoordinate("Ignoring invalid map center", coords);
      return;
    }

    this._center = coords;
    if (this.googleMap) {
      this._runWhenMapViewportReady("center-input", () => {
        this.googleMap?.panTo(this._center);
      });
    }
  }
  @Output() centerChange = new EventEmitter<google.maps.LatLngLiteral>();
  get center(): google.maps.LatLngLiteral {
    return this._center;
  }

  _zoom = signal<number>(4);
  private readonly _communityVisualZoom = signal<number>(4);
  private _communityVisualZoomAnimationFrameId: number | null = null;
  private _lastObservedNativeIntegerZoom: number | null = null;
  private readonly COMMUNITY_VISUAL_ZOOM_ANIMATION_MS = 180;
  private readonly COMMUNITY_VISUAL_ZOOM_STEP = 0.1;
  private readonly COMMUNITY_CIRCLE_CLICK_MAX_DIAMETER_PX = 320;

  @Input() set zoom(newZoom: number) {
    if (!Number.isFinite(newZoom)) {
      reportInvalidMapCoordinate("Ignoring invalid map zoom", newZoom);
      return;
    }

    this._setCommunityVisualZoom(newZoom);
    this._lastObservedNativeIntegerZoom = Math.floor(newZoom);

    if (this._isInternalZoomChange) {
      this._zoom.set(newZoom);
      return;
    }

    this._zoom.set(newZoom);
    if (this.googleMap?.googleMap) {
      const currentZoom = this.googleMap.googleMap.getZoom();
      if (
        currentZoom === undefined ||
        Math.abs(currentZoom - newZoom) > GoogleMap2dComponent.ZOOM_SYNC_EPSILON
      ) {
        this._runWhenMapViewportReady("zoom-input", () => {
          this.googleMap?.googleMap?.setZoom(newZoom);
        });
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

  setCamera(
    camera: {
      center: google.maps.LatLngLiteral | google.maps.LatLng;
      zoom: number;
    },
    reason: string = "programmatic",
  ): void {
    const center = toUsableMapCenterLiteral(camera.center);
    if (!center || !Number.isFinite(camera.zoom)) {
      reportInvalidMapCoordinate("Ignoring invalid setCamera request", camera);
      return;
    }

    this._center = center;
    this._zoom.set(Math.floor(camera.zoom));
    this._lastObservedNativeIntegerZoom = Math.floor(camera.zoom);
    this._setCommunityVisualZoom(camera.zoom, { animate: true });

    const nativeMap = this.googleMap?.googleMap;
    if (!nativeMap) {
      this.zoomChange.emit(this._zoom());
      return;
    }

    this._mapProfiler.record("google-map-2d:set-camera", {
      center,
      reason,
      zoom: camera.zoom,
    });

    this._runWhenMapViewportReady(`set-camera:${reason}`, () => {
      const activeMap = this.googleMap?.googleMap;
      if (!activeMap) return;

      const target = { center, zoom: camera.zoom };
      const moveCamera = activeMap.moveCamera?.bind(activeMap);
      if (moveCamera) {
        moveCamera(target);
      } else {
        activeMap.setCenter(center);
        activeMap.setZoom(camera.zoom);
      }

      this._rememberValidCamera({
        bounds: this.googleMap?.getBounds()?.toJSON() ?? null,
        center,
        source: reason,
        timestampMs: performance.now(),
        zoom: camera.zoom,
      });
    });
    this.zoomChange.emit(this._zoom());
  }

  setCenter(center: google.maps.LatLngLiteral): void {
    if (!isUsableMapCenterLiteral(center)) {
      reportInvalidMapCoordinate("Ignoring invalid setCenter request", center);
      return;
    }

    this.center = center;
  }

  onViewportChanged(_viewport: VisibleViewport): void {
    // default no-op. Implementations may override this to react to viewport changes.
  }

  getAndEmitChangedZoom() {
    if (!this.googleMap) return;
    if (this._isRecoveringInvalidCamera) {
      this._recordRecoverySuppressedCameraEvent("zoom-changed");
      return;
    }

    const camera = this._readCurrentCameraSnapshot("zoom-changed");
    if (!camera) {
      this._recoverInvalidCamera("zoom-changed");
      return;
    }

    this._rememberValidCamera(camera);
    const mapZoom = camera.zoom;
    const newZoom = Math.floor(mapZoom);
    if (newZoom === this._lastObservedNativeIntegerZoom) return;

    this._lastObservedNativeIntegerZoom = newZoom;
    this._debugMapEvent("zoomChanged", { zoom: newZoom, mapZoom });
    this._recordMapProfile("zoom-changed", {
      deferredRenderZoom: true,
      mapZoom,
      renderZoom: this._zoom(),
      zoom: newZoom,
    });
  }

  private _commitSettledCameraZoom(mapZoom: number, source: string): void {
    this._setCommunityVisualZoom(mapZoom, { animate: true });

    const newZoom = Math.floor(mapZoom);
    this._lastObservedNativeIntegerZoom = newZoom;
    if (newZoom === this._zoom()) return;

    const previousZoom = this._zoom();
    this._zoom.set(newZoom);
    this._mapProfiler.record("google-map-2d:render-zoom-settled", {
      mapZoom,
      previousZoom,
      source,
      zoom: newZoom,
    });
  }

  private _setCommunityVisualZoom(
    mapZoom: number,
    options: { animate?: boolean } = {},
  ): void {
    const steppedZoomUnits = Math.round(
      mapZoom / this.COMMUNITY_VISUAL_ZOOM_STEP,
    );
    const currentZoomUnits = Math.round(
      this._communityVisualZoom() / this.COMMUNITY_VISUAL_ZOOM_STEP,
    );

    if (steppedZoomUnits === currentZoomUnits) {
      return;
    }

    const targetZoom = steppedZoomUnits * this.COMMUNITY_VISUAL_ZOOM_STEP;
    if (!options.animate) {
      this._cancelCommunityVisualZoomAnimation();
      this._communityVisualZoom.set(targetZoom);
      return;
    }

    this._animateCommunityVisualZoom(targetZoom);
  }

  private _animateCommunityVisualZoom(targetZoom: number): void {
    this._cancelCommunityVisualZoomAnimation();

    const startZoom = this._communityVisualZoom();
    const zoomDelta = targetZoom - startZoom;
    if (Math.abs(zoomDelta) < 0.01) {
      this._communityVisualZoom.set(targetZoom);
      return;
    }

    const startMs = performance.now();
    const step = (nowMs: number) => {
      const elapsedMs = nowMs - startMs;
      const progress = Math.min(
        1,
        elapsedMs / this.COMMUNITY_VISUAL_ZOOM_ANIMATION_MS,
      );
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      this._communityVisualZoom.set(startZoom + zoomDelta * easedProgress);

      if (progress < 1) {
        this._communityVisualZoomAnimationFrameId = requestAnimationFrame(step);
        return;
      }

      this._communityVisualZoomAnimationFrameId = null;
      this._communityVisualZoom.set(targetZoom);
    };

    this._communityVisualZoomAnimationFrameId = requestAnimationFrame(step);
  }

  private _cancelCommunityVisualZoomAnimation(): void {
    if (this._communityVisualZoomAnimationFrameId === null) return;

    cancelAnimationFrame(this._communityVisualZoomAnimationFrameId);
    this._communityVisualZoomAnimationFrameId = null;
  }

  private _runWhenMapViewportReady(
    reason: string,
    run: () => void,
    options: { isRecovery?: boolean } = {},
  ): void {
    if (this._isMapViewportReady()) {
      run();
      return;
    }

    if (
      this._pendingCameraOperation?.isRecovery &&
      !options.isRecovery
    ) {
      return;
    }

    this._pendingCameraOperation = {
      attempt: 0,
      hasReportedWait: false,
      isRecovery: options.isRecovery ?? false,
      reason,
      requestedAtMs: performance.now(),
      run,
    };
    this._schedulePendingCameraOperation();
  }

  private _schedulePendingCameraOperation(): void {
    if (this._pendingCameraOperationFrameId !== null) return;

    this._pendingCameraOperationFrameId = requestAnimationFrame(() => {
      this._pendingCameraOperationFrameId = null;
      const operation = this._pendingCameraOperation;
      if (!operation) return;

      if (this._isMapViewportReady()) {
        this._pendingCameraOperation = null;
        operation.run();
        return;
      }

      const elapsedMs = performance.now() - operation.requestedAtMs;
      if (
        !operation.hasReportedWait &&
        elapsedMs >=
        GoogleMap2dComponent.CAMERA_OPERATION_WAIT_TIMEOUT_MS
      ) {
        this._mapProfiler.record("google-map-2d:camera-operation-deferred", {
          elapsedMs: Math.round(elapsedMs),
          reason: operation.reason,
          size: this._getMapViewportSize(),
        });
      }

      this._pendingCameraOperation = {
        ...operation,
        attempt: operation.attempt + 1,
        hasReportedWait:
          operation.hasReportedWait ||
          elapsedMs >=
            GoogleMap2dComponent.CAMERA_OPERATION_WAIT_TIMEOUT_MS,
      };
      this._schedulePendingCameraOperation();
    });
  }

  private _clearPendingCameraOperation(): void {
    if (this._pendingCameraOperationFrameId !== null) {
      cancelAnimationFrame(this._pendingCameraOperationFrameId);
      this._pendingCameraOperationFrameId = null;
    }
    this._pendingCameraOperation = null;
  }

  private _isMapViewportReady(): boolean {
    const size = this._getMapViewportSize();
    return (
      size.width >= GoogleMap2dComponent.CAMERA_OPERATION_MIN_VIEWPORT_SIZE_PX &&
      size.height >= GoogleMap2dComponent.CAMERA_OPERATION_MIN_VIEWPORT_SIZE_PX
    );
  }

  private _getMapViewportSize(): { height: number; width: number } {
    const rect = this._hostElement.nativeElement.getBoundingClientRect();
    return {
      height: Math.round(rect.height),
      width: Math.round(rect.width),
    };
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
    if (this.showAllHighlightedSpotPins()) {
      return spots;
    }

    const layout = this._getMarkerCollisionLayout();
    return this._getHighlightedSpotCollisionPartition(spots, layout)
      .visibleSpots;
  }

  getVisibleSpotMarkers(): (LocalSpot | Spot)[] {
    const spots = this._getVisibleRegularSpotMarkers();
    const layout = this._getMarkerCollisionLayout();
    return this._getRegularSpotCollisionPartition(spots, layout).visibleSpots;
  }

  getVisiblePointMarkers(): MapPointMarker[] {
    const layout = this._getMarkerCollisionLayout();
    const zoom = this.zoom;
    return this._getPointMarkerCollisionPartition(layout, zoom).visibleMarkers;
  }

  getCollapsedCommunityMarkers(): MapPointMarker[] {
    const layout = this._getMarkerCollisionLayout();
    const zoom = this.zoom;
    return this._getPointMarkerCollisionPartition(layout, zoom)
      .collapsedCommunityMarkers;
  }

  private _getHighlightedSpotCollisionPartition(
    spots: SpotPreviewData[],
    layout: MapMarkerCollisionLayout,
  ): FilteredHighlightedSpotMarkersCache {
    const cached = this._filteredHighlightedSpotMarkersCache;
    if (cached?.spots === spots && cached.layout === layout) return cached;

    const visibleSpots = spots.filter(
      (spot) =>
        !layout.hiddenSpotIds.has(this._getSpotPreviewCollisionId(spot)),
    );

    return (this._filteredHighlightedSpotMarkersCache = {
      spots,
      layout,
      visibleSpots,
    });
  }

  private _getRegularSpotCollisionPartition(
    spots: (LocalSpot | Spot)[],
    layout: MapMarkerCollisionLayout,
  ): FilteredRegularSpotMarkersCache {
    const cached = this._filteredRegularSpotMarkersCache;
    if (cached?.spots === spots && cached.layout === layout) return cached;

    const visibleSpots = spots.filter(
      (spot) => !layout.hiddenSpotIds.has(this._getSpotModelCollisionId(spot)),
    );

    return (this._filteredRegularSpotMarkersCache = {
      spots,
      layout,
      visibleSpots,
    });
  }

  private _getPointMarkerCollisionPartition(
    layout: MapMarkerCollisionLayout,
    zoom: number,
  ): FilteredPointMarkersCache {
    const cached = this._filteredPointMarkersCache;
    if (
      cached?.markers === this.pointMarkers &&
      cached.layout === layout &&
      cached.zoom === zoom
    ) {
      return cached;
    }

    const visibleMarkers: MapPointMarker[] = [];
    const collapsedCommunityMarkers: MapPointMarker[] = [];
    for (const marker of this.pointMarkers) {
      if (!this._isPointMarkerVisibleAtZoom(marker, zoom)) continue;

      if (
        this._isCommunityCollisionMarker(marker) &&
        layout.hiddenCommunityIds.has(marker.id)
      ) {
        collapsedCommunityMarkers.push(marker);
        continue;
      }

      const isHiddenEvent =
        this._isEventCollisionMarker(marker) &&
        layout.hiddenEventIds.has(marker.id);
      const isHiddenPoint =
        !this._isEventCollisionMarker(marker) &&
        !this._isCommunityCollisionMarker(marker) &&
        layout.hiddenPointIds.has(marker.id);
      if (!isHiddenEvent && !isHiddenPoint) visibleMarkers.push(marker);
    }

    return (this._filteredPointMarkersCache = {
      markers: this.pointMarkers,
      layout,
      zoom,
      visibleMarkers,
      collapsedCommunityMarkers,
    });
  }

  getVisibleNativeCirclePointMarkers(): MapPointMarker[] {
    return this.getVisiblePointMarkers().filter((marker) =>
      this._isPointMarkerRenderedAsNativeCircle(marker),
    );
  }

  getVisibleHtmlPointMarkers(): MapPointMarker[] {
    return this.getVisiblePointMarkers().filter(
      (marker) => !this._isPointMarkerRenderedAsNativeCircle(marker),
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

    if (
      this._visibleHighlightedSpotPreviewsCache &&
      this._visibleHighlightedSpotPreviewsCache.spots === spots &&
      this._visibleHighlightedSpotPreviewsCache.selectedSpotId ===
        selectedSpotId
    ) {
      return this._visibleHighlightedSpotPreviewsCache.visibleSpots;
    }

    // Only filter out the selected spot - don't filter by bounds.
    const visibleSpots = selectedSpotId
      ? spots.filter((spot) => spot.id !== selectedSpotId)
      : spots;

    this._visibleHighlightedSpotPreviewsCache = {
      spots,
      selectedSpotId,
      visibleSpots,
    };

    return visibleSpots;
  }

  private _getVisibleRegularSpotMarkers(): (LocalSpot | Spot)[] {
    const shouldRenderRegularSpotMarkers =
      ((this.zoom >= 16 && this.showSpotPreview()) ||
        this.showVisibleSpotPins()) &&
      !this.hideRegularSpotPins();
    const selectedSpot = this.selectedSpot();
    const isEditing = this.isEditing();
    const highlightedSpots = this._getVisibleHighlightedSpotPreviews();

    if (!shouldRenderRegularSpotMarkers) {
      return [];
    }

    if (
      this._visibleRegularSpotMarkersCache &&
      this._visibleRegularSpotMarkersCache.spots === this.spots &&
      this._visibleRegularSpotMarkersCache.highlightedSpots ===
        highlightedSpots &&
      this._visibleRegularSpotMarkersCache.selectedSpot === selectedSpot &&
      this._visibleRegularSpotMarkersCache.isEditing === isEditing &&
      this._visibleRegularSpotMarkersCache.shouldRenderRegularSpotMarkers ===
        shouldRenderRegularSpotMarkers
    ) {
      return this._visibleRegularSpotMarkersCache.visibleSpots;
    }

    const highlightedSpotIds = new Set(highlightedSpots.map((spot) => spot.id));
    const visibleSpots = this.spots.filter(
      (spot) =>
        !this.isSelectedSpotBeingEdited(spot) &&
        !this.isSameAsSelectedSpot(spot) &&
        !this._hasHighlightedPreviewMarker(spot, highlightedSpotIds),
    );

    this._visibleRegularSpotMarkersCache = {
      spots: this.spots,
      highlightedSpots,
      selectedSpot,
      isEditing,
      shouldRenderRegularSpotMarkers,
      visibleSpots,
    };

    return visibleSpots;
  }

  private _hasHighlightedPreviewMarker(
    spot: LocalSpot | Spot,
    highlightedSpotIds: ReadonlySet<string>,
  ): boolean {
    return spot instanceof Spot && highlightedSpotIds.has(spot.id);
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

    const eventCandidates = this._getEventCollisionCandidates(zoom);
    const communityCandidates = this._getCommunityCollisionCandidates(zoom);
    const pointCandidates = this._getPointCollisionCandidates(zoom);
    const highlightedSpotCandidates =
      this._getSpotPreviewCollisionCandidates(highlightedSpots, zoom);
    const regularSpotCandidates =
      this._getSpotModelCollisionCandidates(regularSpots, zoom);
    const candidates = [
      ...eventCandidates,
      ...communityCandidates,
      ...pointCandidates,
      ...highlightedSpotCandidates,
      ...regularSpotCandidates,
    ];

    const startedAt = performance.now();
    const layout = filterEventSpotCollisions(candidates, zoom);
    const durationMs = performance.now() - startedAt;

    this._markerCollisionLayoutCache = {
      highlightedSpots,
      pointMarkers: this.pointMarkers,
      regularSpots,
      zoom,
      layout,
    };
    this._recordCollisionProfile({
      durationMs,
      inputCounts: {
        communities: communityCandidates.length,
        events: eventCandidates.length,
        highlightedSpots: highlightedSpotCandidates.length,
        points: pointCandidates.length,
        regularSpots: regularSpotCandidates.length,
        total: candidates.length,
      },
      layout,
      zoom,
    });

    return layout;
  }

  private _recordCollisionProfile(args: {
    durationMs: number;
    inputCounts: {
      communities: number;
      events: number;
      highlightedSpots: number;
      points: number;
      regularSpots: number;
      total: number;
    };
    layout: MapMarkerCollisionLayout;
    zoom: number;
  }): void {
    const spotInputCount =
      args.inputCounts.highlightedSpots + args.inputCounts.regularSpots;
    const hiddenCounts = {
      communities: args.layout.hiddenCommunityIds.size,
      events: args.layout.hiddenEventIds.size,
      points: args.layout.hiddenPointIds.size,
      spots: args.layout.hiddenSpotIds.size,
      total:
        args.layout.hiddenCommunityIds.size +
        args.layout.hiddenEventIds.size +
        args.layout.hiddenPointIds.size +
        args.layout.hiddenSpotIds.size,
    };

    this._mapProfiler.recordThrottled(
      "google-map-2d:collision",
      {
        durationMs: Math.round(args.durationMs * 100) / 100,
        hiddenCounts,
        hiddenPercent: {
          communities: this._percentage(
            hiddenCounts.communities,
            args.inputCounts.communities,
          ),
          events: this._percentage(hiddenCounts.events, args.inputCounts.events),
          points: this._percentage(hiddenCounts.points, args.inputCounts.points),
          spots: this._percentage(hiddenCounts.spots, spotInputCount),
          total: this._percentage(hiddenCounts.total, args.inputCounts.total),
        },
        inputCounts: args.inputCounts,
        visibleCounts: {
          communities:
            args.inputCounts.communities - hiddenCounts.communities,
          events: args.inputCounts.events - hiddenCounts.events,
          points: args.inputCounts.points - hiddenCounts.points,
          spots: spotInputCount - hiddenCounts.spots,
          total: args.inputCounts.total - hiddenCounts.total,
        },
        zoom: args.zoom,
      },
      750,
    );
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
      .map(
        (marker): MapMarkerCollisionCandidate => ({
          id: marker.id,
          kind: "event",
          location: marker.location,
          priority: getMapMarkerPriority(marker),
          widthPx: EVENT_MARKER_COLLISION_SIZE_PX,
          heightPx: EVENT_MARKER_COLLISION_SIZE_PX,
          anchor: "center",
        }),
      );
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
      .map((marker): MapMarkerCollisionCandidate => {
        const sizePx = marker.forceFullMarker
          ? COMMUNITY_FULL_MARKER_COLLISION_SIZE_PX
          : COMMUNITY_DOT_COLLISION_SIZE_PX;

        return {
          id: marker.id,
          kind: "community",
          location: marker.location,
          priority: getMapMarkerPriority(marker),
          widthPx: sizePx,
          heightPx: sizePx,
          anchor: "center",
        };
      });
  }

  private _getPointCollisionCandidates(
    zoom: number,
  ): MapMarkerCollisionCandidate[] {
    return this.pointMarkers
      .filter(
        (marker) =>
          !this._isEventCollisionMarker(marker) &&
          !this._isCommunityCollisionMarker(marker) &&
          this._isPointMarkerVisibleAtZoom(marker, zoom) &&
          marker.priority !== "required" &&
          marker.ignoreCollisions !== true,
      )
      .map((marker): MapMarkerCollisionCandidate => {
        const sizePx = this._getPointMarkerCollisionSize(marker, zoom);

        return {
          id: marker.id,
          kind: "point",
          location: marker.location,
          priority: getMapMarkerPriority(marker),
          widthPx: sizePx,
          heightPx: sizePx,
          anchor: "center",
        };
      });
  }

  private _getSpotPreviewCollisionCandidates(
    spots: readonly SpotPreviewData[],
    zoom: number,
  ): MapMarkerCollisionCandidate[] {
    const dimensions = getSpotMarkerCollisionDimensions(zoom);

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
            isReported: spot.isReported,
            hasMedia: !!spot.imageSrc,
          }),
          ...dimensions,
          anchor: "bottom-center",
        },
      ];
    });
  }

  private _getSpotModelCollisionCandidates(
    spots: readonly (LocalSpot | Spot)[],
    zoom: number,
  ): MapMarkerCollisionCandidate[] {
    const dimensions = getSpotMarkerCollisionDimensions(zoom);

    return spots.map(
      (spot): MapMarkerCollisionCandidate => ({
        id: this._getSpotModelCollisionId(spot),
        kind: "spot",
        location: spot.location(),
        priority: getSpotMarkerPriority({
          rating: spot.rating,
          access: spot.access(),
          isIconic: spot.isIconic,
          isReported: spot.isReported,
          hasMedia: spot.userMedia().some((media) => !media.isReported),
        }),
        ...dimensions,
        anchor: "bottom-center",
      }),
    );
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

  private _isPointMarkerRenderedAsNativeCircle(
    marker: MapPointMarker,
  ): boolean {
    const zoom = this.googleMap?.getZoom() ?? this.zoom;
    if (zoom > POINT_MARKER_NATIVE_CIRCLE_MAX_ZOOM) {
      return false;
    }

    if (
      marker.forceFullMarker ||
      marker.priority === "required" ||
      marker.ignoreCollisions
    ) {
      return false;
    }

    return (
      this._isEventCollisionMarker(marker) ||
      this._isCommunityCollisionMarker(marker)
    );
  }

  private _getPointMarkerCollisionSize(
    marker: MapPointMarker,
    zoom: number,
  ): number {
    const dotModeThreshold = marker.dotModeThreshold ?? 17;
    if (!marker.forceFullMarker && zoom <= dotModeThreshold) {
      return POINT_MARKER_DOT_COLLISION_SIZE_PX;
    }

    return POINT_MARKER_FULL_COLLISION_SIZE_PX;
  }

  private _percentage(count: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((count / total) * 10_000) / 100;
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

  getSpotMarkerLocation(
    spot: LocalSpot | Spot | SpotPreviewData,
  ): google.maps.LatLngLiteral | null {
    if (spot instanceof Spot || spot instanceof LocalSpot) {
      return spot.location();
    }

    return spot.location
      ? { lat: spot.location.latitude, lng: spot.location.longitude }
      : null;
  }

  getSpotMarkerLabel(spot: LocalSpot | Spot | SpotPreviewData): string {
    return spot instanceof Spot || spot instanceof LocalSpot
      ? spot.name()
      : spot.name;
  }

  getVisibleHighlightedSpotAreas(): SpotPreviewAreaOverlay[] {
    if (this.zoom < SPOT_AREA_MIN_ZOOM) {
      return this._emptyHighlightedSpotAreas;
    }

    const spots = this._getVisibleHighlightedSpotPreviews();
    if (
      this._visibleHighlightedSpotAreasCache &&
      this._visibleHighlightedSpotAreasCache.spots === spots
    ) {
      return this._visibleHighlightedSpotAreasCache.areas;
    }

    const areas = spots
      .map((spot) => this._getSpotPreviewAreaOverlay(spot))
      .filter((area): area is SpotPreviewAreaOverlay => !!area);

    this._visibleHighlightedSpotAreasCache = {
      spots,
      areas,
    };

    return areas;
  }

  getHighlightZIndex(_spot: SpotPreviewData): number {
    return 0;
  }

  resetMapOrientation() {
    if (!this.googleMap) return;

    this._runWhenMapViewportReady("reset-map-orientation", () => {
      this.googleMap?.fitBounds(this.googleMap.getBounds()!, {
        bottom: -100,
        top: -100,
        left: -100,
        right: -100,
      });
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
  private _visibleHighlightedSpotPreviewsCache: VisibleHighlightedSpotPreviewsCache | null =
    null;
  private _filteredHighlightedSpotMarkersCache: FilteredHighlightedSpotMarkersCache | null =
    null;
  private _filteredRegularSpotMarkersCache: FilteredRegularSpotMarkersCache | null =
    null;
  private _filteredPointMarkersCache: FilteredPointMarkersCache | null = null;
  private _visibleHighlightedSpotAreasCache: VisibleHighlightedSpotAreasCache | null =
    null;
  private readonly _emptyHighlightedSpotAreas: SpotPreviewAreaOverlay[] = [];
  private readonly _circleOverlayRenderStateCache = new WeakMap<
    MapCircleOverlay,
    CircleOverlayRenderState
  >();
  private readonly _pointMarkerCircleRenderStateCache = new WeakMap<
    MapPointMarker,
    PointMarkerCircleRenderState
  >();

  /**
   * Passive locality circles begin with the stronger dot treatment while
   * they are tiny, then ease toward the softer active-circle treatment as
   * they become large on screen. This avoids an abrupt visual hand-off when
   * a user opens a community and also keeps close-up circles out of the way.
   */
  circleOverlayOptions(circle: MapCircleOverlay): google.maps.CircleOptions {
    return this._getCircleOverlayRenderState(circle).options;
  }

  pointMarkerCircleOptions(marker: MapPointMarker): google.maps.CircleOptions {
    return this._getPointMarkerCircleRenderState(marker).options;
  }

  pointMarkerCircleRadius(marker: MapPointMarker): number {
    return this._getPointMarkerCircleRenderState(marker).radiusM;
  }

  isCircleOverlayClickable(circle: MapCircleOverlay): boolean {
    return this._getCircleOverlayRenderState(circle).clickable;
  }

  private _getCircleOverlayRenderState(
    circle: MapCircleOverlay,
  ): CircleOverlayRenderState {
    const visualZoom = this._communityVisualZoom();
    const darkMode = this.resolvedDarkMode();
    const cached = this._circleOverlayRenderStateCache.get(circle);
    if (
      cached &&
      cached.visualZoom === visualZoom &&
      cached.darkMode === darkMode &&
      cached.inputOptions === circle.options
    ) {
      return cached;
    }

    const diameterPx = this._circleDiameterPx(circle);
    const fade = this._smoothstep(10, 320, diameterPx);
    const primary = this._getCssColorAsHex("--mat-sys-primary", "#0036ba");
    const primaryBorder = this._getCssColorAsHex(
      "--mat-sys-on-primary-container",
      "#001a67",
    );

    const clickable =
      (circle.options?.clickable ?? true) &&
      diameterPx <= this.COMMUNITY_CIRCLE_CLICK_MAX_DIAMETER_PX;
    const options: google.maps.CircleOptions = {
      fillColor: primary,
      fillOpacity: this._lerp(0.85, 0.08, fade),
      strokeColor: this._mixHexColor(primaryBorder, primary, fade),
      strokeOpacity: this._lerp(1, 0.28, fade),
      strokeWeight: this._lerp(1, 1, fade),
      ...circle.options,
      clickable,
    };

    const state: CircleOverlayRenderState = {
      darkMode,
      inputOptions: circle.options,
      options,
      clickable,
      visualZoom,
    };
    this._circleOverlayRenderStateCache.set(circle, state);
    return state;
  }

  private _getPointMarkerCircleRenderState(
    marker: MapPointMarker,
  ): PointMarkerCircleRenderState {
    const darkMode = this.resolvedDarkMode();
    const visualZoom = this._communityVisualZoom();
    const cached = this._pointMarkerCircleRenderStateCache.get(marker);
    if (
      cached &&
      cached.darkMode === darkMode &&
      cached.marker === marker &&
      cached.visualZoom === visualZoom
    ) {
      return cached;
    }

    const fillColor = this._getMarkerCssColor(marker.color);
    const strokeColor = this._getMarkerCssStrokeColor(marker.color);
    const radiusPx = this._isEventCollisionMarker(marker) ? 7 : 5;
    const radiusM = Math.max(
      1,
      radiusPx *
        this._metersPerPixelAtLatitude(marker.location.lat, visualZoom),
    );
    const options: google.maps.CircleOptions = {
      clickable: true,
      fillColor,
      fillOpacity: this._isEventCollisionMarker(marker) ? 0.9 : 0.82,
      strokeColor,
      strokeOpacity: 1,
      strokeWeight: this._isEventCollisionMarker(marker) ? 2 : 1,
      zIndex: getMapMarkerPriority(marker),
    };
    const state: PointMarkerCircleRenderState = {
      darkMode,
      marker,
      options,
      radiusM,
      visualZoom,
    };
    this._pointMarkerCircleRenderStateCache.set(marker, state);
    return state;
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

  private _getMarkerCssColor(color: MapPointMarker["color"]): string {
    switch (color) {
      case "secondary":
        return this._getCssColorAsHex("--mat-sys-secondary", "#1a6c19");
      case "tertiary":
        return this._getCssColorAsHex("--mat-sys-tertiary", "#625b71");
      case "gray":
        return this._getCssColorAsHex("--mat-sys-outline", "#79747e");
      case "primary":
      default:
        return this._getCssColorAsHex("--mat-sys-primary", "#0036ba");
    }
  }

  private _getMarkerCssStrokeColor(color: MapPointMarker["color"]): string {
    switch (color) {
      case "secondary":
        return this._getCssColorAsHex(
          "--mat-sys-on-secondary-container",
          "#002204",
        );
      case "tertiary":
        return this._getCssColorAsHex(
          "--mat-sys-on-tertiary-container",
          "#1d192b",
        );
      case "gray":
        return this._getCssColorAsHex("--mat-sys-surface", "#ffffff");
      case "primary":
      default:
        return this._getCssColorAsHex(
          "--mat-sys-on-primary-container",
          "#001a67",
        );
    }
  }

  private _metersPerPixelAtLatitude(latitude: number, zoom: number): number {
    const latitudeRadians = (latitude * Math.PI) / 180;
    return (156_543.033_92 * Math.cos(latitudeRadians)) / Math.pow(2, zoom);
  }

  private _lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress;
  }

  private _smoothstep(start: number, end: number, value: number): number {
    const normalized = Math.max(
      0,
      Math.min(1, (value - start) / (end - start)),
    );
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
      intZoom,
    );
    const swTile = MapHelpers.getTileCoordinatesForLocationAndZoom(
      boundsToRender.getSouthWest().toJSON(),
      intZoom,
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
    private _hostElement: ElementRef<HTMLElement>,
    private geolocationService: GeolocationService,
    private snackBar: MatSnackBar,
    private _mapProfiler: MapPerformanceProfilerService,
    private _ngZone: NgZone,
    private _appSettings: AppSettingsService,
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
          },
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

    effect(() => {
      const enableVectorMaps = this._appSettings.enableVectorMaps();
      if (!this._hasInitializedNativeMap) {
        void this._updateMapConfig();
        return;
      }

      const fallback = this._getCameraRecoveryFallback(
        "map-rendering-setting-changed",
      );
      this._mapProfiler.record("google-map-2d:rendering-setting-changed", {
        enableVectorMaps,
        fallback,
      });
      this._forceRecreateNativeMap("map-rendering-setting-changed", fallback);
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
          "tiles",
        );
        return;
      }

      this.visibleTilesChange.emit(visibleTiles);
      this._mapProfiler.recordThrottled(
        "google-map-2d:visible-tiles",
        {
          center: visibleTiles.center ?? null,
          tileCount: visibleTiles.tiles.length,
          viewportBounds: visibleTiles.viewportBounds ?? null,
          zoom: visibleTiles.zoom,
        },
        750,
      );

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
  private _tiltChangedSubscription: Subscription | null = null;
  private _cameraIdleListener: google.maps.MapsEventListener | null = null;
  private _zoomChangedListener: google.maps.MapsEventListener | null = null;
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
    this._recordMapProfile("ready");

    if (this.googleMap.googleMap && !this._hasInitializedNativeMap) {
      const initialCamera = this._readCurrentCameraSnapshot("map-ready");
      if (initialCamera) {
        this._rememberValidCamera(initialCamera);
      } else {
        this._rememberValidCamera({
          bounds: null,
          center: this.center,
          source: "initial-input",
          timestampMs: performance.now(),
          zoom: this.zoom,
        });
      }
      this._hasInitializedNativeMap = true;
    }

    this._ensurePassiveGeolocationWatch();

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
    this._enforceTwoDimensionalCamera("map-ready");
    this._subscribeToCameraEvents();
    this._subscribeToHeadingChanges();
    this._subscribeToTiltChanges();
    this._subscribeToMapCapabilitiesChanges();
    this._watchMapCanvasContextLoss();
    void this._updateFeatureBoundaryStyle();

    if (this.isDebug()) {
      this._startFpsLoop();
    } else {
      this._stopFpsLoop(true);
    }
  }

  private async _updateMapConfig() {
    const desiredMapTypeId = this.mapTypeId();
    const nextOptions: google.maps.MapOptions = {
      ...this.mapOptions,
      mapTypeId: desiredMapTypeId,
    };
    const vectorRenderingType = this._getVectorRenderingType();
    const rasterRenderingType = this._getRasterRenderingType();
    const colorScheme = await this._loadDarkColorScheme();

    const shouldPreferRaster = this._shouldPreferRasterRendering();
    const shouldUseFractionalZoom = !this._shouldDisableFractionalZoom();
    nextOptions.isFractionalZoomEnabled = shouldUseFractionalZoom;
    const isMapInitialized = !!this.googleMap?.googleMap;

    if (!isMapInitialized) {
      nextOptions.center = this.center;
      nextOptions.zoom = this.zoom;

      if (shouldPreferRaster && rasterRenderingType) {
        nextOptions.renderingType = rasterRenderingType;
      } else if (shouldPreferRaster) {
        nextOptions.renderingType = "RASTER" as google.maps.RenderingType;
      } else if (vectorRenderingType) {
        nextOptions.renderingType = vectorRenderingType;
      } else if (environment.mapId) {
        // Fallback: if Map ID is present but enum not loaded yet, force VECTOR string
        (
          nextOptions as google.maps.MapOptions & {
            renderingType: google.maps.RenderingType | "VECTOR";
          }
        ).renderingType = "VECTOR";
      }
    } else {
      delete (nextOptions as Partial<google.maps.MapOptions>).renderingType;
      delete (nextOptions as Partial<google.maps.MapOptions>).center;
      delete (nextOptions as Partial<google.maps.MapOptions>).zoom;
    }

    if (colorScheme) {
      (
        nextOptions as google.maps.MapOptions & { colorScheme: string }
      ).colorScheme = colorScheme;
    } else {
      delete (
        nextOptions as google.maps.MapOptions & {
          colorScheme?: unknown;
        }
      ).colorScheme;
    }

    // If map is already initialized, use setOptions.
    // `renderingType` must not be changed after instantiation.
    if (isMapInitialized && this.googleMap?.googleMap) {
      try {
        const staleCameraOptions = {
          center: this.mapOptions.center ?? null,
          zoom: this.mapOptions.zoom ?? null,
        };
        this.googleMap.googleMap.setOptions(nextOptions);
        this._recordMapProfile("config-updated", {
          cameraOptionsSuppressed: true,
          isFractionalZoomEnabled: shouldUseFractionalZoom,
          mapTypeId: desiredMapTypeId,
          requestedRenderingType: nextOptions.renderingType ?? null,
          staleCameraOptions,
        });
      } catch (e) {
        console.warn("Failed to update map config:", e);
      }
      return;
    }

    // Otherwise update mapOptions before initialization
    try {
      this.mapOptions = nextOptions;
      this.optionsInitialized.set(true);
      this._mapProfiler.record("google-map-2d:config-initialized", {
        mapIdPresent: !!environment.mapId,
        enableVectorMaps: this._appSettings.enableVectorMaps(),
        mapTypeId: desiredMapTypeId,
        isFractionalZoomEnabled: shouldUseFractionalZoom,
        requestedRenderingType: nextOptions.renderingType ?? null,
        rasterFallback: shouldPreferRaster,
      });
    } catch (e) {
      console.warn("Failed to set map config:", e);
      this.optionsInitialized.set(true); // Proceed anyway
    }
  }

  private _shouldPreferRasterRendering(): boolean {
    return !this._appSettings.enableVectorMaps();
  }

  private _shouldDisableFractionalZoom(): boolean {
    return !this._appSettings.enableVectorMaps();
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

  private _getRasterRenderingType(): google.maps.RenderingType | null {
    const mapsApi = this._getGoogleMapsApi();
    return mapsApi?.RenderingType?.RASTER ?? null;
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
    if (!isFiniteBoundsLiteral(this.fitToBounds)) {
      reportInvalidMapCoordinate(
        "Ignoring invalid fitToBounds input",
        this.fitToBounds,
      );
      return;
    }

    this._allowProgrammaticCameraJump("fit-to-bounds-input");
    this._runWhenMapViewportReady("fit-to-bounds-input", () => {
      this.googleMap?.fitBounds(this.fitToBounds!, 40);
    });
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

    if (changes["showGeolocation"]) {
      this._ensurePassiveGeolocationWatch();
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
    if (this._tiltChangedSubscription)
      this._tiltChangedSubscription.unsubscribe();
    this._clearCameraEventListeners();
    this._mapCapabilitiesChangedListener?.remove();
    this._mapCapabilitiesChangedListener = null;
    this._clearMapCanvasContextListeners();
    this._featureBoundaryRequestVersion++;
    this._clearFeatureBoundaryStyle();
    this._clearInvalidCameraRecoveryTimeout();
    this._clearCameraRecoveryVerificationTimeout();
    this._clearWebGlContextRecoveryTimeout();
    this._cancelCommunityVisualZoomAnimation();
    this._clearPendingCameraOperation();
    this._clearCameraIdleWatchdog();
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
    if (!this._appSettings.enableVectorMaps()) {
      this._mapProfiler.recordThrottled(
        "google-map-2d:feature-boundary-skipped-raster",
        { featureType: boundary.featureType },
        2_000,
      );
      return;
    }

    const capabilities = map.getMapCapabilities();
    if (!capabilities.isDataDrivenStylingAvailable) {
      console.warn(
        "Google Maps data-driven styling is not available for this map yet.",
        capabilities,
      );
      return;
    }

    const featureType = await this._getFeatureBoundaryFeatureType(
      boundary.featureType,
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
        "Google Maps COUNTRY boundary layer is not available for this map ID. Enable data-driven styling for COUNTRY boundaries in the Google Cloud map style.",
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
    featureType: "COUNTRY",
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
        "places",
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
      /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/iu,
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

  private _subscribeToCameraEvents(): void {
    if (
      this._cameraIdleListener ||
      this._zoomChangedListener ||
      !this.googleMap?.googleMap
    ) {
      return;
    }

    const nativeMap = this.googleMap.googleMap;
    this._ngZone.runOutsideAngular(() => {
      this._cameraIdleListener = nativeMap.addListener("idle", () => {
        this._ngZone.run(() => this.cameraIdle());
      });
      this._zoomChangedListener = nativeMap.addListener("zoom_changed", () => {
        this._handleNativeZoomChangedOutsideAngular();
      });
    });
  }

  private _clearCameraEventListeners(): void {
    this._cameraIdleListener?.remove();
    this._cameraIdleListener = null;
    this._zoomChangedListener?.remove();
    this._zoomChangedListener = null;
  }

  private _handleNativeZoomChangedOutsideAngular(): void {
    if (this._isRecoveringInvalidCamera) {
      this._ngZone.run(() => this.getAndEmitChangedZoom());
      return;
    }

    const mapZoom = this.googleMap?.googleMap?.getZoom();
    if (typeof mapZoom !== "number" || !Number.isFinite(mapZoom)) {
      this._ngZone.run(() => this.getAndEmitChangedZoom());
      return;
    }

    this._scheduleCameraIdleWatchdog();
    const newZoom = Math.floor(mapZoom);
    if (newZoom === this._lastObservedNativeIntegerZoom) return;

    this._lastObservedNativeIntegerZoom = newZoom;
    this._debugMapEvent("zoomChanged", {
      mapZoom,
      zoom: newZoom,
    });
    this._recordMapProfile("zoom-changed", {
      deferredRenderZoom: true,
      lightweightCameraRead: true,
      mapZoom,
      renderZoom: this._zoom(),
      zoom: newZoom,
    });
  }

  private _watchMapCanvasContextLoss(): void {
    const mapDiv = this.googleMap?.googleMap?.getDiv();
    if (!mapDiv || this._mapCanvasObserver) {
      return;
    }

    this._registerMapCanvasContextListeners(mapDiv);
    this._mapCanvasObserver = new MutationObserver(() => {
      this._registerMapCanvasContextListeners(mapDiv);
    });
    this._mapCanvasObserver.observe(mapDiv, {
      childList: true,
      subtree: true,
    });
  }

  private _registerMapCanvasContextListeners(mapDiv: HTMLElement): void {
    mapDiv.querySelectorAll("canvas").forEach((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) {
        return;
      }
      if (this._watchedMapCanvases.has(canvas)) {
        return;
      }

      const lostListener = (event: Event) => {
        event.preventDefault();
        this._ngZone.run(() => this._handleMapWebGlContextLost(event));
      };
      const restoredListener = (event: Event) => {
        this._ngZone.run(() => this._handleMapWebGlContextRestored(event));
      };

      canvas.addEventListener("webglcontextlost", lostListener);
      canvas.addEventListener("webglcontextrestored", restoredListener);
      this._watchedMapCanvases.set(canvas, {
        canvas,
        lostListener,
        restoredListener,
      });
    });
  }

  private _handleMapWebGlContextLost(event: Event): void {
    const contextEvent = event as WebGLContextEvent;
    const fallback = this._getCameraRecoveryFallback("webgl-context-lost");
    this._mapProfiler.record("google-map-2d:webgl-context-lost", {
      fallback,
      statusMessage: contextEvent.statusMessage || null,
    });
    reportInvalidMapCoordinate("Google Maps WebGL context lost", {
      fallback,
      statusMessage: contextEvent.statusMessage || null,
    });

    this._clearWebGlContextRecoveryTimeout();
    this._webGlContextRecoveryTimeoutId = setTimeout(() => {
      this._webGlContextRecoveryTimeoutId = null;
      this._forceRecreateNativeMap("webgl-context-lost", fallback);
    }, 100);
  }

  private _handleMapWebGlContextRestored(event: Event): void {
    const contextEvent = event as WebGLContextEvent;
    this._mapProfiler.record("google-map-2d:webgl-context-restored", {
      statusMessage: contextEvent.statusMessage || null,
    });
  }

  private _clearMapCanvasContextListeners(): void {
    this._mapCanvasObserver?.disconnect();
    this._mapCanvasObserver = null;

    this._watchedMapCanvases.forEach(
      ({ canvas, lostListener, restoredListener }) => {
        canvas.removeEventListener("webglcontextlost", lostListener);
        canvas.removeEventListener("webglcontextrestored", restoredListener);
      },
    );
    this._watchedMapCanvases.clear();
  }

  private _clearWebGlContextRecoveryTimeout(): void {
    if (this._webGlContextRecoveryTimeoutId === null) return;

    clearTimeout(this._webGlContextRecoveryTimeoutId);
    this._webGlContextRecoveryTimeoutId = null;
  }

  private _scheduleCameraIdleWatchdog(): void {
    this._clearCameraIdleWatchdog();
    this._cameraIdleWatchdogTimeoutId = setTimeout(() => {
      this._cameraIdleWatchdogTimeoutId = null;
      this._ngZone.run(() => this._handleCameraIdleWatchdogTimeout());
    }, GoogleMap2dComponent.CAMERA_IDLE_WATCHDOG_MS);
  }

  private _handleCameraIdleWatchdogTimeout(): void {
    if (!this.googleMap?.googleMap || this._isRecoveringInvalidCamera) {
      return;
    }

    const camera = this._readCurrentCameraSnapshot("zoom-idle-watchdog");
    const fallback =
      camera ?? this._getCameraRecoveryFallback("zoom-idle-watchdog");
    this._mapProfiler.record("google-map-2d:camera-idle-watchdog-timeout", {
      fallback,
      hadValidCamera: Boolean(camera),
    });
    this._forceRecreateNativeMap("zoom-idle-watchdog-timeout", fallback);
  }

  private _clearCameraIdleWatchdog(): void {
    if (this._cameraIdleWatchdogTimeoutId === null) return;

    clearTimeout(this._cameraIdleWatchdogTimeoutId);
    this._cameraIdleWatchdogTimeoutId = null;
  }

  private _subscribeToHeadingChanges(): void {
    if (this._headingChangedSubscription || !this.googleMap) return;

    this._headingChangedSubscription = this.googleMap.headingChanged.subscribe(
      () => {
        const heading = this.googleMap?.getHeading() ?? 0;
        this.headingIsNotNorth.set(heading !== 0);
        if (heading !== 0) {
          this._enforceTwoDimensionalCamera("heading-changed");
        }
      },
    );
  }

  private _subscribeToTiltChanges(): void {
    if (this._tiltChangedSubscription || !this.googleMap) return;

    this._tiltChangedSubscription = this.googleMap.tiltChanged.subscribe(() => {
      const tilt = this.googleMap?.getTilt() ?? 0;
      if (tilt !== 0) {
        this._enforceTwoDimensionalCamera("tilt-changed");
      }
    });
  }

  private _enforceTwoDimensionalCamera(source: string): void {
    const nativeMap = this.googleMap?.googleMap;
    if (!nativeMap) return;

    const heading = nativeMap.getHeading() ?? 0;
    const tilt = nativeMap.getTilt() ?? 0;
    const headingInteractionEnabled =
      nativeMap.getHeadingInteractionEnabled?.() ?? null;
    const tiltInteractionEnabled =
      nativeMap.getTiltInteractionEnabled?.() ?? null;

    this._mapProfiler.recordThrottled(
      "google-map-2d:enforce-2d-camera",
      {
        heading,
        headingInteractionEnabled,
        source,
        tilt,
        tiltInteractionEnabled,
      },
      500,
    );

    nativeMap.setHeadingInteractionEnabled(false);
    nativeMap.setTiltInteractionEnabled(false);

    if (heading !== 0) {
      nativeMap.setHeading(0);
      this.headingIsNotNorth.set(false);
    }

    if (tilt !== 0) {
      nativeMap.setTilt(0);
    }
  }

  private _subscribeToMapCapabilitiesChanges(): void {
    if (this._mapCapabilitiesChangedListener || !this.googleMap?.googleMap) {
      return;
    }

    this._mapCapabilitiesChangedListener = this.googleMap.googleMap.addListener(
      "mapcapabilities_changed",
      () => {
        this._recordMapProfile("capabilities-changed");
        void this._updateFeatureBoundaryStyle();
      },
    );
  }

  private _geoPointToLatLng(
    geoPoint: GeoPoint,
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
      this._geolocationStarted = true;
    }
  }

  private _ensurePassiveGeolocationWatch(): void {
    if (!this.showGeolocation || this._hasStartedPassiveLocationWatch) return;

    this._hasStartedPassiveLocationWatch = true;
    void this.initGeolocation();
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
      this.setCamera({ center: pos.location, zoom: 17 }, "geolocation");
    } else {
      // If we don't have a location yet, try to get it once
      const pos = await this.geolocationService.getCurrentPosition();
      if (pos && this.googleMap) {
        this.setCamera({ center: pos.location, zoom: 17 }, "geolocation");
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
    tiltInteractionEnabled: false,
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
          (this._frameCount * 1000) / (now - this._lastFpsUpdate),
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

  cameraIdle() {
    this._clearCameraIdleWatchdog();
    if (this._isRecoveringInvalidCamera) {
      this._recordRecoverySuppressedCameraEvent("idle");
      return;
    }

    const camera = this._readCurrentCameraSnapshot("idle");
    if (!camera) {
      this._recoverInvalidCamera("idle");
      return;
    }

    this._rememberValidCamera(camera);
    this._commitSettledCameraZoom(camera.zoom, "idle");
    this._executeBoundsChange();
    this.centerChanged();
    this._recordMapProfile("idle");
  }

  private _recordRecoverySuppressedCameraEvent(source: string): void {
    this._mapProfiler.recordThrottled(
      "google-map-2d:camera-event-ignored-during-recovery",
      {
        observed: this._readUnsafeCameraSnapshot(source),
        recoveryCount: this._invalidCameraRecoveryCount,
        source,
      },
      250,
    );
  }

  private _readCurrentCameraSnapshot(source: string): MapCameraSnapshot | null {
    if (!this.googleMap) return null;

    const timestampMs = performance.now();
    const center = toUsableMapCenterLiteral(this.googleMap.getCenter());
    const bounds = this.googleMap.getBounds();
    const boundsLiteral = bounds?.toJSON() ?? null;
    const zoom = this.googleMap.getZoom();

    if (
      !center ||
      typeof zoom !== "number" ||
      !Number.isFinite(zoom) ||
      (boundsLiteral && !isFiniteLatLngBounds(bounds)) ||
      this._isSuspiciousCameraJump({ source, timestampMs, zoom })
    ) {
      return null;
    }

    return {
      bounds: boundsLiteral,
      center,
      source,
      timestampMs,
      zoom,
    };
  }

  private _isSuspiciousCameraJump(camera: {
    source: string;
    timestampMs: number;
    zoom: number;
  }): boolean {
    // A settled idle camera with finite center/bounds is a valid Maps result.
    // Event maps and fit-to-bounds previews can legitimately jump several
    // zoom levels from the initial fallback camera on their first idle event.
    if (camera.source === "idle" || camera.source === "recovery-verification") {
      return false;
    }

    const previous = this._lastValidCamera;
    if (!previous || this._isRecoveringInvalidCamera) return false;

    const elapsedMs = camera.timestampMs - previous.timestampMs;
    const zoomDelta = Math.abs(camera.zoom - previous.zoom);
    const allowedProgrammaticJump =
      this._programmaticCameraJumpAllowance &&
      camera.timestampMs <= this._programmaticCameraJumpAllowance.untilMs;
    if (
      allowedProgrammaticJump &&
      elapsedMs >= 0 &&
      elapsedMs <= GoogleMap2dComponent.CAMERA_JUMP_WINDOW_MS * 3 &&
      zoomDelta > GoogleMap2dComponent.MAX_CAMERA_ZOOM_JUMP
    ) {
      this._mapProfiler.recordThrottled(
        "google-map-2d:programmatic-camera-jump-allowed",
        {
          allowance: this._programmaticCameraJumpAllowance,
          current: camera,
          elapsedMs: Math.round(elapsedMs),
          previous,
          zoomDelta: Math.round(zoomDelta * 100) / 100,
        },
        500,
      );
      return false;
    }

    const isSuspicious =
      elapsedMs >= 0 &&
      elapsedMs <= GoogleMap2dComponent.CAMERA_JUMP_WINDOW_MS &&
      zoomDelta > GoogleMap2dComponent.MAX_CAMERA_ZOOM_JUMP;

    if (isSuspicious) {
      this._mapProfiler.record("google-map-2d:suspicious-camera-jump", {
        current: camera,
        elapsedMs: Math.round(elapsedMs),
        previous,
        zoomDelta: Math.round(zoomDelta * 100) / 100,
      });
    }

    return isSuspicious;
  }

  private _allowProgrammaticCameraJump(source: string): void {
    this._programmaticCameraJumpAllowance = {
      source,
      untilMs:
        performance.now() + GoogleMap2dComponent.CAMERA_JUMP_WINDOW_MS * 3,
    };
  }

  private _rememberValidCamera(camera: MapCameraSnapshot): void {
    this._lastValidCamera = {
      bounds: camera.bounds ? { ...camera.bounds } : null,
      center: { ...camera.center },
      source: camera.source,
      timestampMs: camera.timestampMs,
      zoom: camera.zoom,
    };
  }

  private _recoverInvalidCamera(source: string): void {
    if (!this.googleMap?.googleMap || this._isRecoveringInvalidCamera) return;

    const observed = this._readUnsafeCameraSnapshot(source);
    const fallback = this._getCameraRecoveryFallback("component-input");

    this._invalidCameraRecoveryCount++;
    reportInvalidMapCoordinate(
      `Recovering invalid Google Maps camera from ${source}`,
      {
        fallback,
        observed,
        recoveryCount: this._invalidCameraRecoveryCount,
      },
    );
    this._mapProfiler.record("google-map-2d:invalid-camera", {
      fallback,
      observed,
      recoveryCount: this._invalidCameraRecoveryCount,
      source,
    });

    this._isRecoveringInvalidCamera = true;
    this._clearInvalidCameraRecoveryTimeout();

    this._runWhenMapViewportReady(
      `camera-recovery:${source}`,
      () => {
        try {
          const nativeMap = this.googleMap?.googleMap;
          if (!nativeMap) return;

          const target = {
            center: fallback.center,
            zoom: fallback.zoom,
          };
          const moveCamera = nativeMap.moveCamera?.bind(nativeMap);

          if (moveCamera) {
            moveCamera(target);
          } else {
            nativeMap.setCenter(fallback.center);
            nativeMap.setZoom(fallback.zoom);
          }

          this._center = fallback.center;
          this._zoom.set(Math.floor(fallback.zoom));
          this._lastObservedNativeIntegerZoom = Math.floor(fallback.zoom);
          this._setCommunityVisualZoom(fallback.zoom);
          this._mapProfiler.record("google-map-2d:camera-recovered", {
            recoveryCount: this._invalidCameraRecoveryCount,
            source,
            target,
          });
          this._scheduleCameraRecoveryVerification(fallback, source);
        } catch (error) {
          this._mapProfiler.record("google-map-2d:camera-recovery-failed", {
            error: String(error),
            fallback,
            observed,
            source,
          });
          console.warn("Failed to recover Google Maps camera:", error);
          this._forceRecreateNativeMap("camera-recovery-failed", fallback);
        } finally {
          this._invalidCameraRecoveryTimeoutId = setTimeout(() => {
            this._isRecoveringInvalidCamera = false;
            this._invalidCameraRecoveryTimeoutId = null;
          }, 1_000);
        }
      },
      { isRecovery: true },
    );
  }

  private _readUnsafeCameraSnapshot(source: string): Record<string, unknown> {
    return {
      bounds: this.googleMap?.getBounds()?.toJSON() ?? null,
      center: this.googleMap?.getCenter()?.toJSON() ?? null,
      source,
      zoom: this.googleMap?.getZoom() ?? null,
    };
  }

  private _getCameraRecoveryFallback(source: string): MapCameraSnapshot {
    if (this._lastValidCamera) {
      return this._lastValidCamera;
    }

    return {
      bounds: null,
      center: this.center,
      source,
      timestampMs: performance.now(),
      zoom: this.zoom,
    };
  }

  private _clearInvalidCameraRecoveryTimeout(): void {
    if (this._invalidCameraRecoveryTimeoutId === null) return;

    clearTimeout(this._invalidCameraRecoveryTimeoutId);
    this._invalidCameraRecoveryTimeoutId = null;
  }

  private _scheduleCameraRecoveryVerification(
    fallback: MapCameraSnapshot,
    source: string,
  ): void {
    this._clearCameraRecoveryVerificationTimeout();
    this._cameraRecoveryVerificationTimeoutId = setTimeout(() => {
      this._cameraRecoveryVerificationTimeoutId = null;
      const camera = this._readCurrentCameraSnapshot("recovery-verification");
      const zoomDelta = camera ? Math.abs(camera.zoom - fallback.zoom) : Infinity;
      if (camera && zoomDelta <= 1.5) {
        this._mapProfiler.record("google-map-2d:camera-recovery-verified", {
          camera,
          source,
          zoomDelta: Math.round(zoomDelta * 100) / 100,
        });
        this._isRecoveringInvalidCamera = false;
        this._clearInvalidCameraRecoveryTimeout();
        return;
      }

      this._mapProfiler.record("google-map-2d:camera-recovery-unverified", {
        camera,
        fallback,
        source,
        zoomDelta: Number.isFinite(zoomDelta)
          ? Math.round(zoomDelta * 100) / 100
          : String(zoomDelta),
      });
      this._isRecoveringInvalidCamera = false;
      this._clearInvalidCameraRecoveryTimeout();
      this._forceRecreateNativeMap("camera-recovery-unverified", fallback);
    }, 500);
  }

  private _clearCameraRecoveryVerificationTimeout(): void {
    if (this._cameraRecoveryVerificationTimeoutId === null) return;

    clearTimeout(this._cameraRecoveryVerificationTimeoutId);
    this._cameraRecoveryVerificationTimeoutId = null;
  }

  private _forceRecreateNativeMap(
    reason: string,
    fallback: MapCameraSnapshot,
  ): void {
    this._clearMapCanvasContextListeners();
    this._clearWebGlContextRecoveryTimeout();
    this._mapProfiler.record("google-map-2d:recreate-native-map", {
      fallback,
      reason,
    });
    this._center = fallback.center;
    this._zoom.set(Math.floor(fallback.zoom));
    this._lastObservedNativeIntegerZoom = Math.floor(fallback.zoom);
    this._setCommunityVisualZoom(fallback.zoom);
    this._hasInitializedNativeMap = false;
    this.googleMap = undefined;
    this.optionsInitialized.set(false);
    this.cdr.detectChanges();

    setTimeout(() => {
      this.mapOptions = {
        ...this.mapOptions,
        center: fallback.center,
        zoom: fallback.zoom,
      };
      void this._updateMapConfig();
      this.cdr.markForCheck();
    }, 0);
  }

  private _executeBoundsChange() {
    if (!this.googleMap) return;
    const bounds = this.googleMap.getBounds()!;
    const boundsDebug = bounds?.toJSON();
    if (!isFiniteLatLngBounds(bounds)) {
      reportInvalidMapCoordinate("Ignoring invalid map bounds", boundsDebug);
      return;
    }

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
    const centerLiteral = toUsableMapCenterLiteral(center);
    if (!centerLiteral) {
      reportInvalidMapCoordinate(
        "Ignoring invalid map centerChanged value",
        center?.toJSON(),
      );
      return;
    }

    this._debugMapEvent("centerChanged", {
      center: centerLiteral,
      zoom: this.googleMap.getZoom(),
    });
    this.centerChange.emit(centerLiteral);
  }

  fitBounds(bounds: google.maps.LatLngBounds) {
    if (!this.googleMap) return;
    const boundsDebug = bounds?.toJSON();
    if (!isFiniteLatLngBounds(bounds)) {
      reportInvalidMapCoordinate("Ignoring invalid fitBounds request", boundsDebug);
      return;
    }

    this._debugMapEvent("fitBounds", {
      center: bounds.getCenter().toJSON(),
      bounds: bounds.toJSON(),
    });
    this._allowProgrammaticCameraJump("fit-bounds");
    this._runWhenMapViewportReady("fit-bounds", () => {
      this.googleMap?.fitBounds(bounds);
    });
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
        "⚠️ Could not get live polygon paths, falling back to existing paths",
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
    polygon: google.maps.Polygon,
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
    zoom: number = this.focusZoom(),
  ) {
    if (!this.googleMap) return;

    const target = toUsableMapCenterLiteral(location);
    if (!target) {
      reportInvalidMapCoordinate(
        "No or invalid location provided to focus on",
        location,
      );
      return;
    }

    this._debugMapEvent("focusOnLocation", {
      location: target,
      zoom,
      currentZoom: this.zoom,
    });

    this.setCamera({ center: target, zoom }, "focus-on-location");
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
        '[title*="Google Maps"]',
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
    retryDelay: number = 100,
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

    if (center) {
      return {
        id: `${spot.id}-location-radius`,
        spot,
        center,
        radiusM: DEFAULT_SPOT_AREA_RADIUS_M,
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

  private _debugMapEvent(
    event: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.isDebug()) return;

    console.debug("[MapDebug][GoogleMap2d]", event, {
      ...payload,
      selectedSpot: this._debugSelectedSpotKey(),
      timestamp: Math.round(performance.now()),
    });
  }

  private _recordMapProfile(
    event: string,
    payload: Record<string, unknown> = {},
  ): void {
    if (!this._mapProfiler.isEnabled()) return;

    const nativeMap = this.googleMap?.googleMap;
    const now = performance.now();
    const shouldRecordFullSnapshot = this._shouldRecordFullMapProfileSnapshot(
      event,
      now,
    );
    const basePayload = {
      ...payload,
      actualRenderingType: nativeMap?.getRenderingType?.() ?? null,
      capabilities: nativeMap?.getMapCapabilities?.() ?? null,
      inputs: {
        circleOverlays: this.circleOverlays.length,
        highlightedSpots: this.highlightedSpots.length,
        pointMarkers: this.pointMarkers.length,
        priorityMarkers: this.priorityMarkers().length,
        regularSpots: this.spots.length,
      },
      mapIdPresent: !!environment.mapId,
      mapTypeId: this.mapTypeId(),
      overlays: {
        bounds: this.boundsOverlays.length,
        polygons: this.polygonOverlays.length,
      },
      requestedRenderingType: this.mapOptions.renderingType ?? null,
      zoom: {
        component: this.zoom,
        native: this.googleMap?.getZoom() ?? null,
      },
    };

    if (!shouldRecordFullSnapshot) {
      this._mapProfiler.record(`google-map-2d:${event}`, {
        ...basePayload,
        profileDetail: "light",
      });
      return;
    }

    const layout = this._getMarkerCollisionLayout();
    const visiblePointMarkers = this.getVisiblePointMarkers();
    const center = this.googleMap?.getCenter()?.toJSON() ?? null;
    const bounds = this.googleMap?.getBounds()?.toJSON() ?? null;

    this._mapProfiler.record(`google-map-2d:${event}`, {
      ...basePayload,
      bounds,
      center,
      collision: {
        hiddenCommunities: layout.hiddenCommunityIds.size,
        hiddenEvents: layout.hiddenEventIds.size,
        hiddenPoints: layout.hiddenPointIds.size,
        hiddenSpots: layout.hiddenSpotIds.size,
      },
      profileDetail: "full",
      visible: {
        pointMarkers: visiblePointMarkers.length,
        regularSpotMarkers: this.getVisibleSpotMarkers().length,
        highlightedSpots: this.getVisibleHighlightedSpots().length,
      },
    });
  }

  private _shouldRecordFullMapProfileSnapshot(
    event: string,
    timestampMs: number,
  ): boolean {
    if (
      event === "ready" ||
      event === "config-updated" ||
      event === "capabilities-changed"
    ) {
      this._lastFullMapProfileTimestamp = timestampMs;
      return true;
    }

    if (
      timestampMs - this._lastFullMapProfileTimestamp >=
      MAP_PROFILE_FULL_SNAPSHOT_INTERVAL_MS
    ) {
      this._lastFullMapProfileTimestamp = timestampMs;
      return true;
    }

    return false;
  }

  private _debugSelectedSpotKey(): string | null {
    const spot = this.selectedSpot();
    if (!spot) return null;
    if ("id" in spot && spot.id) return spot.id as string;

    const location = spot.location();
    return `local-${location.lat}_${location.lng}`;
  }
}
