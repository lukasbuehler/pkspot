import {
  Component,
  ViewChild,
  AfterViewInit,
  OnInit,
  Inject,
  PLATFORM_ID,
  LOCALE_ID,
  OnDestroy,
  signal,
  WritableSignal,
  PendingTasks,
  inject,
  effect,
  computed,
  NgZone,
  ChangeDetectionStrategy,
} from "@angular/core";
import { Location, NgOptimizedImage } from "@angular/common";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotMapDataManager } from "../spot-map/SpotMapDataManager";
import {
  SpotFilterMode,
  getFilterModeFromUrlParam,
} from "../spot-map/spot-filter-config";
import { SpotId } from "../../../db/schemas/SpotSchema";
import {
  ActivatedRoute,
  NavigationStart,
  NavigationEnd,
  Router,
  RouterLink,
} from "@angular/router";
import {
  SpeedDialFabButtonConfig,
  SpeedDialFabComponent,
} from "../speed-dial-fab/speed-dial-fab.component";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MapsApiService } from "../../services/maps-api.service";
import {
  filter,
  firstValueFrom,
  lastValueFrom,
  Subscription,
  take,
} from "rxjs";
import { animate, style, transition, trigger } from "@angular/animations";
import { FormControl, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { SearchService } from "../../services/search.service";
import { SpotMapComponent } from "../spot-map/spot-map.component";
import {
  AsyncPipe,
  isPlatformServer,
  isPlatformBrowser,
  NgComponentOutlet,
  NgTemplateOutlet,
} from "@angular/common";
import { StorageService } from "../../services/firebase/storage.service";
import { GlobalVariables } from "../../../scripts/global";
import { SpotListComponent } from "../spot-list/spot-list.component";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotDetailsComponent } from "../spot-details/spot-details.component";
import { GeolocationService } from "../../services/geolocation.service";
import { CheckInService } from "../../services/check-in.service";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { Title } from "@angular/platform-browser";
import { MatDividerModule } from "@angular/material/divider";
import { LocaleCode, MediaType, SpotSlug } from "../../../db/models/Interfaces";
import { SlugsService } from "../../services/firebase/firestore/slugs.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { MatChipsModule } from "@angular/material/chips";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { SearchFieldComponent } from "../search-field/search-field.component";
import {
  LocalSpotChallenge,
  SpotChallenge,
} from "../../../db/models/SpotChallenge";
import { ChallengeDetailComponent } from "../challenge-detail/challenge-detail.component";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";
import { ChallengeListComponent } from "../challenge-list/challenge-list.component";
import { PrimaryInfoPanelComponent } from "../primary-info-panel/primary-info-panel.component";
import { ConsentService } from "../../services/consent.service";
import { RouteContentData } from "../../resolvers/content.resolver";
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";
import { SpotEditDetailsComponent } from "../spot-edit-details/spot-edit-details.component";
import { Timestamp } from "firebase/firestore";
import { SpotEdit } from "../../../db/models/SpotEdit";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { MatSidenavModule } from "@angular/material/sidenav";
import { ResponsiveService } from "../../services/responsive.service";
import { BottomSheetComponent } from "../bottom-sheet/bottom-sheet.component";
import { StructuredDataService } from "../../services/structured-data.service";
import { MatCardModule } from "@angular/material/card";
import { MatDialog } from "@angular/material/dialog";
import { FilterChipsBarComponent } from "../filter-chips-bar/filter-chips-bar.component";
import { MarkerSchema } from "../marker/marker.component";
import {
  CustomFilterDialogComponent,
  CustomFilterParams,
} from "../custom-filter-dialog/custom-filter-dialog.component";
import { BackHandlingService } from "../../services/back-handling.service";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { AppSettingsService } from "../../services/app-settings.service";
import { environment } from "../../../environments/environment";

import { PoiData } from "../../../db/models/PoiData";
import { PoiDetailComponent } from "../poi-detail/poi-detail.component";
import { AmenityNames, AmenitiesMap } from "../../../db/models/Amenities";

