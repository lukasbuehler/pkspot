import {
  OnInit,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  computed,
  input,
  InputSignal,
  Signal,
  OnChanges,
  SimpleChanges,
  signal,
  effect,
  AfterViewInit,
  inject,
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
import {
  SpotClusterDotSchema,
  SpotClusterTileSchema,
} from "../../../db/schemas/SpotClusterTile.js";
import { GeoPoint } from "@firebase/firestore";
import { AsyncPipe, NgClass } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { trigger, transition, style, animate } from "@angular/animations";
import { MarkerComponent, MarkerSchema } from "../../marker/marker.component";
import { MapHelpers } from "../../../scripts/MapHelpers";
import { SpotPreviewCardComponent } from "../../spot-preview-card/spot-preview-card.component";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import {
  LocalSpotChallenge,
  SpotChallenge,
  SpotChallengePreview,
} from "../../../db/models/SpotChallenge";
import { AnyMedia } from "../../../db/models/Media";

// Import the new marker management system
import {
  MarkerManagerService,
  EnhancedMarkerSchema,
} from "../services/marker-manager.service";
import { MapMarkerRendererComponent } from "../components/map-marker-renderer.component";

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
    MarkerComponent,
    SpotPreviewCardComponent,
    MapMarkerRendererComponent, // Add the new marker renderer
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
  @ViewChild("selectedSpotPolygon", { static: false, read: MapPolygon })
  selectedSpotPolygon: MapPolygon | undefined;

  // Inject the marker manager service
  private markerManager = inject(MarkerManagerService);

  // add math function to markup
  sqrt = Math.sqrt;

  focusZoom = input<number>(17);
  isDebug = input<boolean>(false);
  showSpotPreview = input<boolean>(false);
  isEditing = input<boolean>(false);

  isDarkMode = input<boolean>(true);

  // Remove the old markers input - now handled by marker manager
  // markers: InputSignal<MarkerSchema[]> = input<MarkerSchema[]>([]);

  private _center: google.maps.LatLngLiteral = {
    lat: 48.6270939,
    lng: 2.4305363,
  };
  @Input() set center(coords: google.maps.LatLngLiteral) {
    this._center = coords;
    if (this.googleMap) {
      this.googleMap.panTo(coords);
    }
  }
  @Output() centerChange = new EventEmitter<google.maps.LatLngLiteral>();
  get center(): google.maps.LatLngLiteral {
    return this._center;
  }

  _zoom = signal<number>(4);
  @Input() set zoom(newZoom: number) {
    this._zoom.set(newZoom);
    this.markerManager.setZoom(newZoom); // Update marker manager
    if (this.googleMap) {
      this.googleMap.googleMap?.setZoom(newZoom);
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
    this.markerManager.setZoom(this._zoom()); // Update marker manager
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
  @Output() markerClickEvent = new EventEmitter<{
    marker: EnhancedMarkerSchema;
    index?: number;
  }>();

  @Input() spots: (LocalSpot | Spot)[] = [];
  @Input() dots: SpotClusterDotSchema[] = [];

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
    const zoom = this.googleMap?.getZoom();
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

    if (
      this._previouslyVisibleTiles &&
      this._previouslyVisibleTiles.tiles?.length > 0
    ) {
      if (
        this._previouslyVisibleTiles.zoom === zoom &&
        this._previouslyVisibleTiles.ne.x === neTile.x &&
        this._previouslyVisibleTiles.ne.y === neTile.y &&
        this._previouslyVisibleTiles.sw.x === swTile.x &&
        this._previouslyVisibleTiles.sw.y === swTile.y
      ) {
        return this._previouslyVisibleTiles;
      }
    }

    const tilesObj: TilesObject = {
      zoom: zoom,
      tiles: [],
      ne: neTile,
      sw: swTile,
    };
    for (let x = swTile.x; x <= neTile.x; x++) {
      for (let y = swTile.y; y <= neTile.y; y++) {
        tilesObj.tiles.push({ x, y });
      }
    }

    this._previouslyVisibleTiles = tilesObj;
    this.markerManager.setVisibleTiles(tilesObj); // Update marker manager
    return tilesObj;
  });

  // Get visible markers from the marker manager
  visibleMarkers = this.markerManager.visibleMarkers;

  // Polygon-related signals
  selectedSpotTracker = computed(() => {
    const selectedSpot = this.selectedSpot();
    if (!selectedSpot) return null;

    const id = "id" in selectedSpot ? selectedSpot.id : "local";
    const location = selectedSpot.location();
    return {
      id,
      location: `${location.lat},${location.lng}`,
    };
  });

  selectedSpotKey = computed(() => {
    const selectedSpot = this.selectedSpot();
    if (!selectedSpot) {
      return null;
    }

    const id = "id" in selectedSpot ? selectedSpot.id : "local";
    const location = selectedSpot.location();
    const key = `${id}-${location.lat}-${location.lng}`;

    return key;
  });

  polygonRecreationKey = signal<number>(0);

  constructor(
    private cdr: ChangeDetectorRef,
    public mapsApiService: MapsApiService,
    private _consentService: ConsentService
  ) {
    // Effect to handle selected spot changes and editing state changes for polygon updates
    effect(() => {
      const selectedSpot = this.selectedSpot();
      const isEditing = this.isEditing();

      // Update selected spot marker in marker manager
      this.markerManager.setSelectedSpotMarker(selectedSpot, isEditing);

      this.handleSelectedSpotChange();
    });

    // Effect to update spots as markers
    effect(() => {
      const spots = this.spots;
      this.markerManager.removeMarkersByType("spot");
      this.markerManager.addSpotsAsMarkers(spots);
    });

    // Effect to update cluster dots as markers
    effect(() => {
      const dots = this.dots;
      this.markerManager.removeMarkersByType("spot-cluster");
      this.markerManager.addClusterDotsAsMarkers(dots);
    });

    // Effect to update selected challenge marker
    effect(() => {
      const challenge = this.selectedChallenge;
      const isEditing = this.isEditing();
      this.markerManager.setSelectedChallengeMarker(challenge, isEditing);
    });
  }

  isApiLoadedSubscription: Subscription | null = null;
  consentSubscription: Subscription | null = null;

  ngOnInit() {
    if (this.mapsApiService.isApiLoaded()) {
      this.initMap();
    } else {
      this.tryLoadMapsApi();
    }

    if (this.boundRestriction) {
      // Set restriction bounds
    }
    if (this.minZoom) {
      // Set min zoom
    }
  }

  private tryLoadMapsApi() {
    this.mapsApiService.loadGoogleMapsApi();

    if (this.isApiLoadedSubscription) {
      this.isApiLoadedSubscription.unsubscribe();
    }

    this.isApiLoadedSubscription = this.mapsApiService.isLoading$.subscribe(
      (isLoading) => {
        if (!isLoading && this.mapsApiService.isApiLoaded()) {
          this.initMap();
        }
      }
    );
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes["selectedSpot"]) {
      this.handleSelectedSpotChange();
    }
  }

  private handleSelectedSpotChange() {
    console.log("handleSelectedSpotChange called");

    if (this.isEditing()) {
      this.polygonRecreationKey.update((key) => key + 1);
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    if (this.isApiLoadedSubscription) {
      this.isApiLoadedSubscription.unsubscribe();
    }
    if (this.consentSubscription) {
      this.consentSubscription.unsubscribe();
    }
  }

  initMap(): void {
    // Map initialization logic
  }

  private _geoPointToLatLng(
    geoPoint: GeoPoint
  ): google.maps.LatLngLiteral | null {
    if (!geoPoint) return null;
    return {
      lat: geoPoint.latitude,
      lng: geoPoint.longitude,
    };
  }

  geopointToLatLngLiteral(geoPoint: GeoPoint): google.maps.LatLngLiteral {
    return {
      lat: geoPoint.latitude,
      lng: geoPoint.longitude,
    };
  }

  getBoundsForTile(tile: { zoom: number; x: number; y: number }) {
    return MapHelpers.getBoundsForTile(tile.zoom, tile.x, tile.y);
  }

  initGeolocation() {
    // Geolocation initialization
  }

  useGeolocation() {
    // Geolocation usage
  }

  geolocation = signal<{
    location: google.maps.LatLngLiteral;
    accuracy: number;
  } | null>(null);

  mapOptions: google.maps.MapOptions = {
    mapId: environment.mapId,
    backgroundColor: "#000000",
    clickableIcons: false,
    gestureHandling: "greedy",
    disableDefaultUI: true,
  };

  // Keep existing polygon and circle options
  spotCircleDarkOptions: google.maps.CircleOptions = {
    fillColor: "#b8c4ff",
    strokeColor: "#0036ba",
    strokeOpacity: 0.8,
    fillOpacity: 0.6,
    strokeWeight: 3,
    draggable: false,
    clickable: true,
  };

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

  selectedSpotPolygonEditingOptions: google.maps.PolygonOptions = {
    ...this.spotPolygonDarkOptions,
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

  boundsChanged() {
    if (!this.googleMap?.googleMap) return;

    const bounds = this.googleMap.googleMap.getBounds();
    if (!bounds) return;

    this.boundsToRender.set(bounds);
    this.boundsChange.emit(bounds);
  }

  centerChanged() {
    if (!this.googleMap?.googleMap) return;

    const center = this.googleMap.googleMap.getCenter();
    if (!center) return;

    this._center = center.toJSON();
    this.centerChange.emit(this._center);
  }

  fitBounds(bounds: google.maps.LatLngBounds) {
    if (this.googleMap?.googleMap) {
      this.googleMap.googleMap.fitBounds(bounds);
    }
  }

  editingSpotPositionChanged(position: google.maps.LatLng) {
    const selectedSpot = this.selectedSpot();
    if (selectedSpot) {
      selectedSpot.location.set(position.toJSON());
    }
  }

  editingChallengePositionChanged(position: google.maps.LatLng) {
    if (this.selectedChallenge && this.selectedChallenge.location) {
      this.selectedChallenge.location.set(position.toJSON());
    }
  }

  showSelectedSpotPolygon(): boolean {
    return !!(this.selectedSpot() && this.selectedSpot()?.hasBounds());
  }

  isSelectedSpotBeingEdited(spot: LocalSpot | Spot): boolean {
    const selectedSpot = this.selectedSpot();
    return !!(this.isEditing() && selectedSpot && selectedSpot === spot);
  }

  // Handle marker click events from the new system
  onMarkerClick(event: { marker: EnhancedMarkerSchema; index?: number }) {
    const { marker } = event;

    switch (marker.type) {
      case "spot":
      case "highlighted-spot":
        if (marker.data) {
          this.spotClick.emit(marker.data);
        }
        break;
      case "spot-cluster":
        this.clickDot(marker.data);
        break;
      case "custom":
        this.markerClickEvent.emit(event);
        break;
      default:
        this.markerClickEvent.emit(event);
    }
  }

  // Handle marker drag events
  onMarkerDragEnd(event: {
    marker: EnhancedMarkerSchema;
    position: google.maps.LatLng;
  }) {
    const { marker, position } = event;

    switch (marker.type) {
      case "selected-spot":
        this.editingSpotPositionChanged(position);
        break;
      case "selected-challenge":
        this.editingChallengePositionChanged(position);
        break;
    }
  }

  async getSelectedSpotPolygonPaths(): Promise<
    google.maps.LatLngLiteral[][] | null
  > {
    return this.waitForPolygonAndGetPaths();
  }

  updateSelectedSpotPaths(paths: google.maps.LatLngLiteral[][]) {
    const selectedSpot = this.selectedSpot();
    if (selectedSpot && "id" in selectedSpot) {
      this.polygonChanged.emit({
        spotId: selectedSpot.id,
        path: paths,
      });
    }
  }

  private getPathFromPolygon(
    polygon: google.maps.Polygon
  ): google.maps.LatLngLiteral[][] {
    const paths: google.maps.LatLngLiteral[][] = [];

    const mainPath = polygon.getPath();
    if (mainPath) {
      const coordinates: google.maps.LatLngLiteral[] = [];
      for (let i = 0; i < mainPath.getLength(); i++) {
        const point = mainPath.getAt(i);
        coordinates.push({
          lat: point.lat(),
          lng: point.lng(),
        });
      }
      if (coordinates.length > 0) {
        paths.push(coordinates);
      }
    }

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
      this.spotClick.emit(dot.spot_id);
    } else {
      this.focusOnLocation({
        lat: dot.location.latitude,
        lng: dot.location.longitude,
      });
    }
  }

  focusOnLocation(
    location: google.maps.LatLngLiteral | google.maps.LatLng,
    zoom: number = this.focusZoom()
  ) {
    if (this.googleMap?.googleMap) {
      this.googleMap.googleMap.panTo(location);
      this.setZoom(Math.max(this.zoom, zoom));
    }
  }

  focusOnGeolocation() {
    const geoloc = this.geolocation();
    if (geoloc) {
      this.focusOnLocation(geoloc.location);
    }
  }

  markerClick(markerIndex: number) {
    this.markerClickEvent.emit({
      marker: this.visibleMarkers()[markerIndex],
      index: markerIndex,
    });
  }

  selectedSpotPaths = computed(() => {
    const selectedSpot = this.selectedSpot();
    if (!selectedSpot || !selectedSpot.hasBounds()) {
      return [];
    }
    return selectedSpot.paths || [];
  });

  selectedSpotFirstPath = computed(() => {
    const paths = this.selectedSpotPaths();
    return paths.length > 0 ? paths[0] : [];
  });

  getSelectedSpotPaths(): google.maps.LatLngLiteral[][] {
    return this.selectedSpotPaths();
  }

  ngAfterViewInit() {
    // After view init logic
  }

  async waitForPolygonAndGetPaths(
    maxRetries: number = 10,
    retryDelay: number = 100
  ): Promise<google.maps.LatLngLiteral[][] | null> {
    for (let i = 0; i < maxRetries; i++) {
      if (this.selectedSpotPolygon?.polygon) {
        try {
          return this.getPathFromPolygon(this.selectedSpotPolygon.polygon);
        } catch (error) {
          console.warn(`Attempt ${i + 1} failed to get polygon paths:`, error);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }

    console.warn("Could not get polygon paths after maximum retries");
    return null;
  }

  public refreshPolygonForSelectedSpot() {
    this.polygonRecreationKey.update((key) => key + 1);
    this.cdr.detectChanges();
  }

  public resetPolygonForCurrentSpot() {
    this.refreshPolygonForSelectedSpot();
  }

  forcePolygonRecreation() {
    this.polygonRecreationKey.update((key) => key + 1);
  }

  selectedSpotDebug = computed(() => {
    const spot = this.selectedSpot();
    return spot
      ? {
          id: "id" in spot ? spot.id : "local",
          name: spot.name(),
          location: spot.location(),
        }
      : null;
  });

  polygonTemplateConditions = computed(() => {
    return {
      hasSelectedSpot: !!this.selectedSpot(),
      isEditing: this.isEditing(),
      showPolygon: this.showSelectedSpotPolygon(),
      polygonKey: this.selectedSpotKey(),
      recreationKey: this.polygonRecreationKey(),
    };
  });

  closeSelectedSpot() {
    // Close selected spot logic - this should be handled by parent component
    this.spotClick.emit(null);
  }

  // Public methods for adding different types of markers
  public addCustomMarkers(markers: MarkerSchema[]) {
    this.markerManager.addCustomMarkers(markers);
  }

  public addAmenityMarkers(
    markers: MarkerSchema[],
    type: "amenity-water" | "amenity-toilet"
  ) {
    this.markerManager.addAmenityMarkers(markers, type);
  }

  public clearMarkersOfType(type: string) {
    this.markerManager.removeMarkersByType(type as any);
  }

  public clearAllMarkers() {
    this.markerManager.clearAllMarkers();
  }

  public setGeolocationMarker(location: google.maps.LatLngLiteral | null) {
    this.markerManager.setGeolocationMarker(location);
  }
}
