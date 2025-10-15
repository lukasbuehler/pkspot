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
} from "@angular/core";
import { LocalSpot, Spot } from "../../db/models/Spot";
import { SpotId } from "../../db/schemas/SpotSchema";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { ActivatedRoute } from "@angular/router";
import { GeoPoint } from "firebase/firestore";
import { firstValueFrom, Observable, retry, Subscription } from "rxjs";
import { MapHelpers } from "../../scripts/MapHelpers";
import { AuthenticationService } from "../services/firebase/authentication.service";
import { MapComponent, TilesObject } from "../map/map.component";
import {
  MapTileKey,
  getClusterTileKey,
  getDataFromClusterTileKey,
  SpotClusterDotSchema,
  SpotClusterTileSchema,
} from "../../db/schemas/SpotClusterTile";
import { MapsApiService } from "../services/maps-api.service";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { AsyncPipe, isPlatformServer } from "@angular/common";
import { SpotsService } from "../services/firebase/firestore/spots.service";
import { SlugsService } from "../services/firebase/firestore/slugs.service";
import { LocaleCode } from "../../db/models/Interfaces";
import { MarkerSchema } from "../marker/marker.component";
import { OsmDataService } from "../services/osm-data.service";
import { SpotMapDataManager } from "./SpotMapDataManager";
import { distinctUntilChanged } from "rxjs/operators";
import { PolygonSchema } from "../../db/schemas/PolygonSchema";
import {
  LocalSpotChallenge,
  SpotChallenge,
  SpotChallengePreview,
} from "../../db/models/SpotChallenge";
import { AnyMedia } from "../../db/models/Media";