@Component({
  selector: "app-map-page",
  templateUrl: "./map-page.component.html",
  styleUrls: ["./map-page.component.scss"],
  animations: [
    trigger("fadeInOut", [
      transition(":enter", [
        style({ opacity: 0, scale: 1 }),
        animate("0.3s ease-out", style({ opacity: 1, scale: 1 })),
      ]),
      transition(":leave", [
        style({ opacity: 1, scale: 1 }),
        animate("0.3s ease-in", style({ opacity: 0, scale: 1 })),
      ]),
    ]),
    trigger("slideInOut", [
      transition(":enter", [
        style({ opacity: 0, scale: 1, translate: "100%" }),
        animate(
          "0.3s ease-in-out",
          style({ opacity: 1, scale: 1, translate: "0px" })
        ),
      ]),
      transition(":leave", [
        style({ opacity: 1, scale: 1, translate: "0px" }),
        animate(
          "0.3s ease-in-out",
          style({ opacity: 0, scale: 1, translate: "100%" })
        ),
      ]),
    ]),
  ],
  imports: [
    SpotMapComponent,
    MatButtonModule,
    MatIconModule,
    FormsModule,
    MatChipsModule,
    ReactiveFormsModule,
    SpotDetailsComponent,
    SpotListComponent,
    MatDividerModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    PoiDetailComponent,
    SearchFieldComponent,
    ChallengeDetailComponent,
    // SpeedDialFabComponent,
    RouterLink,
    ChallengeListComponent,
    // PrimaryInfoPanelComponent,
    AsyncPipe,
    SpotEditDetailsComponent,
    MatSidenavModule,
    NgTemplateOutlet,
    BottomSheetComponent,
    MatCardModule,
    FilterChipsBarComponent,
    NgOptimizedImage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("spotMap", { static: false }) spotMap: SpotMapComponent | null =
    null;
  @ViewChild(BottomSheetComponent) bottomSheet?: BottomSheetComponent;

  /** Signal to track when the map is ready for interaction */
  mapReady = signal<boolean>(false);

  pendingTasks = inject(PendingTasks);
  responsiveService = inject(ResponsiveService);
  private ngZone = inject(NgZone);
  private _structuredDataService = inject(StructuredDataService);
  private _backHandlingService = inject(BackHandlingService);

  searchResultSpots: WritableSignal<Spot[]> = signal([]);
  selectedSpot: WritableSignal<Spot | LocalSpot | null> = signal(null);
  selectedPoi = signal<PoiData | null>(null);
  selectedSpotIdOrSlug: WritableSignal<SpotId | string | null> = signal(null);
  showAllChallenges: WritableSignal<boolean> = signal(false);
  allSpotChallenges: WritableSignal<SpotChallenge[]> = signal([]);
  showSpotEditHistory: WritableSignal<boolean> = signal(false);

  isEditing: WritableSignal<boolean> = signal(false);
  mapStyle: "roadmap" | "satellite" | "hybrid" | "terrain" | null = null;
  selectedChallenge: WritableSignal<SpotChallenge | LocalSpotChallenge | null> =
    signal(null);

  geolocationService = inject(GeolocationService);
  checkInService = inject(CheckInService);
  readonly checkInEnabled = environment.features.checkIns;

  geolocationIcon = computed(() => {
    if (this.geolocationService.error()) return "location_disabled";
    if (this.geolocationService.currentLocation()) return "my_location";
    return "location_searching";
  });

  visibleSpots: Spot[] = [];
  private _highlightedSpots: SpotPreviewData[] = [];

  /**
   * Highlighted spots shown on the map. Setting this also updates
   * structured data for SEO.
   */
  get highlightedSpots(): SpotPreviewData[] {
    return this._highlightedSpots;
  }
  set highlightedSpots(spots: SpotPreviewData[]) {
    this._highlightedSpots = spots;
    this._updateHighlightedSpotsStructuredData(spots);
  }

  alainMode: boolean = false;

  isServer: boolean;

  showAmenities = signal<boolean>(true);
  bottomSheetOpen = signal<boolean>(false);
  bottomSheetProgress = signal<number>(0);

  // Start closed to prevent flash - will open when desktop is confirmed
  sidenavOpen = signal<boolean>(false);
  sidebarContentIsScrolling = signal<boolean>(false);

  // Height of the top spacer in the sidebar/bottom-sheet to match chip listbox
  // Default to expected fallback (32 chip + 100 padding)
  chipsSpacerHeight = signal<number>(132);

  spotListLimit = computed(() => {
    // If mobile and bottom sheet is "closed" (progress < 0.2), limit the list
    if (this.responsiveService.isMobile() && this.bottomSheetProgress() <= 0) {
      return 2;
    }
    return undefined;
  });

  // ResizeObserver for chips height measurement
  private _chipsResizeObserver: ResizeObserver | null = null;
  private _chipsUpdateRaf: number | null = null;
  // Direct immediate measure helper (bypasses RAF coalescing)
  private _chipsDirectMeasure: (() => void) | null = null;
  private _chipsWindowResizeListener: (() => void) | null = null;
  // Last measured width of the chips container — used to avoid re-measuring when width didn't change
  private _lastMeasuredWidth: number | null = null;
  // Last applied final height to avoid redundant updates across callbacks
  private _lastFinalHeight = this.chipsSpacerHeight();

  // References and listeners for sidebar/bottom-sheet scrolling
  private _sidebarScrollEl?: HTMLElement | null;
  private _sidebarScrollListener?: (e: Event) => void;
  private _bottomSheetContentEl?: HTMLElement | null;
  private _bottomSheetContentListener?: (e: Event) => void;

  filterCtrl = new FormControl<string[]>([], { nonNullable: true });
  selectedFilters = signal<string[]>([]);

  /**
   * Tracks the currently selected filter chip for URL sync.
   */
  selectedFilter = signal<string>("");

  /**
   * Effect to apply filter when map becomes available or filter changes.
   * This handles the initial load race condition where filter param exists but map isn't ready.
   */
  filterEffect = effect(() => {
    const filter = this.selectedFilter();
    const isMapReady = this.mapReady();

    console.debug("filterEffect running:", {
      filter,
      isMapReady,
      hasSpotMap: !!this.spotMap,
    });

    // Only proceed if we have a map instance that's ready
    if (isMapReady && this.spotMap) {
      // filterChipChanged handles both cases: bounds available (immediate search)
      // and bounds not available (sets filter mode, waits for filterBoundsChange event)
      console.debug("filterEffect: calling filterChipChanged with:", filter);
      setTimeout(() => this.filterChipChanged(filter), 0);
    }
  });

  toggleSidenav() {
    this.sidenavOpen.update((open) => !open);
  }

  private _alainModeSubscription?: Subscription;
  private _routerSubscription?: Subscription;
  private _breakpointSubscription?: Subscription;
  private _consentSubscription?: Subscription;

  spotEdits: WritableSignal<SpotEdit[]> = signal([]);

  noSpotsForFilter: WritableSignal<boolean> = signal(false);

  /** Stores custom filter parameters when using the Filters dialog */
  customFilterParams: WritableSignal<CustomFilterParams | null> = signal(null);

  /** MatDialog for opening the custom filter dialog */
  private _dialog = inject(MatDialog);

  /**
   * Handle clicks on POIs or Amenity Markers
   */
  /**
   * Handle clicks on POIs or Amenity Markers
   */
  async onPoiClick(event: {
    location: google.maps.LatLngLiteral;
    placeId: string;
  }) {
    this.ngZone.run(async () => {
      console.log("POI Clicked", event);

      // Set a placeholder POI to prevent the spot list from showing up
      // during the transition (template logic: if selectedPoi -> show POI, else if selectedSpot -> show Spot, else -> show List)
      this.selectedPoi.set({
        type: "google-poi",
        id: event.placeId,
        name: "Loading...",
        location: event.location,
        googlePlace: undefined,
      });

      // Clear spot selection manually (don't use closeSpot() as it clears selectedPoi)
      this.selectedSpot.set(null);
      this.showSpotEditHistory.set(false);
      this.closeChallenge(false);
      this.updateMapURL();

      if (event.placeId) {
        // It's a Google Maps POI
        try {
          // Fetch details to get the name
          const place = await this.mapsService.getGooglePlaceById(
            event.placeId
          );

          this.selectedPoi.set({
            type: "google-poi",
            id: event.placeId,
            name: place.displayName || "Point of Interest",
            location: place.location?.toJSON() || event.location,
            googlePlace: place,
          });

          // Focus the map on it
          if (this.spotMap) {
            this.spotMap.focusPoint(this.selectedPoi()!.location);
          }
        } catch (error) {
          console.error("Failed to load POI details:", error);
        }
      }
    });
  }

  // Handle click on map background (bubbled up from SpotMap)
  onMapClick(event: google.maps.LatLngLiteral) {
    this.ngZone.run(() => {
      // Clear spot selection
      if (this.selectedSpot()) {
        this.selectedSpot.set(null);
      }

      // Clear POI selection
      if (this.selectedPoi()) {
        this.selectedPoi.set(null);
        // also clear the placeholder if it was just loading
      }

      this.showSpotEditHistory.set(false);
      this.closeChallenge(false);

      // Update URL to remove selected spot/poi
      this.updateMapURL();
    });
  }

  // Handle clicks on custom amenity markers (bubbled up from SpotMap via markerClickEvent)
  onAmenityClick(event: number | { marker: any; index?: number }) {
    this.ngZone.run(() => {
      let markerIndex: number | undefined;

      if (typeof event === "number") {
        markerIndex = event;
      } else {
        markerIndex = event.index;
      }

      if (markerIndex === undefined) return;

      // Access spotMapData from the child component
      const markers = this.spotMap?.spotMapData?.visibleAmenityMarkers();

      if (markers && markers[markerIndex]) {
        const marker = markers[markerIndex];

        let displayname: string = marker.name || "Amenity";
        if (displayname === "Amenity" || displayname === "undefined") {
          // Try to look up a friendly name based on the icon/type if available
          const nameFromType = marker.type
            ? AmenityNames[marker.type as keyof AmenitiesMap]
            : undefined;
          if (nameFromType) {
            displayname = nameFromType;
          } else {
            displayname = "Amenity";
          }
        }

        this.selectedPoi.set({
          type: "amenity",
          id: `amenity-${marker.location.lat}-${marker.location.lng}`,
          name: displayname,
          location: marker.location,
          marker: marker,
        });

        // Clear spot selection manually (don't use closeSpot() as it clears selectedPoi)
        this.selectedSpot.set(null);
        this.showSpotEditHistory.set(false);
        this.closeChallenge(false);
        this.updateMapURL();

        if (this.spotMap) {
          this.spotMap.focusPoint(marker.location);
        }
      }
    });
  }

  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    @Inject(PLATFORM_ID) private platformId: Object,
    public activatedRoute: ActivatedRoute,
    public authService: AuthenticationService,
    public mapsService: MapsApiService,
    public storageService: StorageService,
    private metaTagService: MetaTagService,
    private _spotsService: SpotsService,
    private _challengesService: SpotChallengesService,
    private _searchService: SearchService,
    private _slugsService: SlugsService,
    public router: Router,
    private _location: Location,
    private _snackbar: MatSnackBar,
    private titleService: Title,
    private _consentService: ConsentService,
    private breakpointObserver: BreakpointObserver,
    private _spotEditsService: SpotEditsService,
    public appSettings: AppSettingsService
  ) {
    this._alainModeSubscription = GlobalVariables.alainMode.subscribe(
      (value) => {
        this.alainMode = value;
      }
    );

    this.isServer = isPlatformServer(platformId);

    effect(() => {
      // Read all relevant routing state signals so URL stays in sync
      this.selectedSpot();
      this.selectedChallenge();
      this.showAllChallenges();
      this.showSpotEditHistory();
      this.selectedFilter(); // Include filter in URL sync

      this.updateMapURL();
    });

    effect(() => {
      const showChallenges = this.showAllChallenges();
      const spot = this.selectedSpot();

      if (spot && showChallenges && spot instanceof Spot) {
        this._challengesService
          .getAllChallengesForSpot(spot)
          .then((challenges) => {
            this.allSpotChallenges.set(challenges);
            console.log("setting all challenges", challenges);
          });
      } else {
        this.allSpotChallenges.set([]);
        console.debug("clearing all challenges");
      }
    });

    effect(() => {
      const spot = this.selectedSpot();

      if (spot instanceof Spot) {
        this.selectedSpotIdOrSlug.set(spot.slug ?? spot.id);
      } else {
        this.selectedSpotIdOrSlug.set("");
      }
    });

    // Effect to update meta tags when spot/challenge changes (for client-side navigation)
    effect(() => {
      const spot = this.selectedSpot();
      const challenge = this.selectedChallenge();

      if (challenge && challenge instanceof SpotChallenge) {
        this.metaTagService.setChallengeMetaTags(challenge);
      } else if (spot) {
        this.metaTagService.setSpotMetaTags(spot);
      } else {
        this.metaTagService.setDefaultMapMetaTags();
      }
    });

    // Effect to load spot edits when showSpotEditHistory changes
    effect((onCleanup) => {
      const showEditHistory = this.showSpotEditHistory();
      const spot = this.selectedSpot();

      if (showEditHistory && spot instanceof Spot) {
        // Load edits for this spot
        const spotEditsSub = this._spotEditsService
          .getSpotEditsBySpotId$(spot.id)
          .subscribe({
            next: (editsWithIds) => {
              // Convert to SpotEdit instances with proper IDs
              let spotEdits = editsWithIds.map(
                (item) => new SpotEdit(item.id, item.schema)
              );
              // Sort by timestamp descending (newest first)
              spotEdits.sort((a, b) => {
                const timeA =
                  a.timestamp instanceof Timestamp
                    ? a.timestamp.toMillis()
                    : typeof a.timestamp_raw_ms === "number"
                    ? a.timestamp_raw_ms
                    : 0;
                const timeB =
                  b.timestamp instanceof Timestamp
                    ? b.timestamp.toMillis()
                    : typeof b.timestamp_raw_ms === "number"
                    ? b.timestamp_raw_ms
                    : 0;
                return timeB - timeA;
              });
              this.spotEdits.set(spotEdits);
              console.log("Loaded spot edits:", spotEdits);
            },
            error: (err) => {
              console.error("Error loading spot edits:", err);
              this.spotEdits.set([]);
            },
          });

        onCleanup(() => {
          spotEditsSub.unsubscribe();
        });
      } else {
        // Clear edits if not showing edit history
        this.spotEdits.set([]);
      }
    });

    // Open sidenav by default on desktop once responsive detection is confirmed
    effect(() => {
      const isInitialized = this.responsiveService.isInitialized();
      const isNotMobile = this.responsiveService.isNotMobile();
      if (isInitialized && isNotMobile) {
        this.sidenavOpen.set(true);
      }
    });

    // Effect to peek bottom sheet when proximity spot is detected
    effect(() => {
      const spot = this.checkInService.currentProximitySpot();
      const isMobile = this.responsiveService.isMobile();
      const isSheetOpen = this.bottomSheetOpen();
      const progress = this.bottomSheetProgress();

      // If we have a spot, we are on mobile, and the sheet is fully closed (progress <= 0),
      // we don't necessarily need to "open" it (maximize), but we should ensure the user knows it's there.
      // The bottom sheet by default "peeks" at closedHeight.
      // So if content is added to sidebarContent, it should be visible in the peek area.
      // We might want to ensure we don't accidentally hide it if we have logic that hides the sheet?
      // But currently the sheet is always present.
      // We could optionally bounce it or something, but just showing the content is a good start.

      // If the user is on the map and a spot is detected, maybe we want to make sure the bottom sheet isn't obscured?
      // But standard behavior is enough.

      // Optional: If we want to force open it slightly more or something?
      // For now, let's rely on the template update.
    });
  }

  /**
   * Get a nice display text for the source field
   */
  getSourceDisplayText(source: string | undefined): string {
    const earlyPKSpotSource = $localize`:@@map.spot.source.earlyPKSpot:Early PK Spot Community Contribution`;
    if (!source) {
      return earlyPKSpotSource;
    }

    // Map specific sources to nice display names
    const sourceMap: Record<string, string> = {
      "horizn-app": "Horizn Community",
      pkspot: "PK Spot Community",
    };

    return sourceMap[source] || source;
  }

  spotSourceDisplayText = computed(() => {
    const spot = this.selectedSpot();
    if (!spot) return "";
    return this.getSourceDisplayText(spot.source());
  });

  // Speed dial FAB //////////////////////////////////////////////////////////

  speedDialButtonConfig: SpeedDialFabButtonConfig = {
    mainButton: {
      icon: "add_location",
      tooltip: $localize`:Tooltip for add spot button|Add a new spot@@map.add_spot.tooltip:Add a new spot`,
      color: "primary",
      label: $localize`:@@pk.spotmap.addSpot:Add spot`,
      isExtended: false,
    },
    miniButtonColor: "primary",
    miniButtons: [
      {
        icon: "outlined_flag",
        tooltip: $localize`:Tooltip for add challenge button|Add a challenge@@map.add_challenge.tooltip:Add a challenge`,
      },
      {
        icon: "note_add",
        tooltip: $localize`:Tooltip for import spots button|Import spots from a file@@map.import_spots.tooltip:Import spots from a file`,
      },
    ],
  };

  setVisibleSpots(spots: Spot[]) {
    if (!spots || spots.length === 0) {
      this.visibleSpots = [];
      return;
    }

    this.visibleSpots = spots;
  }

  speedDialMiniFabClick(index: number) {
    switch (index) {
      case 0:
        this.router.navigateByUrl("/kml-import");
        break;
      default:
        console.error("Uncaught fab click registered");
        break;
    }
  }

  // Initialization ///////////////////////////////////////////////////////////

  ngOnInit() {
    console.debug("map page init");

    // Trigger Google Maps API loading since this page needs it
    // this.tryLoadMapsApi(); // TODO wtf

    if (this.checkInEnabled) {
      this.checkInService.showGlobalChip.set(false);
    }

    // Listen for consent changes to retry Maps API loading when consent is granted
    this._consentSubscription = this._consentService.consentGranted$.subscribe(
      (hasConsent) => {
        if (hasConsent && !this.mapsService.isApiLoaded()) {
          this.tryLoadMapsApi();
        }
      }
    );

    // Check if we have resolved data from the resolver
    const contentData = this.activatedRoute.snapshot.data?.["content"] as
      | RouteContentData
      | undefined;

    if (contentData?.spot) {
      // console.debug("Using resolved spot data for SSR", contentData.spot.name());
      this.selectedSpot.set(contentData.spot);
    }

    if (contentData?.challenge) {
      // console.debug(
      //   "Using resolved challenge data for SSR",
      //   contentData.challenge.name()
      // );
      this.selectedChallenge.set(contentData.challenge);
    }

    // Parse URL to handle the edits route correctly since Angular router
    // might interpret /map/:spot/edits as /map/:spot where :spot="edits"
    const urlParts = this.router.url.split("/").filter((segment) => segment);
    // urlParts will be like ['map', 'spotId', 'edits'] or ['map', 'spotId', 'c', 'challengeId']

    let spotIdOrSlug: string | null = null;
    let showChallenges = false;
    let challengeId: string | null = null;
    let showEditHistory = false;

    if (urlParts.length >= 2 && urlParts[0] === "map") {
      // Decode and strip any potential query parameters from the spot ID segment
      const potentialSpot = decodeURIComponent(urlParts[1]).split("?")[0];

      if (urlParts.length === 2) {
        // /map/:spot
        spotIdOrSlug = potentialSpot;
      } else if (urlParts.length >= 3) {
        const nextSegment = urlParts[2].split("?")[0];

        if (nextSegment === "c") {
          // /map/:spot/c or /map/:spot/c/:challenge
          spotIdOrSlug = potentialSpot;
          showChallenges = true;
          if (urlParts.length >= 4) {
            challengeId = decodeURIComponent(urlParts[3].split("?")[0]);
          }
        } else if (nextSegment === "edits") {
          // /map/:spot/edits
          spotIdOrSlug = potentialSpot;
          showEditHistory = true;
        } else {
          // Might be /map/:spot where :spot is actually a multi-part ID like "edits"
          // Check if the potential spot looks like a real spot ID (not a known reserved word)
          spotIdOrSlug = potentialSpot;
        }
      }
    }

    console.debug("DEBUG ngOnInit URL parsing:", {
      url: this.router.url,
      urlParts,
      spotIdOrSlug,
      showChallenges,
      challengeId,
      showEditHistory,
    });

    this.pendingTasks.run(async () => {
      this._handleURLParamsChange(
        spotIdOrSlug,
        showChallenges,
        challengeId,
        showEditHistory,
        contentData?.spot || null,
        contentData?.challenge || null
      );
    });

    // Read filter from URL query params and apply if present
    // Read filter from URL query params and set signal
    const filterParam =
      this.activatedRoute.snapshot.queryParamMap.get("filter");
    if (filterParam) {
      this.selectedFilter.set(filterParam);
    }

    // Register back button handler
    this._backHandlingService.addListener(10, this.handleBackPress);
  }

  async _getSpotIdFromSlugOrId(spotIdOrSlug: string): Promise<SpotId | null> {
    const selectedSpot = this.selectedSpot();

    if (
      selectedSpot &&
      selectedSpot instanceof Spot &&
      spotIdOrSlug === (selectedSpot.slug ?? selectedSpot.id)
    ) {
      // don't emit anything if it's already selected
      return null;
    }

    if (spotIdOrSlug) {
      return this._slugsService
        .getSpotIdFromSpotSlugHttp(spotIdOrSlug)
        .catch(() => spotIdOrSlug as SpotId);
    } else {
      // don't emit anything if no spot is provided
      return null;
    }
  }

  ngAfterViewInit() {
    // The spotMap is inside a @defer block, so it won't be available immediately.
    // Only poll for spotMap in the browser (not during SSR).
    if (isPlatformBrowser(this.platformId)) {
      const checkSpotMapAvailable = () => {
        if (this.spotMap) {
          console.debug("spotMap is now available, setting mapReady");
          this.mapReady.set(true);
        } else {
          // Keep polling every 50ms until spotMap is available
          setTimeout(checkSpotMapAvailable, 50);
        }
      };
      checkSpotMapAvailable();
    }

    if (isPlatformBrowser(this.platformId)) {
      this._routerSubscription = this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe((event) => {
          const navEvent = event as NavigationEnd;
          // Only handle navigation events that are for the map page
          if (!navEvent.urlAfterRedirects.startsWith("/map")) {
            // Navigating away from map, do not interfere
            return;
          }
          const match = navEvent.urlAfterRedirects.match(
            /^\/map(?:\/([^\/?]+))?(?:\/(c)(?:\/([^\/]+))?)?(\/(edits)(?:\/)?)?/
          );
          const spotIdOrSlug = match?.[1] ?? null;
          const showChallenges = !!match?.[2];
          const challengeId = match?.[3] ?? null;
          const showEditHistory = !!match?.[4];

          // Also extract filter query param from URL to keep it in sync
          const queryIndex = navEvent.urlAfterRedirects.indexOf("?");
          if (queryIndex >= 0) {
            const queryString = navEvent.urlAfterRedirects.substring(
              queryIndex + 1
            );
            const params = new URLSearchParams(queryString);
            const filterParam = params.get("filter");
            if (filterParam && this.selectedFilter() !== filterParam) {
              this.selectedFilter.set(filterParam);
            }
          }

          this._handleURLParamsChange(
            spotIdOrSlug,
            showChallenges,
            challengeId,
            showEditHistory
          );
        });

      // Setup scroll listeners for the sidebar (desktop) and bottom-sheet (mobile)
      try {
        this._attachSidebarScrollListeners();

        // Measure the chip listbox height and keep the top spacer in sync
        try {
          // Move logic into a reusable method so we can re-run it on breakpoint changes
          this._attachChipsMeasurement();

          // Trigger an immediate measurement now that the view is initialized.
          // Call the installed window-resize listener (it schedules a measurement).
          try {
            // Wait for Angular to stabilize so projected/async chip elements are present
            try {
              this.ngZone.onStable.pipe(take(1)).subscribe(() => {
                try {
                  if (!this._chipsWindowResizeListener) {
                    // In case the listener wasn't installed, re-run attachment once more
                    this._attachChipsMeasurement();
                  }
                  // Run the usual scheduled measurement and also a direct immediate measure
                  this._chipsWindowResizeListener?.();
                  this._chipsDirectMeasure?.();
                } catch (e) {
                  /* ignore */
                }
              });
            } catch (e) {
              // Fallback to setTimeout if onStable isn't available for some reason
              setTimeout(() => {
                try {
                  if (this._chipsWindowResizeListener)
                    this._chipsWindowResizeListener();
                } catch (e) {
                  /* ignore */
                }
              }, 50);
            }
          } catch (e) {
            /* ignore */
          }

          // Measurement attached once on view init. We do not re-attach
          // repeatedly from a reactive effect to avoid periodic re-runs.
        } catch (e) {
          console.warn("Could not attach chips measurement:", e);
        }
        // React to breakpoint/layout changes and re-attach measurement
        try {
          this._breakpointSubscription = this.breakpointObserver
            .observe([Breakpoints.Handset, Breakpoints.Tablet, Breakpoints.Web])
            .subscribe(() => {
              try {
                this._attachChipsMeasurement();
                this._attachSidebarScrollListeners();
              } catch (e) {
                /* ignore */
              }
            });
        } catch (e) {
          /* ignore */
        }
      } catch (e) {
        console.warn("Could not attach sidebar scroll listeners:", e);
      }
    }
  }

  _handleURLParamsChange(
    spotIdOrSlug: string | null,
    showChallenges: boolean,
    challengeId: string | null,
    showEditHistory: boolean,
    resolvedSpot: Spot | null = null,
    resolvedChallenge: SpotChallenge | null = null
  ) {
    if (challengeId && spotIdOrSlug) {
      // open the spot on a challenge
      if (resolvedChallenge) {
        this.selectChallenge(resolvedChallenge, false);
      } else {
        const selectedSpot = this.selectedSpot();
        if (selectedSpot && selectedSpot instanceof Spot) {
          this.loadChallengeById(selectedSpot, challengeId, false).then(
            () => {}
          );
        } else if (!selectedSpot) {
          // load the spot by id then the challenge
        } else {
          // the spot is a local spot
          console.error(
            "Cannot open a challenge of a local spot, it should not have one!"
          );
        }
      }
    } else if (spotIdOrSlug) {
      if (this.selectedChallenge()) this.closeChallenge();
      this.showAllChallenges.set(showChallenges);
      this.showSpotEditHistory.set(showEditHistory);

      // If we already have the resolved spot, use it
      if (resolvedSpot && this.selectedSpot() !== resolvedSpot) {
        this.selectSpot(resolvedSpot, false);
      } else if (this.selectedSpotIdOrSlug() !== spotIdOrSlug) {
        this._getSpotIdFromSlugOrId(spotIdOrSlug).then((spotId) => {
          if (!spotId) {
            console.warn("Could not get spot id from slug or id.");
            return;
          }

          // open the spot
          this.loadSpotById(spotId as SpotId, false).then(() => {});
        });
      }
    } else {
      // close the spot
      this.closeSpot(false);
      this.showAllChallenges.set(false);
    }
  }

  openSpotOrGooglePlace(value: { type: "place" | "spot"; id: string }) {
    if (value.type === "place") {
      this.openGooglePlaceById(value.id);
    } else {
      this.loadSpotById(value.id as SpotId).then(() => {});
    }
  }

  openGooglePlaceById(id: string) {
    console.debug("[DEBUG openGooglePlaceById] Opening place with id:", id);
    this.mapsService
      .getGooglePlaceById(id)
      .then((place) => {
        console.debug("[DEBUG openGooglePlaceById] Got place:", place);
        if (!place?.location) {
          console.warn("[WARN openGooglePlaceById] No location found");
          return;
        }

        // Try to use viewport bounds if available (preferred for proper framing)
        const viewport = (place as any).viewport as
          | google.maps.LatLngBounds
          | undefined;
        if (viewport) {
          console.debug(
            "[DEBUG openGooglePlaceById] Using viewport bounds for place"
          );
          this.spotMap?.focusBounds(viewport);
          return;
        }

        // Fallback: Calculate appropriate zoom based on place type
        const zoomLevel = this.mapsService.getZoomForPlaceType(place);
        console.debug(
          "[DEBUG openGooglePlaceById] Calculated zoom level:",
          zoomLevel
        );

        // Convert LatLng to LatLngLiteral - location is a LatLng object with functions
        const lat = (place.location as any).lat();
        const lng = (place.location as any).lng();
        const locationLiteral: google.maps.LatLngLiteral = { lat, lng };
        console.debug(
          "[DEBUG openGooglePlaceById] Location literal:",
          locationLiteral
        );
        console.debug("[DEBUG openGooglePlaceById] spotMap:", this.spotMap);
        this.spotMap?.focusPoint(locationLiteral, zoomLevel);
      })
      .catch((err) => {
        console.error("[ERROR openGooglePlaceById] Error fetching place:", err);
      });
  }

  async loadSpotById(spotId: SpotId, updateUrl: boolean = true): Promise<Spot> {
    console.debug("loading spot by id", spotId);

    // Retry loading the spot if it's not yet populated by the cloud function
    let lastError: any;
    const maxAttempts = 15;
    const delayMs = 200;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const spot: Spot = await this._spotsService.getSpotByIdHttp(
          spotId,
          this.locale
        );
        this.selectSpot(spot, updateUrl);
        return spot;
      } catch (error) {
        lastError = error;
        console.debug(
          `Attempt ${
            attempt + 1
          }/${maxAttempts} to load spot failed, retrying...`,
          error
        );

        // Wait before next attempt
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // All attempts failed
    console.error("Failed to load spot after retries:", lastError);
    throw lastError;
  }

  async loadChallengeById(
    spot: Spot,
    challengeId: string,
    updateUrl: boolean = true
  ): Promise<SpotChallenge> {
    console.debug("loading challenge by id", challengeId);

    const challenge: SpotChallenge =
      await this._challengesService.getSpotChallenge(spot, challengeId);

    this.selectChallenge(challenge, updateUrl);

    return challenge;
  }

  /**
   * Tracks the currently active filter type for re-searching on pan.
   */
  private _activeFilter: string = "";

  /**
   * Pending filter to apply when bounds become available (for URL-based filter on page load).
   */
  private _pendingFilter: string | null = null;

  /**
   * Handle filter bounds change - re-run the filter search for the new bounds.
   */
  onFilterBoundsChange(bounds: google.maps.LatLngBounds): void {
    if (!this._activeFilter || !this.spotMap) return;

    // Handle custom filter mode with stored params
    if (this._activeFilter === "custom") {
      const customParams = this.customFilterParams();
      if (!customParams) return;

      this._searchService
        .searchSpotsWithCustomFilter(bounds, customParams)
        .then((result) => {
          const previews: SpotPreviewData[] = (result.hits || [])
            .filter((h: any) => !!h)
            .map((hit: any) => this._searchService.getSpotPreviewFromHit(hit));

          this.spotMap?.setFilteredSpots(previews);
        })
        .catch((err) => {
          console.error(
            "Error re-searching custom filter on bounds change:",
            err
          );
        });
      return;
    }

    // Handle preset filter modes
    const filterMode = getFilterModeFromUrlParam(this._activeFilter);
    if (filterMode === SpotFilterMode.None) return;

    this._searchService
      .searchSpotsInBoundsWithFilter(bounds, filterMode)
      .then((result) => {
        const previews: SpotPreviewData[] = (result.hits || [])
          .filter((h: any) => !!h)
          .map((hit: any) => this._searchService.getSpotPreviewFromHit(hit));

        this.spotMap?.setFilteredSpots(previews);
      })
      .catch((err) => {
        console.error("Error re-searching for filter on bounds change:", err);
      });
  }

  filterChipChanged(selectedChip: string) {
    // Update the selectedFilter signal for URL sync and chip binding
    // Only update signal if it's different to avoid infinite effect loops
    if (this.selectedFilter() !== (selectedChip || "")) {
      this.selectedFilter.set(selectedChip || "");
    }

    if (!selectedChip || selectedChip.length === 0) {
      this._activeFilter = "";
      this._pendingFilter = null;
      this.highlightedSpots = [];
      this.visibleSpots = [];
      // Clear custom filter when clearing all filters
      this.customFilterParams.set(null);
      if (this.spotMap) {
        // Clear filter mode using the signal - this triggers sync effect in SpotMapComponent
        this.spotMap.spotFilterMode.set(SpotFilterMode.None);
      }
      return;
    }

    // Track the active filter for re-searching on pan
    this._activeFilter = selectedChip;

    // Clear custom filter when selecting a preset chip
    if (selectedChip !== "custom") {
      this.customFilterParams.set(null);
    }

    // Convert URL param to filter mode using the centralized config
    const filterMode = getFilterModeFromUrlParam(selectedChip);

    // Handle special cases that don't have search implementations yet
    if (selectedChip === "saved" || selectedChip === "visited") {
      // TODO: Implement saved/visited filter
      return;
    }

    if (filterMode === SpotFilterMode.None) {
      console.warn("Unknown filter chip:", selectedChip);
      return;
    }

    // Set filter mode on spotMap FIRST - this ensures filterBoundsChange will fire
    // when bounds become available
    if (this.spotMap) {
      this.spotMap.spotFilterMode.set(filterMode);
    }

    const bounds = this.spotMap?.bounds;
    if (!bounds) {
      // Bounds not available yet - the search will be triggered by onFilterBoundsChange
      // when the map emits its first bounds
      console.debug("Filter set, waiting for bounds to become available...");
      return;
    }

    if (this.selectedSpot()) {
      this.selectedSpot.set(null);
    }

    // Generic filter search
    console.log(`Searching for ${selectedChip} spots in bounds:`, bounds);

    this._searchService
      .searchSpotsInBoundsWithFilter(bounds, filterMode)
      .then((result) => {
        const hits = result.hits || [];
        console.log(`Found ${selectedChip} spots:`, hits);

        const previews: SpotPreviewData[] = hits
          .filter((h: any) => !!h)
          .map((hit: any) => this._searchService.getSpotPreviewFromHit(hit));

        if (this.spotMap) {
          this.spotMap.setFilteredSpots(previews);
        }
      })
      .catch((err) => {
        console.error(`Error searching for ${selectedChip} spots:`, err);
      });
  }

  /**
   * Opens the custom filter dialog and applies the selected filters.
   */
  openCustomFilterDialog(): void {
    const dialogRef = this._dialog.open(CustomFilterDialogComponent, {
      width: "400px",
      maxWidth: "90vw",
      maxHeight: "90vh",
      data: { currentParams: this.customFilterParams() },
    });

    dialogRef.afterClosed().subscribe((result: CustomFilterParams | null) => {
      if (!result) {
        // User cancelled - do nothing
        return;
      }

      // Check if result has any selections
      const hasFilters =
        (result.types?.length ?? 0) > 0 ||
        (result.accesses?.length ?? 0) > 0 ||
        (result.amenities_true?.length ?? 0) > 0 ||
        (result.amenities_false?.length ?? 0) > 0;

      if (!hasFilters) {
        // Clear custom filter and reset to no filter
        this.customFilterParams.set(null);
        this.filterChipChanged("");
        return;
      }

      // Store the custom filter params
      this.customFilterParams.set(result);

      // Update the selected filter to custom mode
      this.selectedFilter.set("custom");
      this._activeFilter = "custom";

      // Set filter mode on spotMap
      if (this.spotMap) {
        this.spotMap.spotFilterMode.set(SpotFilterMode.Custom);
      }

      // Run the search with custom params
      const bounds = this.spotMap?.bounds;
      if (!bounds) {
        console.debug("Custom filter set, waiting for bounds...");
        return;
      }

      if (this.selectedSpot()) {
        this.selectedSpot.set(null);
      }

      console.log("Searching with custom filter:", result);

      this._searchService
        .searchSpotsWithCustomFilter(bounds, result)
        .then((searchResult) => {
          const hits = searchResult.hits || [];
          console.log("Found custom filter spots:", hits);

          const previews: SpotPreviewData[] = hits
            .filter((h: any) => !!h)
            .map((hit: any) => this._searchService.getSpotPreviewFromHit(hit));

          if (this.spotMap) {
            this.spotMap.setFilteredSpots(previews);
          }
        })
        .catch((err) => {
          console.error("Error searching with custom filter:", err);
        });
    });
  }

  updateMapURL() {
    // Only update URL if we're currently on the map page
    // This prevents interfering with navigation away from the map
    if (!this.router.url.startsWith("/map")) {
      return;
    }

    const selectedSpot = this.selectedSpot();
    const selectedChallenge = this.selectedChallenge();
    const showEditHistory = this.showSpotEditHistory();
    const activeFilter = this.selectedFilter();

    // Get the spot - prefer selectedSpot, but fall back to challenge's spot
    const spot =
      selectedSpot instanceof Spot
        ? selectedSpot
        : selectedChallenge instanceof SpotChallenge
        ? selectedChallenge.spot
        : null;

    // Build the path based on current state
    let path: string;
    if (
      selectedChallenge &&
      selectedChallenge instanceof SpotChallenge &&
      spot
    ) {
      path = `/map/${encodeURIComponent(
        spot.slug ?? spot.id
      )}/c/${encodeURIComponent(selectedChallenge.id)}`;
    } else if (spot && showEditHistory) {
      path = `/map/${encodeURIComponent(spot.slug ?? spot.id)}/edits`;
    } else if (spot && this.showAllChallenges()) {
      path = `/map/${encodeURIComponent(spot.slug ?? spot.id)}/c`;
    } else if (spot) {
      path = `/map/${encodeURIComponent(spot.slug ?? spot.id)}`;
    } else {
      path = `/map`;
    }

    // Use Location.path() to get the actual browser URL including query params
    // This is necessary because Location.replaceState() doesn't update router.url
    const currentUrl = this._location.path();
    const queryIndex = currentUrl.indexOf("?");
    const existingParams = new URLSearchParams(
      queryIndex >= 0 ? currentUrl.substring(queryIndex + 1) : ""
    );

    // Update the filter param based on activeFilter signal
    if (activeFilter) {
      existingParams.set("filter", activeFilter);
    } else {
      existingParams.delete("filter");
    }

    // Build the new URL
    const queryString = existingParams.toString();
    const newUrl = queryString ? `${path}?${queryString}` : path;

    if (currentUrl === newUrl) {
      return;
    }

    // Use Location.replaceState to update the URL without triggering navigation
    // This prevents interference with navigation away from the map page
    this._location.replaceState(newUrl);
  }

  /**
   * Find all chip listbox elements, pick the visible one and attach observers.
   * This is re-run when the responsive view changes so mobile/desktop variants
   * are handled correctly.
   */
  private _attachChipsMeasurement(): void {
    // Measurement handled by standalone ResizeObserver directive.
    // Keep this method as a noop to avoid changing callers that may re-attach
    // on breakpoint changes. All measurement logic has been moved to the directive.
    return;
  }

  /**
   * Attach or re-attach scroll listeners for sidebar and bottom-sheet.
   * This is called on init and on breakpoint/layout changes so we handle
   * the case where the sidenav is not present on mobile and appears again.
   */
  private _attachSidebarScrollListeners(): void {
    try {
      // Clean up existing listeners first
      if (this._sidebarScrollEl && this._sidebarScrollListener) {
        try {
          this._sidebarScrollEl.removeEventListener(
            "scroll",
            this._sidebarScrollListener as EventListener
          );
        } catch (e) {
          /* ignore */
        }
        this._sidebarScrollEl = undefined;
        this._sidebarScrollListener = undefined;
      }

      if (this._bottomSheetContentEl && this._bottomSheetContentListener) {
        try {
          this._bottomSheetContentEl.removeEventListener(
            "scroll",
            this._bottomSheetContentListener as EventListener
          );
        } catch (e) {
          /* ignore */
        }
        this._bottomSheetContentEl = undefined;
        this._bottomSheetContentListener = undefined;
      }

      // Try to attach sidebar (desktop) listener
      const drawerInner = document.querySelector(
        ".mat-drawer-inner-container"
      ) as HTMLElement | null;
      if (drawerInner) {
        this._sidebarScrollEl = drawerInner;
        this._sidebarScrollListener = () => {
          this.sidebarContentIsScrolling.set(
            !!(this._sidebarScrollEl && this._sidebarScrollEl.scrollTop > 0)
          );
        };
        this._sidebarScrollEl.addEventListener(
          "scroll",
          this._sidebarScrollListener,
          { passive: true }
        );
        this.sidebarContentIsScrolling.set(this._sidebarScrollEl.scrollTop > 0);
      } else {
        this.sidebarContentIsScrolling.set(false);
      }

      // Try to attach bottom-sheet (mobile) listener
      const bottomContent = document.querySelector(
        "app-bottom-sheet #contentEl"
      ) as HTMLElement | null;
      if (bottomContent) {
        this._bottomSheetContentEl = bottomContent;
        this._bottomSheetContentListener = () => {
          this.sidebarContentIsScrolling.set(
            !!(
              this._bottomSheetContentEl &&
              this._bottomSheetContentEl.scrollTop > 0
            )
          );
        };
        this._bottomSheetContentEl.addEventListener(
          "scroll",
          this._bottomSheetContentListener,
          { passive: true }
        );
        this.sidebarContentIsScrolling.set(
          this._bottomSheetContentEl.scrollTop > 0
        );
      }
    } catch (e) {
      console.warn("Could not attach sidebar scroll listeners:", e);
    }
  }

  // Handler invoked by the ResizeObserver directive attached to the chips container.
  onChipsContainerResize(rect: DOMRectReadOnly) {
    const measuredHeight = rect?.height ?? 0;
    const finalHeight =
      measuredHeight > 0 ? Math.ceil(measuredHeight) + 100 : 132;

    if (this.chipsSpacerHeight() !== finalHeight) {
      this.chipsSpacerHeight.set(finalHeight);
    }
  }

  selectSpot(
    spot: Spot | LocalSpot | SpotPreviewData | null,
    updateUrl: boolean = true
  ) {
    // console.debug("selecting spot", spot);
    if (!spot) {
      this.closeSpot(updateUrl);
    } else {
      // Check for SpotPreviewData
      if (!("clone" in spot)) {
        const id = spot.slug || spot.id;
        this.loadSpotById(id as SpotId).then(() => {});
        return;
      }

      this.closeChallenge(false);
      this.selectedPoi.set(null);
      this.selectedSpot.set(spot);
      // When a new spot is selected, jump the sidebar/bottom-sheet content to top
      this.resetSidebarContentToTop();
      this.resetBottomSheetContentToTop();

      this._openInfoPanel();

      this.spotMap?.focusSpot(spot);

      if (updateUrl && spot instanceof Spot) {
        this.updateMapURL();
      }
    }
  }

  /**
   * Scroll the desktop sidebar content to the top.
   * If the material drawer inner container isn't cached yet we attempt to find it.
   */
  resetSidebarContentToTop(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const el =
      this._sidebarScrollEl ||
      (document.querySelector(
        ".mat-drawer-inner-container"
      ) as HTMLElement | null);

    if (el) {
      el.scrollTo({ top: 0 });
      this.sidebarContentIsScrolling.set(false);
    }
  }

  /**
   * Scroll the bottom-sheet content to the top.
   */
  resetBottomSheetContentToTop(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const el =
      this._bottomSheetContentEl ||
      (document.querySelector(
        "app-bottom-sheet #contentEl"
      ) as HTMLElement | null);

    if (el) {
      el.scrollTo({ top: 0 });
      this.sidebarContentIsScrolling.set(false);
    }
  }

  private _openInfoPanel() {
    if (this.responsiveService.isNotMobile()) {
      this.sidenavOpen.set(true);
    }
  }

  selectChallenge(challenge: SpotChallenge, updateUrl: boolean = true) {
    if (!challenge) {
      return this.closeChallenge(updateUrl);
    } else {
      this.showSpotEditHistory.set(false);
      this.selectedChallenge.set(challenge);

      // also open the info panel
      this._openInfoPanel();

      if (updateUrl) {
        this.updateMapURL();
      }
      const location = challenge.location();
      if (location) {
        this.spotMap?.focusPoint(location);
      } else {
        this.spotMap?.focusSpot(challenge.spot);
      }
    }
  }

  closeSpot(updateUrl: boolean = true) {
    this.selectedSpot.set(null);
    this.selectedPoi.set(null); // Clear selected POI
    this.showSpotEditHistory.set(false);
    this.closeChallenge(false);

    if (updateUrl) {
      this.updateMapURL();
    }
  }

  closeChallenge(updateUrl: boolean = true) {
    this.selectedChallenge.set(null);

    if (updateUrl) {
      this.updateMapURL();
    }
  }

  private tryLoadMapsApi() {
    if (!this.mapsService.isApiLoaded()) {
      this.mapsService.loadGoogleMapsApi();
    }
  }

  /**
   * Updates the structured data for highlighted spots when they change.
   * This helps search engines understand the notable parkour spots in the area.
   */
  private _updateHighlightedSpotsStructuredData(spots: SpotPreviewData[]) {
    if (spots.length > 0) {
      const itemList = this._structuredDataService.generateSpotItemList(
        spots,
        $localize`:@@map.highlighted_spots.structured_data_name:Featured Parkour Spots`
      );
      this._structuredDataService.addStructuredData(
        "highlighted-spots",
        itemList
      );
    } else {
      this._structuredDataService.removeStructuredData("highlighted-spots");
    }
  }

  ngOnDestroy() {
    console.debug("destroying map page");
    if (this.checkInEnabled) {
      this.checkInService.showGlobalChip.set(true);
    }
    this.closeSpot();
    this._routerSubscription?.unsubscribe();
    this._alainModeSubscription?.unsubscribe();
    this._breakpointSubscription?.unsubscribe();
    this._consentSubscription?.unsubscribe();
    this._structuredDataService.removeStructuredData("highlighted-spots");
    try {
      if (this._sidebarScrollEl && this._sidebarScrollListener) {
        this._sidebarScrollEl.removeEventListener(
          "scroll",
          this._sidebarScrollListener as EventListener
        );
      }
      if (this._bottomSheetContentEl && this._bottomSheetContentListener) {
        this._bottomSheetContentEl.removeEventListener(
          "scroll",
          this._bottomSheetContentListener as EventListener
        );
      }
      if (this._chipsResizeObserver) {
        try {
          this._chipsResizeObserver.disconnect();
        } catch (e) {
          // ignore
        }
        this._chipsResizeObserver = null;
      }
      if (this._chipsWindowResizeListener) {
        try {
          window.removeEventListener("resize", this._chipsWindowResizeListener);
        } catch (e) {
          // ignore
        }
        this._chipsWindowResizeListener = null;
      }
    } catch (e) {
      console.warn("Error removing scroll listeners:", e);
    }
    this._backHandlingService.removeListener(this.handleBackPress);
  }

  handleBackPress = () => {
    // High priority (10)

    // 1. If Editing, stop editing
    if (this.isEditing()) {
      this.spotMap?.discardEdit();
      return true;
    }

    // 2. If Bottom Sheet is open, close/minimize it
    if (this.bottomSheet && this.bottomSheet.isOpen()) {
      this.bottomSheet.minimize();
      return true;
    }

    // 3. If Spot is selected, close it?
    // User currently relies on URL back, so we return false to let default (BackHandlingService) handle it
    // which triggers Location.back().

    return false;
  };

  spotCheckIn(spotId: SpotId) {
    this.checkInService.checkIn(spotId);
  }
}
