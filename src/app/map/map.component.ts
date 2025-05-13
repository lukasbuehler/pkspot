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
  signal,
  effect,
} from "@angular/core";
import { LocalSpot, Spot } from "../../db/models/Spot";
import { SpotId } from "../../db/schemas/SpotSchema";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";

import {
  GoogleMap,
  MapPolygon,
  MapCircle,
  MapAdvancedMarker,
  MapRectangle,
} from "@angular/google-maps";
import { Subscription } from "rxjs";
import { environment } from "../../environments/environment";
import { MapsApiService } from "../services/maps-api.service";
import {
  SpotClusterDotSchema,
  SpotClusterTileSchema,
} from "../../db/schemas/SpotClusterTile.js";
import { GeoPoint } from "@firebase/firestore";
import { AsyncPipe, NgClass } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { trigger, transition, style, animate } from "@angular/animations";
import { MarkerComponent, MarkerSchema } from "../marker/marker.component";
import { MapHelpers } from "../../scripts/MapHelpers";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { PolygonSchema } from "../../db/schemas/PolygonSchema";
import {
  LocalSpotChallenge,
  SpotChallenge,
} from "../../db/models/SpotChallenge";
import { AnyMedia } from "../../db/models/Media";

export interface TilesObject {
  zoom: number;
  tiles: { x: number; y: number }[];
  ne: { x: number; y: number };
  sw: { x: number; y: number };
}

@Component({
  selector: "app-map",
  templateUrl: "./map.component.html",
  styleUrls: ["./map.component.scss"],
  imports: [
    GoogleMap,
    MapCircle,
    MapPolygon,
    MapRectangle,
    MapAdvancedMarker,
    MatIconModule,
    NgClass,
    AsyncPipe,
    MarkerComponent,
    SpotPreviewCardComponent,
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
export class MapComponent implements OnInit, OnChanges {
  @ViewChild("googleMap") googleMap: GoogleMap | undefined;
  // @ViewChildren(MapPolygon) spotPolygons: QueryList<MapPolygon> | undefined;
  // @ViewChildren(MapPolygon, { read: ElementRef })
  polygonElements: QueryList<ElementRef> | undefined;
  @ViewChild("selectedSpotMarkerNode") selectedSpotMarkerNode: Node | undefined;
  @ViewChild("selectedChallengeMarker") selectedChallengeMarker:
    | MapAdvancedMarker
    | undefined;

  // add math function to markup
  sqrt = Math.sqrt;

  focusZoom = input<number>(17);
  isDebug = input<boolean>(false);
  showSpotPreview = input<boolean>(false);
  isEditing = input<boolean>(false);

  isDarkMode = input<boolean>(true); // should be false if mapStyle is roadmap and the dark map is used
  markers: InputSignal<MarkerSchema[]> = input<MarkerSchema[]>([]);

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

  @Input() spots: (LocalSpot | Spot)[] = [];
  @Input() dots: SpotClusterDotSchema[] = [];

  @Input() selectedSpot: Spot | LocalSpot | null = null;
  @Input() selectedSpotChallenges: {
    name: Signal<string>;
    id: string;
    media: Signal<AnyMedia>;
    location?: google.maps.LatLngLiteral;
  }[] = [];
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
      // abort if the neTile and swTile are the same as before
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
    for (let x = swTile.x; x <= neTile.x; x++) {
      for (let y = neTile.y; y <= swTile.y; y++) {
        tilesObj.tiles.push({ x: x, y: y });
      }
    }

    this._previouslyVisibleTiles = tilesObj;
    return tilesObj;
  });

  constructor(
    private cdr: ChangeDetectorRef,
    public mapsApiService: MapsApiService
  ) {
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

  isApiLoadedSubscription: Subscription | null = null;

  ngOnInit() {
    this.isApiLoadedSubscription = this.mapsApiService.isApiLoaded$.subscribe(
      (isLoaded) => {
        if (isLoaded) {
          this.initMap();
          this.initGeolocation();
        }
      }
    );

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

  ngOnChanges() {
    // console.log("markers in map", this.markers());
  }

  ngOnDestroy() {
    if (this.isApiLoadedSubscription)
      this.isApiLoadedSubscription.unsubscribe();
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
  //   spotPolygonEditingOptions: google.maps.PolygonOptions = {
  //     ...this.spotPolygonOptions,
  //     editable: true,
  //   };

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
  //   //     this.selectedSpotMarkerOptions = this.selectedSpotMarkerDarkOptions;
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
    if (!this.selectedSpot) return;

    this.selectedSpot.location.set(position.toJSON());
  }

  editingChallengePositionChanged(position: google.maps.LatLng) {
    if (!this.selectedChallenge) return;

    this.selectedChallenge.location.set(position.toJSON());
  }

  geopointToLatLngLiteral(geoPoint: GeoPoint): google.maps.LatLngLiteral {
    if (!geoPoint) throw new Error("No GeoPoint provided");
    if (!geoPoint.latitude || !geoPoint.longitude)
      throw new Error("Invalid GeoPoint provided");

    return { lat: geoPoint.latitude, lng: geoPoint.longitude };
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

    if (this.zoom !== this.focusZoom()) {
      this.setZoom(this.focusZoom());
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

  // private _getPolygonBySpotId(spotId: string): MapPolygon | undefined {
  //   console.log(this.polygonElements?.toArray());
  //   console.log(this.spotPolygons?.toArray());

  //   const elementRef = this.polygonElements.find(
  //     (element) => element.nativeElement.id === "polygon-" + spotId
  //   );
  //   if (elementRef) {
  //     const index = this.polygonElements.toArray().indexOf(elementRef);
  //     return this.spotPolygons.toArray()[index];
  //   }
  //   return undefined;
  // }

  // public getPolygonPathForSpot(
  //   spotId: string
  // ): google.maps.LatLngLiteral[][] | undefined {
  //   let polygon = this._getPolygonBySpotId(spotId);

  //   if (polygon) {
  //     const newPaths: google.maps.MVCArray<
  //       google.maps.MVCArray<google.maps.LatLng>
  //     > = polygon.getPaths();
  //     console.log("new paths", newPaths);

  //     // Convert LatLng[][] to LatLngLiteral[][]
  //     let literalNewPaths: Array<Array<google.maps.LatLngLiteral>> = [];
  //     literalNewPaths[0] = newPaths
  //       .getAt(0)
  //       .getArray()
  //       .map((v, i, arr) => {
  //         return { lat: v.lat(), lng: v.lng() };
  //       });

  //     return literalNewPaths;
  //   } else {
  //     console.error("No polygon found for spot with id: " + spotId);
  //     return;
  //   }
  // }
}
