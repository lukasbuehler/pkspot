import {
  AfterViewInit,
  Component,
  computed,
  effect,
  EventEmitter,
  inject,
  Inject,
  input,
  Input,
  InputSignal,
  LOCALE_ID,
  model,
  ModelSignal,
  OnChanges,
  Output,
  PLATFORM_ID,
  Signal,
  ViewChild,
  ChangeDetectorRef,
  OnDestroy,
  signal,
  Injector,
  ChangeDetectionStrategy,
  untracked,
} from "@angular/core";
import {
  LocalSpot,
  Spot,
  convertLocalSpotToSpot,
} from "../../../db/models/Spot";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { ActivatedRoute, Router } from "@angular/router";
import { GeoPoint } from "firebase/firestore";
import { firstValueFrom, Observable, retry, Subscription } from "rxjs";
import { MapHelpers } from "../../../scripts/MapHelpers";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  GoogleMap2dComponent,
  TilesObject,
} from "../google-map-2d/google-map-2d.component";
import { CommunityMapMarker } from "../map/community-dot-marker/community-dot-marker.component";
import { shouldShowCommunityDot } from "../map/community-dot-marker/community-map-rendering";
import { VisibleViewport } from "../maps/map-base";
import {
  MapBoundsOverlay,
  MapCircleOverlay,
  MapFeatureBoundaryOverlay,
  MapPolygonOverlay,
  MapPointMarker,
} from "../maps/map-overlays";
import {
  MapTileKey,
  getClusterTileKey,
  getDataFromClusterTileKey,
} from "../../../db/schemas/SpotClusterTile";
import { MapsApiService } from "../../services/maps-api.service";
import { MapPerformanceProfilerService } from "../../services/map-performance-profiler.service";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { isPlatformServer } from "@angular/common";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SlugsService } from "../../services/firebase/firestore/slugs.service";
import { LocaleCode } from "../../../db/models/Interfaces";
import { MarkerSchema } from "../map/markers/map-marker.model";
import { OsmDataService } from "../../services/osm-data.service";
import { SpotMapDataManager, SpotFilterMode } from "./SpotMapDataManager";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import {
  LocalSpotChallenge,
  SpotChallenge,
  SpotChallengePreview,
} from "../../../db/models/SpotChallenge";
import { AnyMedia } from "../../../db/models/Media";

import { GeolocationService } from "../../services/geolocation.service";
import { CheckInService } from "../../services/check-in.service";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { environment } from "../../../environments/environment.default";
import { StartRegionService } from "../../services/start-region.service";
import {
  resolveInitialMapViewport,
  StoredMapViewport,
} from "./spot-map-initial-viewport";
import {
  isFiniteBoundsLiteral,
  isFiniteLatLngBounds,
  isFiniteLatLngLiteral,
  reportInvalidMapCoordinate,
  toFiniteLatLngLiteral,
} from "../../shared/map-coordinate-utils";
import { SpotAccess, SpotTypes } from "../../../db/schemas/SpotTypeAndAccess";
import { AnalyticsService } from "../../services/analytics.service";

interface CommunityAreaOverlay {
  center: { lat: number; lng: number };
  radiusM: number;
  googleBoundary?: {
    featureType: "COUNTRY";
    placeId?: string;
    query?: string;
    region?: string;
  };
}