@Component({
  selector: "app-spot-map",
  templateUrl: "./spot-map.component.html",
  styleUrls: ["./spot-map.component.scss"],
  imports: [MapComponent, MatSnackBarModule, AsyncPipe],
  animations: [],
})
export class SpotMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild("map") map: MapComponent | undefined;

  osmDataService = inject(OsmDataService);

  selectedSpot = model<Spot | LocalSpot | null>(null); // input and output signal
  selectedSpotChallenges = model<SpotChallengePreview[]>([]);
  selectedChallenge = model<SpotChallenge | LocalSpotChallenge | null>(null);

  isEditing = model<boolean>(false);
  mapStyle = model<"roadmap" | "satellite" | null>(null);
  markers = input<MarkerSchema[]>([]);
  polygons = input<PolygonSchema[]>([]);
  selectedMarker = input<google.maps.LatLngLiteral | null>(null);
  focusZoom = input<number>(17);
  isClickable = input<boolean>(true);
  showAmenities = input<boolean>(false);
  centerStart = input<google.maps.LatLngLiteral | null>(null);
  showSpotPreview = input<boolean>(false);

  @Input() showGeolocation: boolean = true;
  @Input() showSatelliteToggle: boolean = false;
  @Input() minZoom: number = 4; // 2 is not working - Idea: Allow zooming out to 2, will use zoom 4 cluster data as fallback
  @Input() boundRestriction: {
    north: number;
    south: number;
    west: number;
    east: number;
  } | null = null;
  @Input() spots: (Spot | LocalSpot)[] = [];

  @Output() hasGeolocationChange = new EventEmitter<boolean>();
  @Output() visibleSpotsChange = new EventEmitter<Spot[]>();
  @Output() hightlightedSpotsChange = new EventEmitter<SpotPreviewData[]>();
  @Output() markerClickEvent = new EventEmitter<
    number | { marker: any; index?: number }
  >();

  uneditedSpot?: Spot | LocalSpot;

  startZoom: number = 4;
  mapZoom: number = this.startZoom;
  mapCenter?: google.maps.LatLngLiteral;
  bounds?: google.maps.LatLngBounds;

  // markers for water and toilets
  loadedInputMarkers: Signal<Map<MapTileKey, MarkerSchema[]>> = computed(() => {
    const map = new Map<MapTileKey, MarkerSchema[]>();

    if (this.markers().length > 0) {
      this.markers().forEach((marker) => {
        const tile = MapHelpers.getTileCoordinatesForLocationAndZoom(
          marker.location,
          16
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
    inject(Injector)
  );

  hightlightedSpots: SpotPreviewData[] = [];
  visibleSpots$: Observable<Spot[]> = this._spotMapDataManager.visibleSpots$;
  visibleDots$: Observable<SpotClusterDotSchema[]> =
    this._spotMapDataManager.visibleDots$;
  visibleHighlightedSpots$: Observable<SpotPreviewData[]> =
    this._spotMapDataManager.visibleHighlightedSpots$;
  visibleAmenityMarkers$: Observable<MarkerSchema[]> =
    this._spotMapDataManager.visibleAmenityMarkers$;

  visibleMarkers = signal<MarkerSchema[]>([]);

  private _visibleSpotsSubscription: Subscription | undefined;
  private _visibleHighlightedSpotsSubscription: Subscription | undefined;
  private _visibleMarkersSubscription: Subscription | undefined;

  // previous tile coordinates used to check if the visible tiles have changed
  private _previousTileZoom: 4 | 8 | 12 | 16 | undefined;
  private _previousSouthWestTile: google.maps.Point | undefined;
  private _previousNorthEastTile: google.maps.Point | undefined;
  private _visibleTiles: Set<MapTileKey> = new Set<MapTileKey>();
  private _visibleTilesObj: TilesObject | undefined;

  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    private _spotsService: SpotsService,
    private _slugsService: SlugsService,
    private authService: AuthenticationService,
    private mapsAPIService: MapsApiService,
    private snackBar: MatSnackBar,
    private cd: ChangeDetectorRef // <-- Inject ChangeDetectorRef
  ) {
    // Track the previous spot to detect actual changes
    let previousSpotKey: string | null = null;

    effect(() => {
      const spot = this.selectedSpot();
      if (spot) {
        this.focusSpot(spot);

        // Create a key for the current spot
        const currentSpotKey =
          "id" in spot
            ? (spot.id as string)
            : `local-${spot.location().lat}-${spot.location().lng}`;

        // AGGRESSIVE POLYGON RESET: If spot changed and we're editing, restart the editing mode
        if (previousSpotKey && previousSpotKey !== currentSpotKey && this.map) {
          if (this.isEditing()) {
            // Stop editing completely to destroy the polygon
            this.isEditing.set(false);
            this.cd.detectChanges();

            // Force polygon recreation on the map component
            this.map.forcePolygonRecreation();

            // Wait a moment, then restart editing
            setTimeout(() => {
              this.isEditing.set(true);
              this.cd.detectChanges();
            }, 150);
          } else {
            // Even if not editing, force polygon recreation to clear any stale state
            this.map.forcePolygonRecreation();
          }
        }

        previousSpotKey = currentSpotKey;
      } else {
        previousSpotKey = null;
      }
    });

    effect(() => {
      const showAmenities = this.showAmenities();
      const inputMarkers = this.markers();

      if (showAmenities) {
        this._visibleMarkersSubscription =
          this.visibleAmenityMarkers$.subscribe((markers) => {
            if (!markers || markers.length === 0) {
              this.visibleMarkers.set(inputMarkers);
              return;
            }
            this.visibleMarkers.set(markers.concat(inputMarkers));
          });
      } else {
        this.visibleMarkers.set(inputMarkers);
        if (this._visibleMarkersSubscription) {
          this._visibleMarkersSubscription.unsubscribe();
        }
      }
    });
  }

  isInitiated: boolean = false;

  async ngAfterViewInit(): Promise<void> {
    if (!this.map) {
      console.warn("Map not initialized in ngAFterViewInit!");
      return;
    }

    // load the map style from memory
    if (this.mapStyle() === null) {
      this.mapsAPIService
        .loadMapStyle("roadmap")
        .then((style: "satellite" | "roadmap") => {
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

    if (selectedSpot) {
      // If we have a selected spot, focus on it
      this.map.center = selectedSpot.location();
      this.mapZoom = this.focusZoom();
    } else if (centerStart) {
      // Use the provided center start
      this.map.center = centerStart;
      this.mapZoom = this.focusZoom();
    } else if (this.boundRestriction) {
      // Use bound restriction center
      console.debug("Using start center since we have bounds restriction");
      this.map.center = new google.maps.LatLngBounds(this.boundRestriction)
        .getCenter()
        .toJSON();
      this.mapZoom = this.focusZoom();
    } else {
      // Load last location from memory or use default
      try {
        const lastLocationAndZoom =
          await this.mapsAPIService.loadLastLocationAndZoom();
        if (this.map) {
          if (lastLocationAndZoom) {
            this.map.center = lastLocationAndZoom.location;
            this.mapZoom = lastLocationAndZoom.zoom;
          } else {
            this.map.center = {
              lat: 48.6270939,
              lng: 2.4305363,
            };
            this.mapZoom = this.startZoom;
          }
        }
      } catch (error) {
        console.warn(
          "Failed to load last location from storage, using default:",
          error
        );
        if (this.map) {
          this.map.center = {
            lat: 48.6270939,
            lng: 2.4305363,
          };
          this.mapZoom = this.startZoom;
        }
      }
    }

    this._visibleSpotsSubscription = this.visibleSpots$
      .pipe(
        distinctUntilChanged(
          (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
        )
      )
      .subscribe((spots) => {
        this.visibleSpotsChange.emit(spots);
      });

    this._visibleHighlightedSpotsSubscription = this.visibleHighlightedSpots$
      .pipe(
        distinctUntilChanged(
          (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
        )
      )
      .subscribe((highlightedSpots) => {
        this.hightlightedSpotsChange.emit(highlightedSpots);
      });

    // TODO this is not sufficient if the input changes
    this.visibleMarkers.set(this.markers()); // ?????

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
  }

  // Map events ///////////////////////////////////////////////////////////////

  zoomChanged(zoom: number) {
    this.mapZoom = zoom;
  }

  mapClick(event: google.maps.LatLngLiteral) {
    /**
     * When the map is clicked with a spot open, the spot is
     * closed and the bottom panel cloes as well.
     */
    if (this.selectedSpot()) {
      this.closeSpot();
    }
  }

  // Normalize passthrough for map marker click events
  onMarkerClickFromMap(evt: number | { marker: any; index?: number }) {
    // Simply forward; the Output already supports both shapes
    this.markerClickEvent.emit(evt);
  }

  focusOnGeolocation() {
    if (!this.map) return;

    this.map.useGeolocation();
    this.map.focusOnGeolocation();
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

    this._spotMapDataManager.setVisibleTiles(visibleTilesObj);
  }

  mapBoundsChanged(bounds: google.maps.LatLngBounds, zoom: number) {
    // update the local bounds variable
    this.bounds = bounds;

    if (!this.boundRestriction) {
      // store the new last location in the browser memory to restore it on next visit
      let newCenter: google.maps.LatLngLiteral = bounds.getCenter().toJSON();
      if (this.isInitiated && newCenter !== this.centerStart()) {
        if (this.mapCenter !== newCenter || zoom !== this.mapZoom) {
          this.mapsAPIService.storeLastLocationAndZoom({
            location: newCenter,
            zoom: zoom,
          });
        }
      }
    }
  }

  // Spot loading /////////////////////////////////////////////////////////////

  // Public Map helper functions

  openSpotByWhateverMeansNecessary(
    spot: LocalSpot | Spot | SpotPreviewData | SpotId
  ) {
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
        if (spot.location instanceof GeoPoint) {
          this.focusPoint({
            lat: spot.location.latitude,
            lng: spot.location.longitude,
          });
        } else if (typeof spot.location !== "undefined") {
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

    // Check if it's a slug by looking for typical slug patterns
    // Slugs are typically lowercase with hyphens, IDs are alphanumeric
    const isLikelySlug = /^[a-z0-9-]+$/.test(spotIdOrSlug);

    if (isLikelySlug) {
      // Try to resolve slug to ID first
      this._slugsService
        .getSpotIdFromSpotSlug(spotIdOrSlug)
        .then((spotId) => {
          return firstValueFrom(
            this._spotsService.getSpotById$(spotId, this.locale)
          );
        })
        .then((spot) => {
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
          // Fallback: try as ID anyway
          this._fetchSpotById(spotIdOrSlug as SpotId);
        });
    } else {
      // It's an ID, fetch directly
      this._fetchSpotById(spotIdOrSlug as SpotId);
    }
  }

  private _fetchSpotById(spotId: SpotId) {
    firstValueFrom(this._spotsService.getSpotById$(spotId, this.locale)).then(
      (spot) => {
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
      // If map is not ready yet, set the center directly
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
      // if it is equal to roadmap, toggle to satellite
      newMapStyle = "satellite";

      // this.setLightMode();
    } else {
      // otherwise toggle back to roadmap
      newMapStyle = "roadmap";
      // this.setDarkMode();
    }
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
          name: { [this.locale]: $localize`Unnamed Spot` }, // TODO change to user lang
          location: new GeoPoint(
            center_coordinates.lat,
            center_coordinates.lng
          ),
        },
        this.locale as LocaleCode
      )
    );

    // sets the map and the spot to edit mode
    this.isEditing.set(true);
  }

  startEdit() {
    // AGGRESSIVE POLYGON RESET: Force the polygon to be completely destroyed and recreated
    if (this.isEditing()) {
      // Temporarily turn off editing to destroy the polygon
      this.isEditing.set(false);

      // Force change detection and polygon recreation
      this.cd.detectChanges();
      if (this.map) {
        this.map.forcePolygonRecreation();
      }

      // Wait a moment, then turn editing back on
      setTimeout(() => {
        this.isEditing.set(true);
        this.uneditedSpot = this.selectedSpot()?.clone();
      }, 100);
    } else {
      // Normal flow - but still force polygon recreation to ensure clean state
      if (this.map) {
        this.map.forcePolygonRecreation();
      }

      this.isEditing.set(true);
      this.uneditedSpot = this.selectedSpot()?.clone();
    }
  }

  async saveSpot(spot: LocalSpot | Spot) {
    // Get the current polygon paths from the map component using the proper method
    if (this.map && this.isEditing()) {
      // Try the main async method first
      let updatedPaths = await this.map.getSelectedSpotPolygonPaths();

      if (updatedPaths && updatedPaths.length > 0) {
        // Always update the spot's paths with the latest from the map
        spot.paths = updatedPaths;
      }
    }

    this._spotMapDataManager
      .saveSpot(spot)
      .then(() => {
        // Successfully updated - completely stop editing to destroy polygon
        this.isEditing.set(false);

        // Force change detection and polygon destruction
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
        "User somehow could change the spot marker position without having a spot selected"
      );
    }
  }

  /**
   * Unselect the spot and close the bottom panel
   */
  closeSpot() {
    if (this.isEditing()) {
      // TODO show dialog
      alert(
        "You are currently editing a spot. Please save or discard your changes before closing the spot."
      );
      return;
      //this.discardEdit();
    }

    // unselect
    this.selectedSpot.set(null);
  }

  /**
   * Add the first bounds to a spot. This can be used if the spot has no bounds attached to it.
   */
  addBounds() {
    if (this.selectedSpot instanceof LocalSpot) {
      console.error(
        "The spot has no ID. It needs to be saved before bounds can be added to it."
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
        spot.paths = _paths;
        return spot;
      });
    }
  }
}
