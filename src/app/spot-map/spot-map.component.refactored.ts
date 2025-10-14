import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Inject,
  Input,
  LOCALE_ID,
  OnDestroy,
  Output,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
} from "@angular/core";
import { Observable, Subscription, distinctUntilChanged } from "rxjs";
import { firstValueFrom } from "rxjs";
import { AsyncPipe } from "@angular/common";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";

// Your existing imports (adjust paths as needed)
import { LocalSpot, Spot } from "../../db/models/Spot";
import { SpotId } from "../../db/schemas/SpotSchema";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { LocaleCode } from "../../db/models/Interfaces";
import { GeoPoint } from "@firebase/firestore";
import {
  MapTileKey,
  getClusterTileKey,
  SpotClusterDotSchema,
} from "../../db/schemas/SpotClusterTile";
import { TilesObject } from "../map/map.component";
import { MarkerSchema } from "../marker/marker.component";
import { PolygonSchema } from "../../db/schemas/PolygonSchema";
import {
  SpotChallenge,
  LocalSpotChallenge,
  SpotChallengePreview,
} from "../../db/models/SpotChallenge";

// Services
import { SpotsService } from "../services/firebase/firestore/spots.service";
import { AuthenticationService } from "../services/firebase/authentication.service";
import { MapsApiService } from "../services/maps-api.service";
import { OsmDataService } from "../services/osm-data.service";

// Components
import { MapComponent } from "../map/map.component";

// New marker management
import {
  MarkerManagerService,
  EnhancedMarkerSchema,
} from "../map/services/marker-manager.service";
import { SpotMapDataManager } from "./SpotMapDataManager";
import { MapHelpers } from "../../scripts/MapHelpers";