@Component({
  selector: "app-spot-map",
  templateUrl: "./spot-map.component.html",
  styleUrls: ["./spot-map.component.scss"],
  imports: [GoogleMap2dComponent, MatSnackBarModule],
  animations: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild("map") map: GoogleMap2dComponent | undefined;

  osmDataService = inject(OsmDataService);

  geolocationService = inject(GeolocationService);
  geolocationLoading = this.geolocationService.loading;

  mapsApiService = inject(MapsApiService);
  startRegionService = inject(StartRegionService);

  private _router = inject(Router);
  private _mapProfiler = inject(MapPerformanceProfilerService);

  private _isDestroyed = false;
  private readonly duplicateSpotCreateRadiusMeters = 5;
  private _spotOpenRequestVersion = 0;
  private _lastFocusedSpotKey: string | null = null;
  private _lastStoredMapViewport: StoredMapViewport | null = null;

  selectedSpot = model<Spot | LocalSpot | null>(null); // input and output signal
  selectedSpotChallenges = model<SpotChallengePreview[]>([]);
  selectedChallenge = model<SpotChallenge | LocalSpotChallenge | null>(null);

  isEditing = model<boolean>(false);
  mapStyle = model<"roadmap" | "satellite" | "hybrid" | "terrain" | null>(null);
  markers = input<MarkerSchema[]>([]);
  priorityMarkers = input<MarkerSchema[]>([]);
  polygons = input<PolygonSchema[]>([]);
  selectedMarker = input<google.maps.LatLngLiteral | null>(null);
  focusZoom = input<number>(17);
  isClickable = input<boolean>(true);
  showAmenities = input<boolean>(false);
  centerStart = input<google.maps.LatLngLiteral | null>(null);
  showSpotPreview = input<boolean>(false);
  bottomSheetOffset = input<boolean>(false);
  isDebug = input<boolean>(false);
  showSpots = input(true);
  showVisibleSpotPins = input(false);

  @Input() showGeolocation: boolean = true;
  @Input() showSatelliteToggle: boolean = false;
  @Input() minZoom: number | null = null; // If null, no enforced min zoom; cluster logic will handle low zooms
  @Input() boundRestriction: {
    north: number;
    south: number;
    west: number;
    east: number;
  } | null = null;
  @Input() spots: (Spot | LocalSpot)[] = [];

  /**
   * Geographic extent of the currently-active community, drawn as a low-
   * opacity circle on the map. Pass-through to google-map-2d. Driven by
   * the community page's `bounds_center` + `bounds_radius_m`.
   */
  private readonly _communityArea = signal<CommunityAreaOverlay | null>(null);

  @Input()
  set communityArea(value: CommunityAreaOverlay | null | undefined) {
    this._communityArea.set(value ?? null);
  }

  get communityArea(): CommunityAreaOverlay | null {
    return this._communityArea();
  }

  /**
   * Clickable community chip markers shown across the map (every
   * published community with bounds info). Replaces the prior map-island
   * community variant — communities live on the map itself now.
   */
  private readonly _availableCommunities = signal<CommunityMapMarker[]>([]);
  private readonly _focusedSpotPreviews = signal<SpotPreviewData[] | null>(
    null,
  );

  @Input()
  set availableCommunities(value: CommunityMapMarker[] | null | undefined) {
    this._availableCommunities.set(value ? [...value] : []);
  }

  get availableCommunities(): CommunityMapMarker[] {
    return this._availableCommunities();
  }

  @Input()
  set focusedSpotPreviews(value: SpotPreviewData[] | null | undefined) {
    this._focusedSpotPreviews.set(
      value === null || value === undefined ? null : [...value],
    );
  }

  get focusedSpotPreviews(): SpotPreviewData[] | null {
    return this._focusedSpotPreviews();
  }

  /** Emits the community key when the user clicks one of the chips. */
  @Output() communityMarkerClick = new EventEmitter<string>();

  private readonly _eventPointMarkers = signal<MapPointMarker[]>([]);
  private readonly _boundsOverlays = signal<MapBoundsOverlay[]>([]);
  private readonly _polygonOverlays = signal<MapPolygonOverlay[]>([]);

  @Input()
  set eventPointMarkers(value: MapPointMarker[] | null | undefined) {
    this._eventPointMarkers.set(value ? [...value] : []);
  }

  get eventPointMarkers(): MapPointMarker[] {
    return this._eventPointMarkers();
  }

  @Input()
  set boundsOverlays(value: MapBoundsOverlay[] | null | undefined) {
    this._boundsOverlays.set(value ? [...value] : []);
  }

  get boundsOverlays(): MapBoundsOverlay[] {
    return this._boundsOverlays();
  }

  @Input()
  set polygonOverlays(value: MapPolygonOverlay[] | null | undefined) {
    this._polygonOverlays.set(value ? [...value] : []);
  }

  get polygonOverlays(): MapPolygonOverlay[] {
    return this._polygonOverlays();
  }
  @Output() eventMarkerClick = new EventEmitter<string>();

  @Output() hasGeolocationChange = new EventEmitter<boolean>();
  @Output() visibleSpotsChange = new EventEmitter<Spot[]>();
  @Output() hightlightedSpotsChange = new EventEmitter<SpotPreviewData[]>();
  @Output() spotOpenRequested = new EventEmitter<
    LocalSpot | Spot | SpotPreviewData | SpotId
  >();
  @Output() markerClickEvent = new EventEmitter<
    number | { marker: any; index?: number }
  >();

  @Output() poiClick = new EventEmitter<{
    location: google.maps.LatLngLiteral;
    placeId: string;
  }>();

  @Output() mapClickEvent = new EventEmitter<google.maps.LatLngLiteral>();
  /**
   * Emits when map bounds change while a filter is active.
   * Parent component should re-run the filter search for the new bounds.
   */
  @Output() filterBoundsChange = new EventEmitter<google.maps.LatLngBounds>();
  /**
   * Emits whenever the visible viewport changes, regardless of filter state.
   * Used by map-page to drive the map-island content (events near here,
   * matching community, etc.).
   */
  @Output() viewportBoundsChange = new EventEmitter<google.maps.LatLngBounds>();
  @Output() visibleViewportChange = new EventEmitter<VisibleViewport>();

  uneditedSpot?: Spot | LocalSpot;

  startZoom: number = 4;
  mapZoom = signal<number>(this.startZoom);
  bounds?: google.maps.LatLngBounds;

  // Check-In Service integration
  private _checkInService = inject(CheckInService);
  private _ageAssuranceService = inject(AgeAssuranceService);
  readonly checkInEnabled = environment.features.checkIns;

  // Expose check-in spot to template
  checkInSpot = this._checkInService.currentProximitySpot;

  // markers for water and toilets
  loadedInputMarkers: Signal<Map<MapTileKey, MarkerSchema[]>> = computed(() => {
    const map = new Map<MapTileKey, MarkerSchema[]>();

    if (this.markers().length > 0) {
      this.markers().forEach((marker) => {
        const tile = MapHelpers.getTileCoordinatesForLocationAndZoom(
          marker.location,
          16,
        );
        const key = getClusterTileKey(16, tile.x, tile.y);
        if (map.has(key)) {
          map.get(key)?.push(marker);
        } else {
          map.set(key, [marker]);
        }
      });
    }

    return map;
  });

  private _spotMapDataManager = new SpotMapDataManager(
    this.locale,
    inject(Injector),
  );

  /**
   * Filter mode for showing special filter pins on the map.
   * Parent components can set this to filter the highlighted spots.
   */
  spotFilterMode = model<SpotFilterMode>(SpotFilterMode.None);

  /**
   * @deprecated Use spotFilterMode signal and setFilteredSpots() instead
   */
  public get spotMapData() {
    return this._spotMapDataManager;
  }

  hightlightedSpots: SpotPreviewData[] = [];
  visibleSpots = this._spotMapDataManager.visibleSpots;
  visibleHighlightedSpots = this._spotMapDataManager.visibleHighlightedSpots;
  visibleAmenityMarkers = this._spotMapDataManager.visibleAmenityMarkers;
  hideRegularSpotPins = computed(
    () =>
      !this.showSpots() ||
      this.spotFilterMode() !== SpotFilterMode.None ||
      this._focusedSpotPreviews() !== null,
  );
  readonly renderedVisibleSpots = computed(() =>
    this.showSpots() && this._focusedSpotPreviews() === null
      ? this.visibleSpots()
      : [],
  );
  readonly renderedHighlightedSpots = computed(() => {
    if (!this.showSpots()) return [];

    const focusedPreviews = this._focusedSpotPreviews();
    if (focusedPreviews !== null) {
      return focusedPreviews;
    }

    return this.visibleHighlightedSpots();
  });

  visibleMarkers = signal<MarkerSchema[]>([]);
  readonly pointMarkers = computed<MapPointMarker[]>(() => [
    ...this.communityPointMarkers(),
    ...this._eventPointMarkers(),
  ]);

  readonly circleOverlays = computed<MapCircleOverlay[]>(() => [
    ...this.activeAreaCircleOverlays(),
    ...this.communityCircleOverlays(),
  ]);

  readonly featureBoundaryOverlay = computed<MapFeatureBoundaryOverlay | null>(
    () => {
      const boundary = this._communityArea()?.googleBoundary;
      if (!boundary) return null;

      return {
        id: "active-area-boundary",
        ...boundary,
      };
    },
  );

  readonly activeAreaCircleOverlays = computed<MapCircleOverlay[]>(() => {
    const communityArea = this._communityArea();
    if (!communityArea || communityArea.googleBoundary) return [];

    return [
      {
        id: "active-area-circle",
        center: communityArea.center,
        radiusM: communityArea.radiusM,
        options: {
          fillColor: this._getCssColorAsHex(
            "--mat-sys-primary-fixed",
            "#dbe1ff",
          ),
          strokeColor: this._getCssColorAsHex(
            "--mat-sys-on-primary-fixed-variant",
            "#001a67",
          ),
          fillOpacity: 0.04,
          strokeOpacity: 0.8,
          strokeWeight: 2,
          clickable: false,
          draggable: false,
          zIndex: 1,
        },
      },
    ];
  });

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

    return `#${rgbMatch
      .slice(1, 4)
      .map((part) =>
        Math.max(0, Math.min(255, Number(part)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  }

  private _shouldShowCommunityCenterDot(
    community: CommunityMapMarker,
  ): boolean {
    return shouldShowCommunityDot(community, this.mapZoom());
  }

  readonly communityDotMarkers = computed<CommunityMapMarker[]>(() =>
    this.availableCommunities.filter(
      (community) =>
        !community.pinVisible && this._shouldShowCommunityCenterDot(community),
    ),
  );

  readonly communityPointMarkers = computed<MapPointMarker[]>(() =>
    this.availableCommunities
      .filter((community) => community.pinVisible)
      .map((community) => ({
        id: `community:${community.communityKey}`,
        name: community.displayName,
        location: community.center,
        color: "primary",
        type: "community",
        number: community.pinLabel,
        numberVariant: community.pinLabel ? "flag" : "default",
        icons: community.pinLabel
          ? undefined
          : [community.pinIcon ?? "location_city"],
        forceFullMarker: true,
        priority: community.scope === "country" ? "required" : 340,
        size:
          community.pinSize ??
          (community.scope === "country" ? 0.94 : 0.86),
      })),
  );

  readonly communityCircleOverlays = computed<MapCircleOverlay[]>(() =>
    this.availableCommunities
      .filter(
        (community) =>
          !community.pinVisible &&
          community.scope === "locality" &&
          !this._shouldShowCommunityCenterDot(community),
      )
      .map((community) => ({
        id: `community:${community.communityKey}`,
        center: community.center,
        radiusM: community.radiusM,
        options: {
          clickable: true,
          zIndex: 1,
        },
      })),
  );

  headingIsNotNorth: Signal<boolean> = computed(() => {
    if (!this.map) return false;
    return this.map.headingIsNotNorth();
  });

  // previous tile coordinates used to check if the visible tiles have changed
  private _previousTileZoom: 4 | 8 | 12 | 16 | undefined;
  private _previousSouthWestTile: google.maps.Point | undefined;
  private _previousNorthEastTile: google.maps.Point | undefined;
  private _visibleTiles: Set<MapTileKey> = new Set<MapTileKey>();
  private _visibleTilesObj: TilesObject | undefined;

  // Debounce timer for filter bounds change to prevent rapid search requests
  private _filterBoundsDebounceTimer: any = null;

  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    private _spotsService: SpotsService,
    private _slugsService: SlugsService,
    private authService: AuthenticationService,
    private mapsAPIService: MapsApiService,
    private snackBar: MatSnackBar,
    private cd: ChangeDetectorRef,
    private analyticsService: AnalyticsService,
  ) {
    // Track the previous spot to detect actual changes
    let previousSpotKey: string | null = null;

    effect(() => {
      const spot = this.selectedSpot();
      if (spot) {
        const currentSpotKey = untracked(() => this._getSpotFocusKey(spot));

        untracked(() => {
          if (spot instanceof Spot) {
            this._spotMapDataManager.addLoadedSpot(spot);
          }

          if (this._lastFocusedSpotKey !== currentSpotKey) {
            this.focusSpot(spot);
            this._lastFocusedSpotKey = currentSpotKey;
          }

          // AGGRESSIVE POLYGON RESET: If spot changed and we're editing, restart the editing mode
          if (
            previousSpotKey &&
            previousSpotKey !== currentSpotKey &&
            this.map
          ) {
            if (this.isEditing()) {
              // Stop editing completely to destroy the polygon
              this.isEditing.set(false);
              this.cd.detectChanges();

              // Wait a moment, then restart editing
              setTimeout(() => {
                this.isEditing.set(true);
                this.cd.detectChanges();
              }, 150);
            }
          }

          previousSpotKey = currentSpotKey;
        });
      } else {
        previousSpotKey = null;
        this._lastFocusedSpotKey = null;
      }
    });

    effect(() => {
      const showAmenities = this.showAmenities();
      const inputMarkers = this.markers();
      const amenityMarkers = this.visibleAmenityMarkers();

      if (showAmenities) {
        if (!amenityMarkers || amenityMarkers.length === 0) {
          this.visibleMarkers.set(inputMarkers);
          this._recordVisibleMarkerProfile(
            inputMarkers.length,
            0,
            showAmenities,
          );
          return;
        }
        this.visibleMarkers.set(amenityMarkers.concat(inputMarkers));
        this._recordVisibleMarkerProfile(
          inputMarkers.length,
          amenityMarkers.length,
          showAmenities,
        );
      } else {
        this.visibleMarkers.set(inputMarkers);
        this._recordVisibleMarkerProfile(inputMarkers.length, 0, showAmenities);
      }
    });

    effect(() => {
      const spots = this.visibleSpots();
      this.visibleSpotsChange.emit(this.hideRegularSpotPins() ? [] : spots);
    });

    effect(() => {
      const visibleHighlightedSpots = this.visibleHighlightedSpots();
      this.hightlightedSpotsChange.emit(visibleHighlightedSpots);
    });

    // Update check-in service with selected spot
    effect(() => {
      if (!this.checkInEnabled) return;
      this._checkInService.selectedSpot.set(this.selectedSpot() as Spot | null);
    });

    // Note: Auto-focus for check-in spots was removed.
    // User explicitly clicks on the spot info in the bottom sheet to select and focus on it.
    // This prevents interruption when the user is viewing another location.

    // Sync the spotFilterMode signal with the data manager
    effect(() => {
      const filterMode = this.spotFilterMode();
      this._spotMapDataManager.spotFilterMode.set(filterMode);
      // When filter is cleared, also clear manual highlights
      if (filterMode === SpotFilterMode.None) {
        this._spotMapDataManager.clearManualHighlightedSpots();
        // Schedule refresh in next tick to ensure signal has fully propagated
        setTimeout(() => this._spotMapDataManager.refresh(), 0);
      }
    });

    // Initialize map when API is loaded
    effect(() => {
      const isLoaded = this.mapsAPIService.isApiLoaded();
      console.log("SpotMap: API loaded signal changed:", isLoaded);
      if (isLoaded) {
        // Wait for change detection to update ViewChild
        setTimeout(() => {
          console.log("SpotMap: triggering _initializeMap from effect");
          this._initializeMap();
        }, 100);
      }
    });
  }

  isInitiated: boolean = false;

  ngAfterViewInit(): void {
    console.log("SpotMap: ngAfterViewInit");
    if (this.mapsAPIService.isApiLoaded()) {
      console.log("SpotMap: API already loaded, initializing...");
      this._initializeMap();
    } else {
      console.log("SpotMap: API not loaded yet, waiting for signal...");
    }
  }

  private async _initializeMap() {
    if (this.isInitiated) {
      console.log("SpotMap: Already initiated, skipping.");
      return;
    }

    if (!this.map) {
      console.warn("SpotMap: Map ViewChild NOT found in _initializeMap!");
      // If API is loaded but map is still not found, it might be due to race condition or structural directive
      return;
    }

    console.log("SpotMap: Map ViewChild found!", this.map);

    // load the map style from memory
    if (this.mapStyle() === null) {
      this.mapsAPIService
        .loadMapStyle("roadmap")
        .then((style: "satellite" | "roadmap" | "hybrid" | "terrain") => {
          if (this._isDestroyed) return;
          if (style) {
            this.mapStyle.set(style);
          }
        });
    }

    // Initialize map center and zoom based on priority:
    // 1. Selected spot (if available)
    // 2. Center start (if provided)
    // 3. Bound restriction center
    // 4. Last saved location
    // 5. Default fallback coordinates

    const selectedSpot = this.selectedSpot();
    const centerStart = this.centerStart();

    console.log(
      "SpotMap: initializing center. SelectedSpot:",
      selectedSpot,
      "CenterStart:",
      centerStart,
    );

    let lastLocationAndZoom: StoredMapViewport | null = null;

    if (!selectedSpot && !centerStart && !this.boundRestriction) {
      try {
        lastLocationAndZoom =
          await this.mapsAPIService.loadLastLocationAndZoom();
      } catch (error) {
        console.warn(
          "Failed to load last location from storage, using regional fallback:",
          error,
        );
      }
    }

    if (this._isDestroyed) return;

    const boundsCenter = isFiniteBoundsLiteral(this.boundRestriction)
      ? toFiniteLatLngLiteral(
          new google.maps.LatLngBounds(this.boundRestriction).getCenter(),
        )
      : null;
    const viewport = resolveInitialMapViewport({
      selectedSpotLocation: selectedSpot?.location() ?? null,
      centerStart,
      boundsCenter,
      lastLocationAndZoom,
      fallbackPreset: this.startRegionService.resolveInitialPreset(
        this.startZoom,
      ),
      focusZoom: this.focusZoom(),
    });

    this.mapZoom.set(viewport.zoom);
    this._debugMapEvent("initializeViewport", {
      source: viewport.source,
      center: viewport.center,
      zoom: viewport.zoom,
    });
    this._mapProfiler.record("spot-map:initialize-viewport", {
      center: viewport.center,
      source: viewport.source,
      zoom: viewport.zoom,
    });
    this.map.setCamera(
      { center: viewport.center, zoom: viewport.zoom },
      `initialize-viewport:${viewport.source}`,
    );
    this._lastStoredMapViewport = {
      location: viewport.center,
      zoom: viewport.zoom,
    };

    // TODO this is not sufficient if the input changes
    this.visibleMarkers.set(this.markers()); // ?????

    this.isInitiated = true;
  }

  ngOnDestroy(): void {
    this._isDestroyed = true;
  }

  // Map events ///////////////////////////////////////////////////////////////

  zoomChanged(zoom: number) {
    this._debugMapEvent("zoomChanged", {
      zoom,
      previousZoom: this.mapZoom(),
    });
    this.mapZoom.set(zoom);
  }

  mapClick(event: google.maps.LatLngLiteral) {
    // console.debug("Map clicked!", event);

    // Emit the click event for parent components to handle (e.g. deselection)
    this.mapClickEvent.emit(event);

    /**
     * When the map is clicked with a spot open, the spot is
     * closed and the bottom panel cloes as well.
     */
    if (this.selectedSpot()) {
      console.log("Closing spot from map click");
      this.closeSpot();
    }
  }

  // Normalize passthrough for map marker click events
  onMarkerClickFromMap(evt: number | { marker: any; index?: number }) {
    // Simply forward; the Output already supports both shapes
    this.markerClickEvent.emit(evt);
  }

  onPointMarkerClick(marker: MapPointMarker): void {
    if (marker.type === "community") {
      this.communityMarkerClick.emit(marker.id.replace(/^community:/u, ""));
      return;
    }

    if (marker.type === "event") {
      this.eventMarkerClick.emit(marker.id.replace(/^event:/u, ""));
      return;
    }

    this.markerClickEvent.emit({ marker });
  }

  onCircleOverlayClick(circle: MapCircleOverlay): void {
    if (circle.id.startsWith("community:")) {
      this.communityMarkerClick.emit(circle.id.replace(/^community:/u, ""));
    }
  }

  focusOnGeolocation() {
    if (!this.map) return;

    this.map.useGeolocation();
    this.map.focusOnGeolocation();
  }

  resetMapOrientation() {
    if (!this.map) return;

    this.map.resetMapOrientation();
  }

  /**
   * This function is called when the tiles that are visible on the MapComponent
   * are changed. When this is the case, we need to update the visible spots
   * and markers if the zoom is greater or equal to 16 or else update the spot
   * clusters instead.
   * @param visibleTilesObj
   */
  visibleTilesChanged(visibleTilesObj: TilesObject): void {
    this._visibleTilesObj = visibleTilesObj;
    if (!visibleTilesObj) return;

    this._mapProfiler.recordThrottled(
      "spot-map:visible-tiles",
      {
        center: visibleTilesObj.center ?? null,
        tileCount: visibleTilesObj.tiles.length,
        zoom: visibleTilesObj.zoom,
      },
      750,
    );
    this._spotMapDataManager.setVisibleTiles(visibleTilesObj);
  }

  visibleViewportChanged(viewport: VisibleViewport): void {
    if (!viewport) return;
    this._mapProfiler.recordThrottled(
      "spot-map:visible-viewport",
      {
        bbox: viewport.bbox,
        zoom: viewport.zoom,
      },
      750,
    );
    this._spotMapDataManager.setVisibleViewport(viewport);
    this.visibleViewportChange.emit(viewport);
  }

  /**
   * Set the filtered spots to display on the map.
   * Use this method along with the spotFilterMode signal to show filter results.
   */
  setFilteredSpots(spots: SpotPreviewData[]): void {
    this._spotMapDataManager.setManualHighlightedSpots(spots);
  }

  mapBoundsChanged(bounds: google.maps.LatLngBounds, zoom: number) {
    const boundsDebug = bounds?.toJSON();
    if (!isFiniteLatLngBounds(bounds)) {
      reportInvalidMapCoordinate(
        "Ignoring mapBoundsChanged with invalid bounds",
        boundsDebug,
      );
      return;
    }

    // update the local bounds variable
    this.bounds = bounds;
    const center = bounds.getCenter().toJSON();
    if (!isFiniteLatLngLiteral(center)) {
      reportInvalidMapCoordinate(
        "Ignoring mapBoundsChanged with invalid center",
        center,
      );
      return;
    }

    this._debugMapEvent("mapBoundsChanged", {
      center,
      zoom,
      storedCenter: this._lastStoredMapViewport?.location ?? null,
      storedZoom: this._lastStoredMapViewport?.zoom ?? null,
      selectedCommunity: Boolean(this.communityArea),
    });
    this._mapProfiler.recordThrottled(
      "spot-map:bounds-changed",
      {
        bounds: bounds.toJSON(),
        center,
        selectedCommunity: Boolean(this.communityArea),
        zoom,
      },
      750,
    );

    // Always emit viewport change so map-page can drive the map-island.
    this.viewportBoundsChange.emit(bounds);

    if (!this.boundRestriction) {
      // store the new last location in the browser memory to restore it on next visit
      const newCenter: google.maps.LatLngLiteral = center;
      if (this.isInitiated && newCenter !== this.centerStart()) {
        const lastStored = this._lastStoredMapViewport;
        if (
          !lastStored ||
          !this._isSameLatLng(lastStored.location, newCenter) ||
          zoom !== lastStored.zoom
        ) {
          this._lastStoredMapViewport = {
            location: newCenter,
            zoom: zoom,
          };
          this.mapsAPIService.storeLastLocationAndZoom(
            this._lastStoredMapViewport,
          );
          this._debugMapEvent("storeLastViewport", {
            location: this._lastStoredMapViewport.location,
            zoom: this._lastStoredMapViewport.zoom,
          });
        }
      }
    }

    this.mapZoom.set(zoom);

    // If a filter is active, notify parent to re-run the filter search (debounced)
    if (this.spotFilterMode() !== SpotFilterMode.None) {
      // Clear any pending debounce timer
      if (this._filterBoundsDebounceTimer) {
        clearTimeout(this._filterBoundsDebounceTimer);
      }
      // Debounce the filter bounds change to prevent rapid search requests
      this._filterBoundsDebounceTimer = setTimeout(() => {
        this.filterBoundsChange.emit(bounds);
        this._filterBoundsDebounceTimer = null;
      }, 300);
    }
  }

  private _isSameLatLng(
    left: google.maps.LatLngLiteral | undefined,
    right: google.maps.LatLngLiteral,
  ): boolean {
    if (!left) return false;

    const epsilon = 0.000001;
    return (
      Math.abs(left.lat - right.lat) < epsilon &&
      Math.abs(left.lng - right.lng) < epsilon
    );
  }

  private _recordVisibleMarkerProfile(
    inputMarkers: number,
    amenityMarkers: number,
    showAmenities: boolean,
  ): void {
    this._mapProfiler.recordThrottled(
      "spot-map:visible-marker-inputs",
      {
        amenityMarkers,
        inputMarkers,
        showAmenities,
        totalVisibleMarkers: inputMarkers + amenityMarkers,
      },
      750,
    );
  }

  private _getSpotFocusKey(spot: Spot | LocalSpot): string {
    if ("id" in spot) {
      return spot.id as string;
    }

    const location = spot.location();
    return `local-${location.lat}-${location.lng}`;
  }

  // Spot loading /////////////////////////////////////////////////////////////

  // Public Map helper functions

  openSpotByWhateverMeansNecessary(
    spot: LocalSpot | Spot | SpotPreviewData | SpotId,
  ) {
    if (this.spotOpenRequested.observed) {
      this.spotOpenRequested.emit(spot);
      return;
    }

    if (this.selectedSpot() === spot) {
      this.closeSpot();
      if (this.selectedSpot() === spot) {
        // still selected, abort
        return;
      }
    }

    if (spot instanceof Spot) {
      this.selectedSpot.set(spot);
    }
    let spotIdOrSlug: SpotId | string;

    if (typeof spot === "string") {
      spotIdOrSlug = spot;
    } else if ("id" in spot) {
      // For SpotPreviewData, prefer slug if available
      if ("slug" in spot && spot.slug) {
        spotIdOrSlug = spot.slug;
      } else {
        spotIdOrSlug = spot.id as SpotId;
      }

      if ("location" in spot) {
        if (
          spot.location instanceof GeoPoint ||
          typeof spot.location === "object"
        ) {
          try {
            spot.location = spot.location as GeoPoint;

            this.focusPoint({
              lat: spot.location.latitude,
              lng: spot.location.longitude,
            });
          } catch (error) {
            console.error(
              "error focusing spot location (seems not to be GeoPoint even though it should be):",
              error,
            );
          }
        } else if (
          typeof spot.location === "function" ||
          typeof spot.location !== "undefined"
        ) {
          // console.log("function location:", spot.location); // removed debug log
          this.focusPoint(spot.location());
        }
      }
    } else {
      console.error("Invalid spot data provided:", spot);
      return;
    }

    this.openSpotById(spotIdOrSlug);
  }

  openSpotById(spotIdOrSlug: SpotId | string) {
    if (!spotIdOrSlug) {
      console.error("No spot ID or slug provided to open spot");
      return;
    }
    const requestVersion = ++this._spotOpenRequestVersion;

    // Check if it's a slug by looking for typical slug patterns
    // Slugs are typically lowercase with hyphens, IDs are alphanumeric
    const isLikelySlug = /^[a-z0-9-]+$/.test(spotIdOrSlug);

    if (isLikelySlug) {
      // Try to resolve slug to ID first
      this._slugsService
        .getSpotIdFromSpotSlug(spotIdOrSlug)
        .then((spotId) => {
          return firstValueFrom(
            this._spotsService.getSpotById$(spotId, this.locale),
          );
        })
        .then((spot) => {
          if (requestVersion !== this._spotOpenRequestVersion) {
            return;
          }
          if (spot) {
            this.selectedSpot.set(spot);
            if (this.isInitiated) {
              setTimeout(() => {
                this.focusSpot(spot);
              }, 100);
            }
          } else {
            console.error("Spot with slug", spotIdOrSlug, "not found");
          }
        })
        .catch((error) => {
          console.error("Error resolving slug or fetching spot:", error);
          if (requestVersion !== this._spotOpenRequestVersion) {
            return;
          }
          // Fallback: try as ID anyway
          this._fetchSpotById(spotIdOrSlug as SpotId, requestVersion);
        });
    } else {
      // It's an ID, fetch directly
      this._fetchSpotById(spotIdOrSlug as SpotId, requestVersion);
    }
  }

  private _fetchSpotById(spotId: SpotId, requestVersion: number) {
    firstValueFrom(this._spotsService.getSpotById$(spotId, this.locale)).then(
      (spot) => {
        if (requestVersion !== this._spotOpenRequestVersion) {
          return;
        }
        if (spot) {
          this.selectedSpot.set(spot);
          if (this.isInitiated) {
            setTimeout(() => {
              this.focusSpot(spot);
            }, 100);
          }
        } else {
          console.error("Spot with ID", spotId, "not found");
        }
      },
    );
  }

  focusSpot(spot: Spot | LocalSpot) {
    const zoom = Math.max(this.mapZoom(), this.focusZoom());
    const location = spot.location();
    if (!isFiniteLatLngLiteral(location)) {
      reportInvalidMapCoordinate("Ignoring focusSpot with invalid location", {
        spot: this._getSpotFocusKey(spot),
        location,
      });
      return;
    }

    this._debugMapEvent("focusSpot", {
      spot: this._getSpotFocusKey(spot),
      location,
      zoom,
    });
    this.focusPoint(location, zoom);
  }

  focusPoint(
    point: google.maps.LatLngLiteral,
    zoom: number = this.focusZoom(),
  ) {
    if (!isFiniteLatLngLiteral(point)) {
      reportInvalidMapCoordinate(
        "Ignoring focusPoint with invalid coordinates",
        point,
      );
      return;
    }

    const targetZoom = Math.max(this.mapZoom(), zoom);

    this._debugMapEvent("focusPoint", {
      point,
      requestedZoom: zoom,
      targetZoom,
      currentZoom: this.mapZoom(),
    });

    if (this.map) {
      this.map.setCamera({ center: point, zoom: targetZoom }, "focus-point");
    }
  }

  focusBounds(bounds: google.maps.LatLngBounds) {
    const boundsDebug = bounds?.toJSON();
    if (!isFiniteLatLngBounds(bounds)) {
      reportInvalidMapCoordinate(
        "Ignoring focusBounds with invalid bounds",
        boundsDebug,
      );
      return;
    }

    this._debugMapEvent("focusBounds", {
      center: bounds.getCenter().toJSON(),
      bounds: bounds.toJSON(),
    });
    this.map?.fitBounds(bounds);
  }

  toggleMapStyle() {
    let newMapStyle: "roadmap" | "satellite" | "hybrid" | "terrain" = "roadmap";
    const mapStylesToCycleThrough = ["roadmap", "hybrid"];

    const currentMapStyle = this.mapStyle();

    // cycle through the map styles
    const currentIndex = mapStylesToCycleThrough.indexOf(
      currentMapStyle as string,
    );
    const nextIndex = (currentIndex + 1) % mapStylesToCycleThrough.length;
    newMapStyle = mapStylesToCycleThrough[nextIndex] as
      | "roadmap"
      | "hybrid"
      | "satellite"
      | "terrain";

    this.mapStyle.set(newMapStyle);

    // store the new map style in the browser memory
    this.mapsAPIService.storeMapStyle(newMapStyle);
  }

  createSpot() {
    if (!this.authService.isSignedIn) {
      // TODO show sign in dialog
      alert("Please sign in to create a spot"); // TODO
      return;
    }

    if (!this._ageAssuranceService.canParticipatePublicly()) {
      this.snackBar.open(
        this._ageAssuranceService.getRestrictionMessage(),
        $localize`Dismiss`,
        { duration: 6000 },
      );
      return;
    }

    if (!this.map || !this.map.googleMap) return;

    let center_coordinates: google.maps.LatLngLiteral | undefined =
      this.map.googleMap.getCenter()?.toJSON();

    if (!isFiniteLatLngLiteral(center_coordinates)) {
      reportInvalidMapCoordinate(
        "Could not get center coordinates of the map",
        center_coordinates,
      );
      return;
    }

    const nearbySpot = this._spotMapDataManager.findLoadedSpotWithinMeters(
      center_coordinates,
      this.duplicateSpotCreateRadiusMeters,
    );

    if (nearbySpot) {
      this.selectedSpot.set(nearbySpot.spot);
      this.snackBar.open(
        $localize`There is already a spot at this location.`,
        $localize`Dismiss`,
        { duration: 5000 },
      );
      return;
    }

    this.selectedSpot.set(
      new LocalSpot(
        {
          name: { [this.locale]: $localize`Unnamed Spot` }, // TODO change to user lang
          location: new GeoPoint(
            center_coordinates.lat,
            center_coordinates.lng,
          ),
          address: null,
        },
        this.locale as LocaleCode,
      ),
    );

    // sets the map and the spot to edit mode
    this.isEditing.set(true);
  }

  startEdit() {
    if (this.isEditing()) {
      // Temporarily turn off editing to destroy the polygon
      this.isEditing.set(false);

      // Wait a moment, then turn editing back on
      setTimeout(() => {
        this.isEditing.set(true);
        this.uneditedSpot = this.selectedSpot()?.clone();
      }, 100);
    } else {
      this.isEditing.set(true);
      this.uneditedSpot = this.selectedSpot()?.clone();
    }
  }

  async saveSpot(spot: LocalSpot | Spot) {
    if (!this._ageAssuranceService.canParticipatePublicly()) {
      this.snackBar.open(
        this._ageAssuranceService.getRestrictionMessage(),
        $localize`Dismiss`,
        { duration: 6000 },
      );
      return;
    }

    // Get the current polygon paths from the map component using the proper method
    if (this.map && this.isEditing()) {
      // Try the main async method first
      let updatedPaths = await this.map.getSelectedSpotPolygonPaths();

      if (updatedPaths && updatedPaths.length > 0) {
        // Always update the spot's paths with the latest from the map
        spot.paths.set(updatedPaths);
      }
    }

    if (spot instanceof LocalSpot && !this._hasEnoughDataForNewSpot(spot)) {
      this.snackBar.open(
        $localize`Add a name or some spot details before saving this new spot.`,
        $localize`Dismiss`,
        { duration: 6000 },
      );
      return;
    }

    this._spotMapDataManager
      .saveSpot(spot, this.uneditedSpot)
      .then(async (spotId) => {
        // Successfully updated - completely stop editing to destroy polygon
        this.isEditing.set(false);

        const requiresOrganizationReview =
          spot instanceof Spot &&
          (spot.management?.status === "managed" ||
            (spot.stewardship?.organization_ids?.length ?? 0) > 0);
        const saveMessage = requiresOrganizationReview
          ? $localize`Edit submitted for organization review`
          : $localize`Spot saved successfully`;
        this.snackBar.open(saveMessage, $localize`Dismiss`, { duration: 5000 });

        if ("id" in spot && spot.id) {
          // If it's an existing spot, update the local cache immediately to avoid stale data from potential race conditions
          this._spotMapDataManager.addOrUpdateNewSpotToLoadedSpotsAndUpdate(
            spot as Spot,
          );
          this.selectedSpot.set(spot as Spot);
          this.uneditedSpot = (spot as Spot).clone();
        } else {
          // For new spots, don't wait for server - update optimistically!
          // Convert the LocalSpot to a proper Spot with the new ID
          const optimisticSpot = convertLocalSpotToSpot(
            spot as LocalSpot,
            spotId,
          );

          // Add it to the cache immediately so it stays visible
          this._spotMapDataManager.addOrUpdateNewSpotToLoadedSpotsAndUpdate(
            optimisticSpot,
          );

          // Set as selected and current
          this.selectedSpot.set(optimisticSpot);
          this.uneditedSpot = optimisticSpot.clone();

          // Still try to fetch the real data in background to eventually sync timestamps/metadata
          // But don't block the UI or show loading state
          this._spotMapDataManager
            .loadAndAddSpotById(spotId)
            .then((serverSpot) => {
              if (serverSpot) {
                console.log("Synced spot with server data");
                // Optional: update again if needed, but optimistic data is usually fresher for user-edited fields
              }
            });
        }
      })
      .catch((error) => {
        this.isEditing.set(false);
        console.error("Error saving spot:", error);
        this.analyticsService.reportError(error, {
          context: "spot_save_failed",
          feature: "spots",
          action: spot instanceof LocalSpot ? "add_spot" : "update_spot",
          userFacing: true,
          properties: {
            spot_id: "id" in spot ? spot.id : null,
            is_new_spot: spot instanceof LocalSpot,
            has_bounds: spot.hasBounds(),
            media_count: spot.userMedia().length,
            spot_type: spot.type(),
            spot_access: spot.access(),
          },
        });
        this.snackBar.open($localize`Error saving spot`, $localize`Dismiss`);
      });
  }

  private _hasEnoughDataForNewSpot(spot: LocalSpot): boolean {
    return (
      this._hasCustomName(spot) ||
      this._hasDescription(spot) ||
      spot.userMedia().length > 0 ||
      spot.hasBounds() ||
      spot.type() !== SpotTypes.Other ||
      spot.access() !== SpotAccess.Other ||
      Boolean(spot.googlePlaceId()) ||
      Object.values(spot.amenities() ?? {}).some(
        (value) => value !== null && value !== undefined,
      )
    );
  }

  private _hasCustomName(spot: LocalSpot): boolean {
    const defaultName = $localize`Unnamed Spot`.trim().toLocaleLowerCase();
    return Object.values(spot.names()).some((entry) => {
      const name = entry?.text.trim();
      return Boolean(name && name.toLocaleLowerCase() !== defaultName);
    });
  }

  private _hasDescription(spot: LocalSpot): boolean {
    return Object.values(spot.descriptions() ?? {}).some((entry) =>
      Boolean(entry?.text.trim()),
    );
  }

  discardEdit() {
    // reset paths of editing polygon
    this.isEditing.set(false);

    if (!this.uneditedSpot) {
      // there is no backup unedited spot of the selected spot, therefore this is a newly created spot
      // delete local newly created spots
      //this.removeNewSpotFromLoadedSpotsAndUpdate();
      this.selectedSpot.set(null);
    } else {
      // set the selected spot to be the backup unedited spot
      this.selectedSpot.set(this.uneditedSpot);

      delete this.uneditedSpot;

      // reset the map to show the unedited spot
      // this.updateSpotInLoadedSpots(this.selectedSpot);
      // this.updateVisibleSpots();
    }
  }

  spotMarkerMoved(event: { coords: google.maps.LatLngLiteral }) {
    if (this.selectedSpot) {
      this.selectedSpot()?.location.set(event.coords);
      this.selectedSpot()?.location.set(event.coords); // reflect move on map
    } else {
      console.error(
        "User somehow could change the spot marker position without having a spot selected",
      );
    }
  }

  /**
   * Unselect the spot and close the bottom panel
   */
  closeSpot() {
    console.log("closeSpot called. isEditing:", this.isEditing());
    if (this.isEditing()) {
      // TODO show dialog
      alert(
        "You are currently editing a spot. Please save or discard your changes before closing the spot.",
      );
      return;
      //this.discardEdit();
    }

    // unselect
    this._spotOpenRequestVersion++;
    this.selectedSpot.set(null);
  }

  /**
   * Add the first bounds to a spot. This can be used if the spot has no bounds attached to it.
   */
  addBounds() {
    if (this.selectedSpot instanceof LocalSpot) {
      console.error(
        "The spot has no ID. It needs to be saved before bounds can be added to it.",
      );
      return;
    }

    const location = this.selectedSpot()?.location();
    if (!location) return;

    // Enable editing mode so the polygon becomes visible and editable
    if (!this.isEditing()) {
      this.startEdit();
    }

    // TODO fix with mercator projection (this brakes at the poles)
    const dist = 0.0001;
    let _paths: Array<Array<google.maps.LatLngLiteral>> = [
      [
        { lat: location.lat + dist, lng: location.lng + dist },
        { lat: location.lat - dist, lng: location.lng + dist },
        { lat: location.lat - dist, lng: location.lng - dist },
        { lat: location.lat + dist, lng: location.lng - dist },
      ],
    ];

    // Use the map component's updateSelectedSpotPaths method to properly update the paths
    if (this.map) {
      this.map.updateSelectedSpotPaths(_paths);
    } else {
      // Fallback if map is not available
      this.selectedSpot.update((spot) => {
        if (!spot) return spot;
        spot.paths.set(_paths);
        return spot;
      });
    }
  }

  private _debugMapEvent(
    event: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.isDebug()) return;

    console.debug("[MapDebug][SpotMap]", event, {
      ...payload,
      selectedSpot: this._getSelectedSpotKey(),
      timestamp: Math.round(performance.now()),
    });
  }

  private _getSelectedSpotKey(): string | null {
    const spot = this.selectedSpot();
    if (!spot) return null;
    return this._getSpotFocusKey(spot);
  }
}
