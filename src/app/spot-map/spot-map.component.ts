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
} from "@angular/core";
import { LocalSpot, Spot } from "../../db/models/Spot";
import { SpotId } from "../../db/schemas/SpotSchema";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { ActivatedRoute } from "@angular/router";
import { GeoPoint } from "@firebase/firestore";
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
import { LocaleCode } from "../../db/models/Interfaces";
import { MarkerSchema } from "../marker/marker.component";
import { OsmDataService } from "../services/osm-data.service";
import { SpotMapDataManager } from "./SpotMapDataManager";
import { distinctUntilChanged } from "rxjs/operators";
import { PolygonSchema } from "../../db/schemas/PolygonSchema";
import {
  LocalSpotChallenge,
  SpotChallenge,
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
  selectedSpotChallenges = model<
    {
      name: Signal<string>;
      id: string;
      media: Signal<AnyMedia>;
      location?: google.maps.LatLngLiteral;
    }[]
  >([]);
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
  @Input() minZoom: number = 2;
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

  private _spotMapDataManager = new SpotMapDataManager(this.locale);

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
    private authService: AuthenticationService,
    private mapsAPIService: MapsApiService,
    private snackBar: MatSnackBar,
    private cd: ChangeDetectorRef // <-- Inject ChangeDetectorRef
  ) {
    effect(() => {
      const spot = this.selectedSpot();
      if (spot) {
        this.focusSpot(spot);
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

  ngAfterViewInit(): void {
    // console.log("SpotMapComponent initialized");

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

    if (!this.selectedSpot() && !this.boundRestriction) {
      // load the last location and zoom from memory
      this.mapsAPIService
        .loadLastLocationAndZoom()
        .then((lastLocationAndZoom) => {
          if (this.map) {
            if (lastLocationAndZoom) {
              this.map.center = lastLocationAndZoom.location;
              this.mapZoom = lastLocationAndZoom.zoom;
            } else {
              const centerStart = this.centerStart();
              if (centerStart) {
                this.map.center = centerStart;
              }
              this.mapZoom = this.startZoom;
            }
          }
        });
    } else if (this.boundRestriction && !this.centerStart()) {
      console.debug("Using start center since we have bounds restriction");

      this.map.center = new google.maps.LatLngBounds(this.boundRestriction)
        .getCenter()
        .toJSON();
    } else {
      this.map.center = this.centerStart() ?? {
        lat: 48.6270939,
        lng: 2.4305363,
      };
    }

    this.mapZoom = this.focusZoom();

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
    this.visibleMarkers.set(this.markers());

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
    console.debug("Opening spot by whatever means necessary:", spot);

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
    let spotId: SpotId;

    if (typeof spot === "string") {
      spotId = spot;
    } else if ("id" in spot) {
      spotId = spot.id as SpotId;
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

    this.openSpotById(spotId);
  }

  openSpotById(spotId: SpotId) {
    if (!spotId) {
      console.error("No spot ID provided to open spot by ID");
      return;
    }

    // console.log("Opening spot by ID", spotId);
    firstValueFrom(this._spotsService.getSpotById$(spotId, this.locale)).then(
      (spot) => {
        if (spot) {
          this.selectedSpot.set(spot);
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
    this.map?.googleMap?.panTo(point);
    this.mapZoom = Math.max(this.mapZoom, zoom);
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
    this.isEditing.set(true);

    this.uneditedSpot = this.selectedSpot()?.clone();
  }

  saveSpot(spot: LocalSpot | Spot) {
    this._spotMapDataManager
      .saveSpot(spot)
      .then(() => {
        // Successfully updated
        this.isEditing.set(false);
        this.snackBar.open(
          $localize`Spot saved successfully`,
          $localize`Dismiss`
        );

        // update the selected spot so that it is displayed in the URL
        this.selectedSpot.set(null);
        this.selectedSpot.set(spot);
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
    this.selectedSpot.update((spot) => {
      if (!spot) return spot;
      spot.paths = _paths;
      return spot;
    });
  }
}