@Component({
  selector: "app-spot-map",
  templateUrl: "./spot-map.component.html",
  styleUrls: ["./spot-map.component.scss"],
  imports: [MapComponent, MatSnackBarModule, AsyncPipe],
  animations: [],
})
export class SpotMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild("map") map: MapComponent | undefined;

  // Inject services
  osmDataService = inject(OsmDataService);
  private markerManager = inject(MarkerManagerService);

  // Model signals for two-way binding
  selectedSpot = model<Spot | LocalSpot | null>(null);
  selectedSpotChallenges = model<SpotChallengePreview[]>([]);
  selectedChallenge = model<SpotChallenge | LocalSpotChallenge | null>(null);
  isEditing = model<boolean>(false);
  mapStyle = model<"roadmap" | "satellite" | null>(null);

  // Input signals
  markers = input<MarkerSchema[]>([]);
  polygons = input<PolygonSchema[]>([]);
  selectedMarker = input<google.maps.LatLngLiteral | null>(null);
  focusZoom = input<number>(17);
  isClickable = input<boolean>(true);
  showAmenities = input<boolean>(false);
  centerStart = input<google.maps.LatLngLiteral | null>(null);
  showSpotPreview = input<boolean>(false);

  // Regular inputs
  @Input() showGeolocation: boolean = true;
  @Input() showSatelliteToggle: boolean = false;
  @Input() minZoom: number = 2;
  @Input() boundRestriction: {
    north: number;
    south: number;
    west: number;
    east: number;
  } | null = null;
  @Input() spots: (Spot | LocalSpot)[] = [];

  // Outputs
  @Output() hasGeolocationChange = new EventEmitter<boolean>();
  @Output() visibleSpotsChange = new EventEmitter<Spot[]>();
  @Output() hightlightedSpotsChange = new EventEmitter<SpotPreviewData[]>();
  @Output() markerClickEvent = new EventEmitter<{
    marker: EnhancedMarkerSchema;
    index?: number;
  }>();

  uneditedSpot?: Spot | LocalSpot;

  startZoom: number = 4;
  mapZoom: number = this.startZoom;
  mapCenter?: google.maps.LatLngLiteral;
  bounds?: google.maps.LatLngBounds;

  private _spotMapDataManager = new SpotMapDataManager(this.locale);

  // Observable streams
  hightlightedSpots: SpotPreviewData[] = [];
  visibleSpots$: Observable<Spot[]> = this._spotMapDataManager.visibleSpots$;
  visibleDots$: Observable<SpotClusterDotSchema[]> =
    this._spotMapDataManager.visibleDots$;
  visibleHighlightedSpots$: Observable<SpotPreviewData[]> =
    this._spotMapDataManager.visibleHighlightedSpots$;
  visibleAmenityMarkers$: Observable<MarkerSchema[]> =
    this._spotMapDataManager.visibleAmenityMarkers$;

  // Subscriptions
  private _visibleSpotsSubscription: Subscription | undefined;
  private _visibleHighlightedSpotsSubscription: Subscription | undefined;
  private _visibleMarkersSubscription: Subscription | undefined;
  private _visibleDotsSubscription: Subscription | undefined;

  // Previous tile tracking
  private _previousTileZoom: 4 | 8 | 12 | 16 | undefined;
  private _previousSouthWestTile: google.maps.Point | undefined;
  private _previousNorthEastTile: google.maps.Point | undefined;
  private _visibleTiles: Set<MapTileKey> = new Set<MapTileKey>();
  private _visibleTilesObj: TilesObject | undefined;

  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    private _spotsService: SpotsService,
    private authService: AuthenticationService,
    private mapsAPIService: MapsApiService,
    private snackBar: MatSnackBar,
    private cd: ChangeDetectorRef
  ) {
    // Track spot changes and update markers
    let previousSpotKey: string | null = null;
    effect(() => {
      const spot = this.selectedSpot();
      if (spot) {
        const currentSpotKey = "id" in spot ? spot.id : "local";
        if (currentSpotKey !== previousSpotKey) {
          // Spot actually changed
          this.markerManager.setSelectedSpotMarker(spot, this.isEditing());
          previousSpotKey = currentSpotKey;
        }
      } else {
        this.markerManager.setSelectedSpotMarker(null);
        previousSpotKey = null;
      }
    });

    // Handle amenity markers
    effect(() => {
      const showAmenities = this.showAmenities();
      const inputMarkers = this.markers();

      // Clear existing amenity markers
      this.markerManager.removeMarkersByType("amenity-water");
      this.markerManager.removeMarkersByType("amenity-toilet");

      if (showAmenities) {
        // Subscribe to amenity markers and add them through marker manager
        this._visibleMarkersSubscription =
          this.visibleAmenityMarkers$.subscribe((amenityMarkers) => {
            // Separate water and toilet markers
            const waterMarkers = amenityMarkers.filter(
              (m) =>
                m.icons?.includes("water_full") ||
                m.icons?.includes("water_drop")
            );
            const toiletMarkers = amenityMarkers.filter((m) =>
              m.icons?.includes("wc")
            );

            if (waterMarkers.length > 0) {
              this.markerManager.addAmenityMarkers(
                waterMarkers,
                "amenity-water"
              );
            }
            if (toiletMarkers.length > 0) {
              this.markerManager.addAmenityMarkers(
                toiletMarkers,
                "amenity-toilet"
              );
            }
          });
      } else {
        if (this._visibleMarkersSubscription) {
          this._visibleMarkersSubscription.unsubscribe();
        }
      }

      // Always add custom input markers
      this.markerManager.removeMarkersByType("custom");
      if (inputMarkers.length > 0) {
        this.markerManager.addCustomMarkers(inputMarkers);
      }
    });

    // Handle spots as markers
    effect(() => {
      const spots = this.spots;
      this.markerManager.removeMarkersByType("spot");
      if (spots.length > 0) {
        this.markerManager.addSpotsAsMarkers(spots);
      }
    });

    // Handle cluster dots subscription
    this._visibleDotsSubscription = this.visibleDots$.subscribe((dots) => {
      this.markerManager.removeMarkersByType("spot-cluster");
      if (dots.length > 0) {
        this.markerManager.addClusterDotsAsMarkers(dots);
      }
    });

    // Handle highlighted spots
    this._visibleHighlightedSpotsSubscription =
      this.visibleHighlightedSpots$.subscribe((highlightedSpots) => {
        this.markerManager.removeMarkersByType("highlighted-spot");
        if (highlightedSpots.length > 0) {
          this.markerManager.addHighlightedSpotsAsMarkers(highlightedSpots);
        }
        this.hightlightedSpotsChange.emit(highlightedSpots);
      });
  }

  // Normalize passthrough for map marker click events (template is shared with non-refactored component)
  onMarkerClickFromMap(evt: any) {
    this.markerClickEvent.emit(evt);
  }

  isInitiated: boolean = false;

  async ngAfterViewInit(): Promise<void> {
    if (!this.map) {
      console.warn("Map not initialized in ngAfterViewInit!");
      return;
    }

    // Initialize map style
    if (this.mapStyle() === null) {
      this.mapsAPIService
        .loadMapStyle("roadmap")
        .then((style: "satellite" | "roadmap") => {
          this.mapStyle.set(style);
        });
    }

    // Initialize map center and zoom based on priority
    const selectedSpot = this.selectedSpot();
    const centerStart = this.centerStart();

    if (selectedSpot) {
      this.map.center = selectedSpot.location();
      this.mapZoom = this.focusZoom();
    } else if (centerStart) {
      this.map.center = centerStart;
      this.mapZoom = this.focusZoom();
    } else if (this.boundRestriction) {
      console.debug("Using start center since we have bounds restriction");
      this.map.center = new google.maps.LatLngBounds(this.boundRestriction)
        .getCenter()
        .toJSON();
      this.mapZoom = this.focusZoom();
    } else {
      try {
        const lastLocation = await this.mapsAPIService.loadLastLocation();
        this.map.center = lastLocation.center;
        this.mapZoom = lastLocation.zoom;
      } catch (error) {
        console.debug("Could not load last location, using default");
        this.map.center = { lat: 46.8182, lng: 8.2275 }; // Default to Switzerland
        this.mapZoom = this.startZoom;
      }
    }

    // Subscribe to visible spots
    this._visibleSpotsSubscription = this.visibleSpots$
      .pipe(
        distinctUntilChanged(
          (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
        )
      )
      .subscribe((spots) => {
        this.visibleSpotsChange.emit(spots);
      });

    this.isInitiated = true;
  }

  ngOnDestroy(): void {
    if (this._visibleSpotsSubscription) {
      this._visibleSpotsSubscription.unsubscribe();
    }
    if (this._visibleHighlightedSpotsSubscription) {
      this._visibleHighlightedSpotsSubscription.unsubscribe();
    }
    if (this._visibleMarkersSubscription) {
      this._visibleMarkersSubscription.unsubscribe();
    }
    if (this._visibleDotsSubscription) {
      this._visibleDotsSubscription.unsubscribe();
    }
  }

  // Map event handlers
  zoomChanged(zoom: number) {
    this.mapZoom = zoom;
    this.markerManager.setZoom(zoom);
  }

  mapClick(event: google.maps.LatLngLiteral) {
    if (this.selectedSpot()) {
      this.closeSpot();
    }
  }

  focusOnGeolocation() {
    if (!this.map) return;
    this.map.useGeolocation();
    this.map.focusOnGeolocation();
  }

  visibleTilesChanged(visibleTilesObj: TilesObject): void {
    this._visibleTilesObj = visibleTilesObj;
    if (!visibleTilesObj) return;

    this._spotMapDataManager.setVisibleTiles(visibleTilesObj);
    this.markerManager.setVisibleTiles(visibleTilesObj);
  }

  mapBoundsChanged(bounds: google.maps.LatLngBounds, zoom: number) {
    this.bounds = bounds;

    if (!this.boundRestriction) {
      let newCenter: google.maps.LatLngLiteral = bounds.getCenter().toJSON();
      if (this.isInitiated && newCenter !== this.centerStart()) {
        this.mapsAPIService.storeLastLocation(newCenter, zoom);
      }
    }
  }

  // Spot management methods
  openSpotByWhateverMeansNecessary(
    spot: LocalSpot | Spot | SpotPreviewData | SpotId
  ) {
    if (this.selectedSpot() === spot) {
      this.closeSpot();
      if (this.selectedSpot() === spot) {
        return;
      }
    }

    if (spot instanceof Spot) {
      this.selectedSpot.set(spot);
    }
    let spotId: SpotId;

    if (typeof spot === "string") {
      spotId = spot;
    } else if ("id" in spot) {
      spotId = spot.id as SpotId;
      if ("location" in spot) {
        this.focusPoint(spot.location());
      }
    } else {
      console.error("Invalid spot data provided:", spot);
      return;
    }

    this.openSpotById(spotId);
  }

  openSpotById(spotId: SpotId) {
    if (!spotId) {
      console.error("No spot ID provided to open spot by ID");
      return;
    }

    firstValueFrom(this._spotsService.getSpotById$(spotId, this.locale)).then(
      (spot) => {
        if (spot) {
          this.selectedSpot.set(spot);
          this.focusSpot(spot);
        } else {
          console.error("Spot not found:", spotId);
        }
      }
    );
  }

  focusSpot(spot: Spot | LocalSpot) {
    const zoom = Math.max(this.mapZoom, this.focusZoom());
    this.focusPoint(spot.location(), zoom);
  }

  focusPoint(
    point: google.maps.LatLngLiteral,
    zoom: number = this.focusZoom()
  ) {
    if (this.map?.googleMap) {
      this.map.googleMap.panTo(point);
      this.mapZoom = Math.max(this.mapZoom, zoom);
    } else {
      if (this.map) {
        this.map.center = point;
        this.mapZoom = Math.max(this.mapZoom, zoom);
      }
    }
  }

  focusBounds(bounds: google.maps.LatLngBounds) {
    this.map?.fitBounds(bounds);
  }

  toggleMapStyle() {
    let newMapStyle: "roadmap" | "satellite" = "roadmap";
    if (this.mapStyle() === "roadmap") {
      newMapStyle = "satellite";
    } else {
      newMapStyle = "roadmap";
    }
    this.mapStyle.set(newMapStyle);
    this.mapsAPIService.storeMapStyle(newMapStyle);
  }

  createSpot() {
    if (!this.authService.isSignedIn) {
      alert("Please sign in to create a spot");
      return;
    }

    if (!this.map || !this.map.googleMap) return;

    let center_coordinates: google.maps.LatLngLiteral | undefined =
      this.map.googleMap.getCenter()?.toJSON();

    if (!center_coordinates) {
      console.error("Could not get center coordinates of the map");
      return;
    }

    this.selectedSpot.set(
      new LocalSpot(
        {
          name: { [this.locale]: $localize`Unnamed Spot` },
          location: new GeoPoint(
            center_coordinates.lat,
            center_coordinates.lng
          ),
        },
        this.locale as LocaleCode
      )
    );

    this.isEditing.set(true);
  }

  startEdit() {
    if (this.isEditing()) {
      this.isEditing.set(false);
      this.cd.detectChanges();
      if (this.map) {
        this.map.forcePolygonRecreation();
      }

      setTimeout(() => {
        this.isEditing.set(true);
        this.uneditedSpot = this.selectedSpot()?.clone();
      }, 100);
    } else {
      if (this.map) {
        this.map.forcePolygonRecreation();
      }

      this.isEditing.set(true);
      this.uneditedSpot = this.selectedSpot()?.clone();
    }
  }

  async saveSpot(spot: LocalSpot | Spot) {
    if (this.map && this.isEditing()) {
      let updatedPaths = await this.map.getSelectedSpotPolygonPaths();

      if (updatedPaths && updatedPaths.length > 0) {
        spot.paths = updatedPaths;
      }
    }

    this._spotMapDataManager
      .saveSpot(spot)
      .then(() => {
        this.isEditing.set(false);
        this.cd.detectChanges();
        if (this.map) {
          this.map.forcePolygonRecreation();
        }

        this.snackBar.open(
          $localize`Spot saved successfully`,
          $localize`Dismiss`,
          { duration: 5000 }
        );
      })
      .catch((error) => {
        this.isEditing.set(false);
        console.error("Error saving spot:", error);
        this.snackBar.open($localize`Error saving spot`, $localize`Dismiss`);
      });
  }

  discardEdit() {
    this.isEditing.set(false);

    if (!this.uneditedSpot) {
      this.selectedSpot.set(null);
    } else {
      this.selectedSpot.set(this.uneditedSpot);
      delete this.uneditedSpot;
    }
  }

  spotMarkerMoved(event: { coords: google.maps.LatLngLiteral }) {
    if (this.selectedSpot) {
      this.selectedSpot()?.location.set(event.coords);
    } else {
      console.warn("No selected spot to move");
    }
  }

  closeSpot() {
    if (this.isEditing()) {
      this.discardEdit();
    }

    this.selectedSpot.set(null);
  }

  addBounds() {
    if (this.selectedSpot instanceof LocalSpot) {
      // Handle local spot bounds addition
    }

    const location = this.selectedSpot()?.location();
    if (!location) return;

    if (!this.isEditing()) {
      this.startEdit();
    }

    const dist = 0.0001;
    let _paths: Array<Array<google.maps.LatLngLiteral>> = [
      [
        { lat: location.lat + dist, lng: location.lng + dist },
        { lat: location.lat - dist, lng: location.lng + dist },
        { lat: location.lat - dist, lng: location.lng - dist },
        { lat: location.lat + dist, lng: location.lng - dist },
      ],
    ];

    if (this.map) {
      this.map.updateSelectedSpotPaths(_paths);
    } else {
      console.error("Map not available to update paths");
    }
  }

  // Handle marker click events from the unified marker system
  onMarkerClick(event: { marker: EnhancedMarkerSchema; index?: number }) {
    const { marker } = event;

    switch (marker.type) {
      case "spot":
      case "highlighted-spot":
        if (marker.data) {
          this.openSpotByWhateverMeansNecessary(marker.data);
        }
        break;
      case "spot-cluster":
        this.clickDot(marker.data);
        break;
      case "custom":
      case "amenity-water":
      case "amenity-toilet":
        this.markerClickEvent.emit(event);
        break;
    }
  }

  private clickDot(dot: SpotClusterDotSchema) {
    if (dot.spot_id) {
      this.openSpotById(dot.spot_id);
    } else {
      this.focusPoint({
        lat: dot.location.latitude,
        lng: dot.location.longitude,
      });
    }
  }
}
