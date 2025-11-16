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
  SimpleChanges,
  signal,
  effect,
  AfterViewInit,
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
  MapHeatmapLayer,
} from "@angular/google-maps";
import { Subscription } from "rxjs";
import { environment } from "../../../environments/environment";
import { MapsApiService } from "../../services/maps-api.service";
import { ConsentService } from "../../services/consent.service";
import {
  SpotClusterDotSchema,
  SpotClusterTileSchema,
} from "../../../db/schemas/SpotClusterTile.js";
import { GeoPoint } from "firebase/firestore";
import { AsyncPipe, NgClass } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { trigger, transition, style, animate } from "@angular/animations";
import { MarkerComponent, MarkerSchema } from "../marker/marker.component";
import { MapHelpers } from "../../../scripts/MapHelpers";
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
import { CustomMarkerComponent } from "../custom-marker/custom-marker.component";

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

export interface TilesObject {
  zoom: number;
  tiles: { x: number; y: number }[];
  ne: { x: number; y: number };
  sw: { x: number; y: number };
}

@Component({
  selector: "app-map",
  templateUrl: "./google-map-2d.component.html",
  styleUrls: ["./google-map-2d.component.scss"],
  imports: [
    GoogleMap,
    MapCircle,
    MapPolygon,
    MapRectangle,
    MapAdvancedMarker,
    MapHeatmapLayer,
    MatIconModule,
    NgClass,
    MarkerComponent,
    SpotPreviewCardComponent,
    HighlightMarkerComponent,
    CustomMarkerComponent,
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
})
export class MapComponent implements OnInit, OnChanges, AfterViewInit {
  @ViewChild("googleMap") googleMap: GoogleMap | undefined;
  // @ViewChildren(MapPolygon) spotPolygons: QueryList<MapPolygon> | undefined;
  // @ViewChildren(MapPolygon, { read: ElementRef })
  polygonElements: QueryList<ElementRef> | undefined;
  @ViewChild("selectedSpotMarkerNode") selectedSpotMarkerNode: Node | undefined;
  @ViewChild("selectedChallengeMarker") selectedChallengeMarker:
    | MapAdvancedMarker
    | undefined;
  @ViewChild("selectedSpotPolygon", { static: false, read: MapPolygon })
  selectedSpotPolygon: MapPolygon | undefined;

  // add math function to markup
  sqrt = Math.sqrt;
  Math = Math; // expose Math for template usage

  focusZoom = input<number>(17);
  isDebug = input<boolean>(false);
  showSpotPreview = input<boolean>(false);
  isEditing = input<boolean>(false);

  // Deprecated: use global theme via ThemeService instead. Kept for backward-compat; if bound, it overrides global.
  isDarkMode = input<boolean | null | undefined>(null);
  markers: InputSignal<MarkerSchema[]> = input<MarkerSchema[]>([]);
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
  @Input() set zoom(newZoom: number) {
    this._zoom.set(newZoom);
    if (this.googleMap) {
      this.googleMap.zoom = newZoom;
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

  getAndEmitChangedZoom() {
    if (!this.googleMap) return;
    this._zoom.set(this.googleMap.getZoom()!);
    this.zoomChange.emit(this._zoom());
  }

  @Output() boundsChange = new EventEmitter<google.maps.LatLngBounds>();
  @Output() visibleTilesChange = new EventEmitter<TilesObject>();
  @Output() mapClick = new EventEmitter<google.maps.LatLngLiteral>();
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

  private readonly _dotsSignal = signal<SpotClusterDotSchema[]>([]);
  private readonly _highlightedSpotsSignal = signal<SpotPreviewData[]>([]);

  @Input()
  set dots(value: SpotClusterDotSchema[] | null | undefined) {
    this._dotsSignal.set(value ? [...value] : []);
  }
  get dots(): SpotClusterDotSchema[] {
    return this._dotsSignal();
  }

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

  getHighlightZIndex(spot: SpotPreviewData): number {
    const rating = spot.rating ?? 0;
    return 1000 + Math.round(rating * 10);
  }

  selectedSpot = input<Spot | LocalSpot | null>(null);
  selectedSpotChallenges = input<SpotChallengePreview[]>([]);
  @Input() selectedChallenge: SpotChallenge | LocalSpotChallenge | null = null;

  @Input() showGeolocation: boolean = false;
  @Input() selectedMarker: google.maps.LatLngLiteral | null = null;

  @Input() boundRestriction: {
    north: number;
    south: number;
    west: number;
    east: number;
  } | null = null;
  @Input() minZoom: number = 4;

  mapStyle = input<"roadmap" | "satellite">("roadmap");
  polygons = input<PolygonSchema[]>([]);

  // defaultMarkerCollisionBehavior: google.maps.CollisionBehavior =
  //   google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY;

  mapTypeId: Signal<google.maps.MapTypeId> = computed(() => {
    switch (this.mapStyle()) {
      case "roadmap":
        return google.maps.MapTypeId.ROADMAP;
      case "satellite":
        return google.maps.MapTypeId.SATELLITE;
      default:
        return google.maps.MapTypeId.ROADMAP;
    }
  });

  boundsToRender = signal<google.maps.LatLngBounds | null>(null);

  private _previouslyVisibleTiles: TilesObject | null = null;
  visibleTiles = computed<TilesObject | null>(() => {
    const zoom = this.googleMap?.getZoom(); // this needs to be getZoom because _zoom is still outdated if panning
    const boundsToRender = this.boundsToRender();

    if (!boundsToRender || !zoom) {
      return null;
    }

    const neTile = MapHelpers.getTileCoordinatesForLocationAndZoom(
      boundsToRender.getNorthEast().toJSON(),
      zoom
    );
    const swTile = MapHelpers.getTileCoordinatesForLocationAndZoom(
      boundsToRender.getSouthWest().toJSON(),
      zoom
    );

    // if the previously visible tiles are empty, we need to render the new tiles
    if (
      this._previouslyVisibleTiles &&
      this._previouslyVisibleTiles.tiles?.length > 0
    ) {
      // Abort if the neTile and swTile are the same as before
      const prevNeTile = this._previouslyVisibleTiles.ne;
      const prevSwTile = this._previouslyVisibleTiles.sw;

      if (
        this._previouslyVisibleTiles.zoom === zoom &&
        prevNeTile.x === neTile.x &&
        prevNeTile.y === neTile.y &&
        prevSwTile.x === swTile.x &&
        prevSwTile.y === swTile.y
      ) {
        return this._previouslyVisibleTiles;
      }
    }

    // make an array of all the tiles between (and including) the NE and SW tiles
    const tilesObj: TilesObject = {
      zoom: zoom,
      tiles: [],
      ne: neTile,
      sw: swTile,
    };

    const xRange = enumerateTileRangeX(swTile.x, neTile.x, zoom);
    const yMin = Math.min(swTile.y, neTile.y);
    const yMax = Math.max(swTile.y, neTile.y);

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
  polygonRecreationKey = signal<number>(0);

  constructor(
    private cdr: ChangeDetectorRef,
    public mapsApiService: MapsApiService,
    private _consentService: ConsentService,
    private theme: ThemeService
  ) {
    // Effect to handle selected spot changes and editing state changes for polygon updates
    effect(() => {
      const tracker = this.selectedSpotTracker();
      const isEditing = this.isEditing();

      // Also trigger the debug computed signals
      this.polygonTemplateConditions();

      // Only update polygon when we have a spot AND we're in editing mode
      if (tracker && isEditing) {
        // Use setTimeout to ensure the DOM and ViewChild are updated
        setTimeout(() => {
          this.updatePolygonForNewSpot();
        }, 50);
      }
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
    return this.theme.isDark(this.mapStyle());
  });

  // Heatmap configuration - show heatmap from zoom 2+ until spots appear at zoom 16
  // Never show dots, only heatmap for cluster visualization
  shouldShowHeatmap = computed(() => {
    const z = this._zoom();
    const hasDots = this._dotsSignal().length > 0;
    return z >= 2 && z < 16 && hasDots;
  });

  // Build heatmap data from dots with weighted lat/lng
  heatmapData = computed<google.maps.visualization.WeightedLocation[]>(() => {
    const dots = this._dotsSignal();
    if (!dots || dots.length === 0) {
      return [];
    }
    return dots.map((dot) => ({
      location: new google.maps.LatLng(
        dot.location.latitude,
        dot.location.longitude
      ),
      weight: dot.weight || 1,
    }));
  });

  heatmapOptions = computed<google.maps.visualization.HeatmapLayerOptions>(
    () => {
      // Scale radius based on zoom level for better visualization
      const z = this._zoom();
      const baseRadius = z < 6 ? 10 : z < 10 ? 15 : 20;

      return this.resolvedDarkMode()
        ? {
            radius: baseRadius + z,
            gradient: [
              "rgba(184,196,255,0)",
              "rgba(184,196,255,1)",
              "rgba(43, 81, 213,1)",
            ],
            dissipating: true,
            maxIntensity: 2,
            opacity: 0.6,
          }
        : {
            radius: baseRadius + z,
            gradient: [
              "rgba(43, 81, 213,0)",
              "rgba(43, 81, 213,1)",
              "rgba(184,196,255,1)",
            ],
            dissipating: true,
            maxIntensity: 2,
            opacity: 0.6,
          };
    }
  );

  isApiLoadedSubscription: Subscription | null = null;
  consentSubscription: Subscription | null = null;

  ngOnInit() {
    if (this.mapsApiService.isApiLoaded()) {
      this.initMap();
      this.initGeolocation();
    } else {
      // Try to load Google Maps API if consent is available
      this.tryLoadMapsApi();

      // Listen for consent changes to load Maps API when consent is granted
      this.consentSubscription = this._consentService.consentGranted$.subscribe(
        (hasConsent) => {
          if (hasConsent && !this.mapsApiService.isApiLoaded()) {
            this.tryLoadMapsApi();
          }
        }
      );
    }

    if (this.boundRestriction) {
      this.mapOptions.restriction = {
        latLngBounds: this.boundRestriction,
        strictBounds: false,
      };
    }
    if (this.minZoom) {
      this.mapOptions.minZoom = this.minZoom;
    }
  }

  private tryLoadMapsApi() {
    // Try to load Google Maps API (will fail gracefully if no consent)
    this.mapsApiService.loadGoogleMapsApi();

    // Subscribe to API loading completion
    if (this.isApiLoadedSubscription) {
      this.isApiLoadedSubscription.unsubscribe();
    }

    this.isApiLoadedSubscription = this.mapsApiService.isLoading$.subscribe(
      (isLoading) => {
        if (!isLoading && this.mapsApiService.isApiLoaded()) {
          this.initMap();
          this.initGeolocation();
        }
      }
    );
  }

  ngOnChanges(changes: SimpleChanges) {
    // Check if selectedSpot has changed
    if (changes["selectedSpot"]) {
      console.log("Selected spot changed:", {
        previous: changes["selectedSpot"].previousValue,
        current: changes["selectedSpot"].currentValue,
      });

      // Force the polygon to update when spot changes
      this.handleSelectedSpotChange();
    }
  }
  /**
   * Handle when the selected spot changes - ensure polygon state is properly reset
   */
  private handleSelectedSpotChange() {
    console.log("handleSelectedSpotChange called");

    // Only force polygon recreation when we're in editing mode
    if (this.isEditing()) {
      this.forcePolygonRecreation();
    }
  }

  /**
   * Update the polygon when a new spot is selected for editing
   */
  private updatePolygonForNewSpot() {
    if (!this.isEditing() || !this.selectedSpot) {
      return;
    }

    console.log("updatePolygonForNewSpot called for:", this.selectedSpot);

    // Force change detection to ensure the ViewChild is updated
    this.cdr.detectChanges();

    // Wait a bit more for the ViewChild to be available
    setTimeout(() => {
      if (!this.selectedSpotPolygon?.polygon) {
        console.log("selectedSpotPolygon not available yet, waiting longer...");
        setTimeout(() => this.forceUpdatePolygonPaths(), 100);
        return;
      }

      this.forceUpdatePolygonPaths();
    }, 100);
  }

  /**
   * Force update the polygon paths regardless of ViewChild timing issues
   */
  private forceUpdatePolygonPaths() {
    if (!this.selectedSpotPolygon?.polygon || !this.selectedSpot) {
      console.log("Cannot force update - missing polygon or spot");
      return;
    }

    console.log("Forcing polygon paths update for spot:", this.selectedSpot);

    // Clear ALL existing paths aggressively
    const paths = this.selectedSpotPolygon.polygon.getPaths();
    for (let i = paths.getLength() - 1; i >= 0; i--) {
      paths.removeAt(i);
    }

    // Get the new paths for the current spot
    const newPaths = this.selectedSpotPaths();
    console.log("New paths to set:", newPaths);

    if (newPaths.length > 0 && newPaths[0].length > 0) {
      // Create a new path and set it
      const newPath = new google.maps.MVCArray(
        newPaths[0].map((point) => new google.maps.LatLng(point.lat, point.lng))
      );

      // Add the new path
      this.selectedSpotPolygon.polygon.getPaths().push(newPath);

      console.log("Successfully set new polygon paths");

      // Focus the map on the new polygon
      if (this.googleMap) {
        const bounds = new google.maps.LatLngBounds();
        newPaths[0].forEach((point) => bounds.extend(point));
        this.googleMap.fitBounds(bounds);
      }
    } else {
      console.warn("No valid paths to set for the new spot");
    }
  }

  ngOnDestroy() {
    if (this.isApiLoadedSubscription)
      this.isApiLoadedSubscription.unsubscribe();
    if (this.consentSubscription) this.consentSubscription.unsubscribe();
  }

  initMap(): void {
    // this.geolocationMarkerOptions = {
    //   gmpDraggable: false,
    //   gmpClickable: false,
    //   //   icon: {
    //   //     url: "assets/icons/geolocation-16x16.png",
    //   //     scaledSize: new google.maps.Size(16, 16),
    //   //     anchor: new google.maps.Point(8, 8),
    //   //   },
    //   zIndex: 1000,
    // };
    // this.primaryDotMarkerOptions = {
    //   gmpDraggable: false,
    //   gmpClickable: false,
    //   //   opacity: 0.8,
    //   //   icon: {
    //   //     url: "assets/icons/circle-primary-16x16.png",
    //   //     scaledSize: new google.maps.Size(16, 16),
    //   //     anchor: new google.maps.Point(8, 8),
    //   //   },
    // };
    // this.teriaryDotMarkerOptions = {
    //   gmpDraggable: false,
    //   gmpClickable: false,
    //   //   opacity: 0.8,
    //   //   icon: {
    //   //     url: "assets/icons/circle-tertiary-16x16.png",
    //   //     scaledSize: new google.maps.Size(16, 16),
    //   //     anchor: new google.maps.Point(8, 8),
    //   //   },
    // };
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

  initGeolocation() {
    navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      if (permission.state == "granted") {
        this.useGeolocation();
      }
    });
  }

  useGeolocation() {
    if (this.showGeolocation) {
      let geolocationWatchId = navigator.geolocation.watchPosition(
        (_location) => {
          let locObj = {
            location: {
              lat: _location.coords.latitude,
              lng: _location.coords.longitude,
            },
            accuracy: _location.coords.accuracy,
          };
          this.geolocation.set(locObj);
          this.hasGeolocationChange.emit(true);
        },
        (error) => {
          console.error(error);
          navigator.geolocation.clearWatch(geolocationWatchId);
          this.geolocation.set(null);
          this.hasGeolocationChange.emit(false);
        },
        {
          enableHighAccuracy: true,
        }
      );
    }

    this.cdr.detectChanges();
  }

  geolocation = signal<{
    location: google.maps.LatLngLiteral;
    accuracy: number;
  } | null>(null);

  //spotDotZoomRadii: number[] = Array<number>(16);

  mapOptions: google.maps.MapOptions = {
    mapId: environment.mapId,
    backgroundColor: "#000000",
    clickableIcons: false,
    gestureHandling: "greedy",
    disableDefaultUI: true,
    tilt: 0,
  };

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

  boundsChanged() {
    if (!this.googleMap) return;
    const bounds = this.googleMap.getBounds()!;

    if (this.isDebug()) {
      // set the bounds to render
      // TODO remove: for debugging set it to half the actual bounds now
      const boundsCenter = bounds.getCenter();
      const halvedBoundsLiteral: google.maps.LatLngBoundsLiteral = {
        north:
          boundsCenter.lat() +
          (bounds.getNorthEast().lat() - boundsCenter.lat()) / 2,
        south:
          boundsCenter.lat() +
          (bounds.getSouthWest().lat() - boundsCenter.lat()) / 2,
        east:
          boundsCenter.lng() +
          (bounds.getNorthEast().lng() - boundsCenter.lng()) / 2,
        west:
          boundsCenter.lng() +
          (bounds.getSouthWest().lng() - boundsCenter.lng()) / 2,
      };

      const halvedBounds = new google.maps.LatLngBounds(halvedBoundsLiteral);
      this.boundsToRender.set(halvedBounds);
    } else {
      this.boundsToRender.set(bounds);
    }

    this.boundsChange.emit(this.boundsToRender() ?? undefined);
  }

  centerChanged() {
    if (!this.googleMap) return;
    const center = this.googleMap.getCenter()!;
    this.centerChange.emit(center.toJSON());
  }

  fitBounds(bounds: google.maps.LatLngBounds) {
    if (!this.googleMap) return;

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
      const result = selectedSpot.id === spot.id;
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

    // Force polygon recreation to show the new paths
    if (this.isEditing()) {
      this.forcePolygonRecreation();
    }

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

  clickDot(dot: SpotClusterDotSchema) {
    if (dot.spot_id) {
      this.spotClick.emit(dot.spot_id as SpotId);
    } else {
      const location: google.maps.LatLng = new google.maps.LatLng(
        dot.location.latitude,
        dot.location.longitude
      );
      this.focusOnLocation(location, this.zoom + 4);
    }
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

    // If we're in editing mode and no paths exist, only create a default path
    // if the spot doesn't already have bounds (i.e., we're creating new bounds)
    const selectedSpot = this.selectedSpot();
    if (this.isEditing() && selectedSpot && !selectedSpot.hasBounds()) {
      const location = selectedSpot.location();
      const dist = 0.0001;
      const defaultPath = [
        { lat: location.lat + dist, lng: location.lng + dist },
        { lat: location.lat - dist, lng: location.lng + dist },
        { lat: location.lat - dist, lng: location.lng - dist },
        { lat: location.lat + dist, lng: location.lng - dist },
      ];

      return defaultPath;
    }

    return [];
  });

  getSelectedSpotPaths(): google.maps.LatLngLiteral[][] {
    return this.selectedSpotPaths();
  }

  ngAfterViewInit() {
    // Expose main component for debugging if needed
    (window as any).mapComponent = this;
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
   * Public method to force polygon refresh - can be called when switching spots
   */
  public refreshPolygonForSelectedSpot() {
    console.log("refreshPolygonForSelectedSpot called");

    if (!this.selectedSpot || !this.isEditing()) {
      console.log("No spot selected or not in editing mode");
      return;
    }

    console.log(
      "Forcing polygon refresh for selected spot:",
      this.selectedSpot
    );

    // Trigger change detection multiple times to ensure ViewChild is updated
    this.cdr.detectChanges();

    // Clear any existing polygon state aggressively
    if (this.selectedSpotPolygon?.polygon) {
      console.log("Clearing existing polygon state before refresh");
      const paths = this.selectedSpotPolygon.polygon.getPaths();
      paths.clear();
    }

    // Force another change detection cycle
    setTimeout(() => {
      this.cdr.detectChanges();

      // Update the polygon with proper timing
      setTimeout(() => {
        this.forceUpdatePolygonPaths();
      }, 150);
    }, 50);
  }

  /**
   * Completely reset and recreate the polygon for the current selected spot
   * This is the most aggressive approach for ensuring clean polygon state
   */
  public resetPolygonForCurrentSpot() {
    const selectedSpot = this.selectedSpot();

    if (!selectedSpot) {
      console.log("No selected spot, nothing to reset");
      return;
    }

    // Clear the ViewChild reference
    this.selectedSpotPolygon = undefined;

    // Force the polygon to be recreated by updating the recreation key
    this.forcePolygonRecreation();
  }

  /**
   * Force the polygon component to be completely destroyed and recreated
   * This is needed when switching between spots to ensure no state carryover
   */
  forcePolygonRecreation() {
    console.log("=== FORCE POLYGON RECREATION ===");
    console.log("Current editing state:", this.isEditing());
    console.log("Current selected spot:", this.selectedSpot());

    // Increment the recreation key to force template re-render
    this.polygonRecreationKey.update((key) => key + 1);
    console.log(
      "Updated polygon recreation key to:",
      this.polygonRecreationKey()
    );

    // Force change detection
    this.cdr.detectChanges();
  }

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
      polygonRecreationKey: this.polygonRecreationKey(),
      shouldShowPolygon: !!selectedSpot && isEditing && showPolygon,
    };

    return result;
  });

  closeSelectedSpot() {
    // Emit null to parent component to close the selected spot
    this.spotClick.emit(null as any);
  }
}
