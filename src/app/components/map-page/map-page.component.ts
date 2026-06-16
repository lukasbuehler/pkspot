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
  untracked,
} from "@angular/core";
import { Location } from "@angular/common";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotMapDataManager } from "../spot-map/SpotMapDataManager";
import {
  SpotFilterMode,
  getFilterConfig,
  getFilterModeFromUrlParam,
} from "../spot-map/spot-filter-config";
import { SpotId } from "../../../db/schemas/SpotSchema";
import {
  ActivatedRoute,
  NavigationStart,
  NavigationEnd,
  Router,
} from "@angular/router";
import { MapFloatingControlsComponent } from "../map/map-floating-controls/map-floating-controls.component";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MapsApiService } from "../../services/maps-api.service";
import {
  filter,
  firstValueFrom,
  lastValueFrom,
  Subscription,
  SubscriptionLike,
  take,
} from "rxjs";
import { animate, style, transition, trigger } from "@angular/animations";
import { FormControl } from "@angular/forms";
import {
  CommunitySearchPreview,
  SearchService,
} from "../../services/search.service";
import { CommunityMapMarker } from "../map/community-dot-marker/community-dot-marker.component";
import { rankMapIslandEventsForViewport } from "./map-island-event-ranking";
import {
  buildSelectedEventBoundsOverlays,
  buildSelectedEventPolygonOverlays,
  buildVisibleEventMarkers,
} from "../map/map-event-map-items.model";
import { countries } from "../../../scripts/Countries";
import { SpotMapComponent } from "../spot-map/spot-map.component";
import {
  AsyncPipe,
  isPlatformServer,
  isPlatformBrowser,
  NgTemplateOutlet,
} from "@angular/common";
import { StorageService } from "../../services/firebase/storage.service";
import { GlobalVariables } from "../../../scripts/global";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { GeolocationService } from "../../services/geolocation.service";
import { CheckInService } from "../../services/check-in.service";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { Title } from "@angular/platform-browser";
import { LocaleCode, MediaType, SpotSlug } from "../../../db/models/Interfaces";
import { SlugsService } from "../../services/firebase/firestore/slugs.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { SearchFieldComponent } from "../search-field/search-field.component";
import {
  LocalSpotChallenge,
  SpotChallenge,
} from "../../../db/models/SpotChallenge";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";
import { ConsentService } from "../../services/consent.service";
import { RouteContentData } from "../../resolvers/content.resolver";
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";
import { Timestamp } from "firebase/firestore";
import { SpotEdit } from "../../../db/models/SpotEdit";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { MatSidenavModule } from "@angular/material/sidenav";
import { ResponsiveService } from "../../services/responsive.service";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { BottomSheetComponent } from "../bottom-sheet/bottom-sheet.component";
import { StructuredDataService } from "../../services/structured-data.service";
import { MatDialog } from "@angular/material/dialog";
import { FilterChipsBarComponent } from "../filter-chips-bar/filter-chips-bar.component";
import { MarkerSchema } from "../map/markers/map-marker.model";
import {
  CustomFilterDialogComponent,
  CustomFilterParams,
} from "../custom-filter-dialog/custom-filter-dialog.component";
import { BackHandlingService } from "../../services/back-handling.service";
import { AppSettingsService } from "../../services/app-settings.service";
import { environment } from "../../../environments/environment.default";
import {
  buildSpotCanonicalPath,
  buildSpotChallengeCanonicalPath,
  buildSpotEditHistoryCanonicalPath,
} from "../../../scripts/SpotRouteHelpers";
import { VisibleViewport } from "../maps/map-base";

import { PoiData } from "../../../db/models/PoiData";
import { PoiDetailComponent } from "../poi-detail/poi-detail.component";
import { AmenityNames, AmenitiesMap } from "../../../db/models/Amenities";
import {
  CommunityLandingPageData,
  LandingPagesService,
} from "../../services/firebase/firestore/landing-pages.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventCategory } from "../../../db/schemas/EventSchema";
import {
  SeriesDocument,
  SeriesService,
} from "../../services/firebase/firestore/series.service";
import { AnalyticsService } from "../../services/analytics.service";
import {
  MapIslandComponent,
  MapIslandCommunity,
  MapIslandContent,
} from "../map-island/map-island.component";
import { afterNextRender } from "@angular/core";
import { ChipSelectorOption } from "../chip-selector/chip-selector.component";
import { MapObjectPanelComponent } from "../map/map-object-panel/map-object-panel.component";
import { MapObjectCounts, MapObjectMode } from "../map/map-object-mode.model";
import { MapSpotEditsPanelComponent } from "../map/map-spot-edits-panel/map-spot-edits-panel.component";
import { MapSpotChallengesPanelComponent } from "../map/map-spot-challenges-panel/map-spot-challenges-panel.component";
import { MapSpotDetailsPanelComponent } from "../map/map-spot-details-panel/map-spot-details-panel.component";
import { MapEventPreviewPanelComponent } from "../map/map-event-preview-panel/map-event-preview-panel.component";
import { MapCommunityLandingPanelComponent } from "../map/map-community-landing-panel/map-community-landing-panel.component";
import {
  getMapPanelView,
  MapPanelView,
  PanelBackTarget,
  PendingEventPanel,
  PendingSpotPanel,
} from "../map/map-panel-view.model";
import { MapCheckInBannerComponent } from "../map/map-check-in-banner/map-check-in-banner.component";

interface EventPromoDismissalRecord {
  showAgainAt: string;
  dismissCount: number;
}

type MapEventFilter = "live" | "competition" | "jam" | "camp";

type CommunityCountryFocusData = {
  boundsCenter?: [number, number];
  displayName: string;
  countryCode?: string;
  googleMapsPlaceId?: string;
  country?: {
    code?: string;
  };
};

type MapViewportBbox = VisibleViewport["bbox"];

interface CommunitySpotFocus {
  communityKey: string;
  scope: CommunityLandingPageData["scope"] | MapIslandCommunity["scope"];
  center: { lat: number; lng: number };
  radiusM: number;
}

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
    trigger("fastFadeOut", [
      transition(":enter", [
        style({ opacity: 0 }),
        animate("120ms ease-out", style({ opacity: 1 })),
      ]),
      transition(":leave", [
        style({ opacity: 1 }),
        animate("90ms ease-in", style({ opacity: 0 })),
      ]),
    ]),
    trigger("slideInOut", [
      transition(":enter", [
        style({ opacity: 0, scale: 1, translate: "100%" }),
        animate(
          "0.3s ease-in-out",
          style({ opacity: 1, scale: 1, translate: "0px" }),
        ),
      ]),
      transition(":leave", [
        style({ opacity: 1, scale: 1, translate: "0px" }),
        animate(
          "0.3s ease-in-out",
          style({ opacity: 0, scale: 1, translate: "100%" }),
        ),
      ]),
    ]),
  ],
  imports: [
    SpotMapComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    PoiDetailComponent,
    SearchFieldComponent,
    AsyncPipe,
    MatSidenavModule,
    NgTemplateOutlet,
    BottomSheetComponent,
    FilterChipsBarComponent,
    MapIslandComponent,
    MapObjectPanelComponent,
    MapSpotEditsPanelComponent,
    MapSpotChallengesPanelComponent,
    MapSpotDetailsPanelComponent,
    MapEventPreviewPanelComponent,
    MapCommunityLandingPanelComponent,
    MapCheckInBannerComponent,
    MapFloatingControlsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly _eventPromoDismissalsStorageKey =
    "pkspot.eventPromoDismissals.v1";
  private readonly _eventPromoDismissalDurationMs = 24 * 60 * 60 * 1000;

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
  private _analytics = inject(AnalyticsService);
  readonly ageAssurance = inject(AgeAssuranceService);
  private _pendingCommunityFocusSlug: string | null = null;

  /** Viewport counts for object type chips. */
  mapObjectCounts = signal<MapObjectCounts>({
    spots: 0,
    events: 0,
    communities: 0,
  });
  private _baseMapObjectCounts = signal<MapObjectCounts>({
    spots: 0,
    events: 0,
    communities: 0,
  });

  searchResultSpots: WritableSignal<Spot[]> = signal([]);
  selectedSpot: WritableSignal<Spot | LocalSpot | null> = signal(null);
  pendingSpotPreview = signal<PendingSpotPanel | null>(null);
  selectedCommunityLanding = signal<CommunityLandingPageData | null>(null);
  pendingCommunityLanding = signal<MapIslandCommunity | null>(null);
  panelBackTarget = signal<PanelBackTarget | null>(null);
  /**
   * Event currently shown as a preview on the map (sidebar / bottom-sheet).
   * Set when the user clicks an event from the community panel or the
   * map island. Distinct from "navigated to /events/<slug>" — that's the
   * full event page; this is the lightweight preview that keeps the map
   * underneath.
   */
  selectedEvent = signal<PkEvent | null>(null);
  pendingEventPreview = signal<PendingEventPanel | null>(null);
  selectedPoi = signal<PoiData | null>(null);
  selectedSpotIdOrSlug: WritableSignal<SpotId | string | null> = signal(null);
  searchPreviewCommunity = signal<CommunitySearchPreview | null>(null);
  selectedSpotIdForEdits = computed(() => {
    const spot = this.selectedSpot();
    return spot instanceof Spot ? spot.id : null;
  });
  showAllChallenges: WritableSignal<boolean> = signal(false);
  allSpotChallenges: WritableSignal<SpotChallenge[]> = signal([]);
  showSpotEditHistory: WritableSignal<boolean> = signal(false);
  searchPreviewPlaceId = signal<string | null>(null);

  mapPanelView = computed<MapPanelView>(() =>
    getMapPanelView({
      poi: this.selectedPoi(),
      spot: this.selectedSpot(),
      pendingSpot: this.pendingSpotPreview(),
      selectedChallenge: this.selectedChallenge(),
      showAllChallenges: this.showAllChallenges(),
      showSpotEditHistory: this.showSpotEditHistory(),
      event: this.selectedEvent(),
      pendingEvent: this.pendingEventPreview(),
      community: this.selectedCommunityLanding(),
      pendingCommunity: this.pendingCommunityLanding(),
    }),
  );

  isEditing: WritableSignal<boolean> = signal(false);
  mapStyle: "roadmap" | "satellite" | "hybrid" | "terrain" | null = null;
  selectedChallenge: WritableSignal<SpotChallenge | LocalSpotChallenge | null> =
    signal(null);

  geolocationService = inject(GeolocationService);
  checkInService = inject(CheckInService);
  readonly checkInEnabled = environment.features.checkIns;
  proximityCheckInSpot = computed(() =>
    this.checkInEnabled ? this.checkInService.currentProximitySpot() : null,
  );

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

  onSpotPanelEditingChange(isEditing: boolean) {
    if (isEditing) {
      this.spotMap?.startEdit();
    } else {
      this.spotMap?.discardEdit();
    }
  }

  onSpotPanelAddBounds() {
    this.spotMap?.addBounds();
  }

  onSpotPanelFocus() {
    const spot = this.selectedSpot();
    if (spot) {
      this.spotMap?.focusSpot(spot);
    }
  }

  onSpotPanelSave(spot: Spot | LocalSpot) {
    this.spotMap?.saveSpot(spot);
  }

  alainMode: boolean = false;

  isServer: boolean;

  showAmenities = signal<boolean>(true);
  bottomSheetOpen = signal<boolean>(false);
  bottomSheetProgress = signal<number>(0);

  // Start closed to prevent flash - will open when desktop is confirmed
  sidenavOpen = signal<boolean>(false);
  sidebarContentIsScrolling = signal<boolean>(false);
  compactSidenavRange = signal<boolean>(false);
  compactTabletSidenavOpen = computed(
    () => this.sidenavOpen() && this.compactSidenavRange(),
  );
  mapSidenavMode = computed<"over" | "side">(() =>
    this.compactSidenavRange() ? "over" : "side",
  );

  // Height of the top spacer in the sidebar/bottom-sheet to match chip listbox
  // Default to expected fallback (32 chip + 100 padding)
  chipsSpacerHeight = signal<number>(132);

  spotListLimit = computed(() => {
    // If mobile and bottom sheet is "closed" (progress < 0.2), limit the list
    if (this.responsiveService.isMobile() && this.bottomSheetProgress() <= 0) {
      return 2;
    }
    if (this.mapObjectMode() === "all") {
      return 8;
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
  private _lastFocusedCommunityKey: string | null = null;
  private _spotLoadRequestVersion = 0;

  filterCtrl = new FormControl<string[]>([], { nonNullable: true });
  selectedFilters = signal<string[]>([]);

  /**
   * Tracks the currently selected filter chip for URL sync.
   */
  selectedFilter = signal<string>("");
  selectedEventFilter = signal<MapEventFilter | "">("");

  /**
   * Effect to apply filter when map becomes available or filter changes.
   * This handles the initial load race condition where filter param exists but map isn't ready.
   */
  filterEffect = effect(() => {
    const isMapReady = this.mapReady();
    const selectedFilter = untracked(() => this.selectedFilter());

    console.debug("filterEffect running:", {
      filter: selectedFilter,
      isMapReady,
      hasSpotMap: !!this.spotMap,
    });

    // Only proceed if we have a map instance that's ready
    if (isMapReady && this.spotMap && selectedFilter) {
      // filterChipChanged handles both cases: bounds available (immediate search)
      // and bounds not available (sets filter mode, waits for filterBoundsChange event)
      console.debug(
        "filterEffect: calling filterChipChanged with:",
        selectedFilter,
      );
      setTimeout(() => this.filterChipChanged(selectedFilter), 0);
    }
  });

  toggleSidenav() {
    this.sidenavOpen.update((open) => !open);
  }

  private _alainModeSubscription?: Subscription;
  private _routerSubscription?: Subscription;
  private _locationSubscription?: SubscriptionLike;
  private _breakpointSubscription?: Subscription;
  private _compactSidenavBreakpointSubscription?: Subscription;
  private _consentSubscription?: Subscription;
  private _authStateSubscription?: Subscription;
  private _privateDataSubscription?: Subscription;
  private _privateDataUserId: string | null = null;

  isSignedIn = signal<boolean>(false);
  savedSpotIds = signal<string[]>([]);
  visitedSpotIds = signal<string[]>([]);
  private _savedSpotPreviewCache = new Map<string, SpotPreviewData>();
  private _visitedSpotPreviewCache = new Map<string, SpotPreviewData>();
  private _savedPreviewLoadPromise: Promise<void> | null = null;
  private _visitedPreviewLoadPromise: Promise<void> | null = null;

  spotEdits: WritableSignal<SpotEdit[]> = signal([]);
  pendingSpotEditsCount = signal<number>(0);

  noSpotsForFilter: WritableSignal<boolean> = signal(false);

  // ----- Map island state -----
  private _eventsService = inject(EventsService);
  private _seriesService = inject(SeriesService);
  private _landingPagesService = inject(LandingPagesService);
  /** Promoted events whose promo radius intersects the viewport. */
  private _promotableEvents = signal<PkEvent[]>([]);
  /** Non-promo event markers whose actual location is in the viewport. */
  private _visibleMapEvents = signal<PkEvent[]>([]);
  private _visibleEventSeriesById = signal<Record<string, SeriesDocument>>({});
  private _visibleEventSeriesLoadVersion = 0;
  /**
   * All published communities (lightweight previews from typesense), loaded
   * once on init. Drives the "popular communities" SEO list and the
   * viewport-intersection logic for the community variant of the map island.
   * Full landing page data is lazy-loaded via `LandingPagesService.getCommunityPage`
   * only when the user actually opens a community.
   */
  private _promotableCommunities = signal<CommunitySearchPreview[]>([]);
  private _visibleMapCommunities = signal<CommunitySearchPreview[]>([]);
  /** Latest visible viewport. Drives the map-island event/community context. */
  private _viewport = signal<VisibleViewport | null>(null);
  private _communitySpotSearchVersion = 0;
  focusedCommunitySpotPreviews = signal<SpotPreviewData[] | null>(null);
  communitySpotPreviewsForMap = computed<SpotPreviewData[] | null>(() =>
    this.communitySpotFocus()
      ? (this.focusedCommunitySpotPreviews() ?? [])
      : null,
  );
  mapObjectMode = signal<MapObjectMode>("all");
  mapObjectTypeChips = computed<ChipSelectorOption<MapObjectMode>[]>(() => {
    const counts = this._displayMapObjectCounts();
    return [
      { value: "all", label: $localize`:@@map_objects_all_chip_label:All` },
      {
        value: "spots",
        label: `${counts.spots} ${this._pluralizeMapObjectCount(
          counts.spots,
          $localize`:@@map_objects_spot_singular:Spot`,
          $localize`:@@map_objects_spot_plural:Spots`,
        )}`,
      },
      {
        value: "events",
        label: `${counts.events} ${this._pluralizeMapObjectCount(
          counts.events,
          $localize`:@@map_objects_event_singular:Event`,
          $localize`:@@map_objects_event_plural:Events`,
        )}`,
      },
      {
        value: "communities",
        label: `${counts.communities} ${this._pluralizeMapObjectCount(
          counts.communities,
          $localize`:@@map_objects_community_singular:Community`,
          $localize`:@@map_objects_community_plural:Communities`,
        )}`,
      },
    ];
  });
  showSpotFilterChips = computed(() => {
    const mode = this.mapObjectMode();
    return mode === "all" || mode === "spots";
  });
  showEventFilterChips = computed(() => this.mapObjectMode() === "events");
  activeMapQueryParams = computed<Record<string, string> | null>(() => {
    const filter = this.selectedFilter();
    const eventFilter = this.selectedEventFilter();
    const type = this.mapObjectMode();
    const params: Record<string, string> = {};
    if (filter) params["filter"] = filter;
    if (eventFilter) params["eventFilter"] = eventFilter;
    if (type !== "all") params["type"] = type;
    return Object.keys(params).length > 0 ? params : null;
  });
  searchContextLabel = computed<string | null>(() => {
    const filter = this.selectedFilter();
    if (filter || this.customFilterParams()) {
      return `${this._mapObjectModeLabel("spots")} ${this._spotFilterLabel(
        filter,
      )}`;
    }

    const eventFilter = this.selectedEventFilter();
    if (eventFilter) {
      return `${this._mapObjectModeLabel("events")} ${this._eventFilterLabel(
        eventFilter,
      )}`;
    }

    const mode = this.mapObjectMode();
    return mode === "all" ? null : this._mapObjectModeLabel(mode);
  });
  visibleMapEvents = computed(() => this._visibleMapEvents());
  filteredVisibleMapEvents = computed(() =>
    this._filterEvents(this._visibleMapEvents(), this.selectedEventFilter()),
  );
  visibleEventSeriesById = computed(() => this._visibleEventSeriesById());
  visibleMapCommunities = computed(() => this._visibleMapCommunities());

  readonly eventFilterOptions: ReadonlyArray<{
    value: MapEventFilter;
    urlParam: MapEventFilter;
    label: string;
    icon: string;
  }> = [
    {
      value: "live",
      urlParam: "live",
      label: $localize`:@@map_event_filter.live:Live`,
      icon: "sensors",
    },
    {
      value: "competition",
      urlParam: "competition",
      label: $localize`:@@event_category.competition:Competition`,
      icon: "trophy",
    },
    {
      value: "jam",
      urlParam: "jam",
      label: $localize`:@@event_category.jam:Jam`,
      icon: "groups",
    },
    {
      value: "camp",
      urlParam: "camp",
      label: $localize`:@@event_category.camp:Camp`,
      icon: "camping",
    },
  ];
  readonly eventFiltersLabel = $localize`:@@map_event_filters_aria_label:Event filters`;

  private _promotableCommunitiesRequested = false;
  /** Per-event promo dismissals persisted in localStorage. */
  private _eventPromoDismissals = signal<
    Record<string, EventPromoDismissalRecord>
  >({});
  /** Communities the user has dismissed in the current session. */
  private _dismissedCommunityKeys = signal<Set<string>>(new Set());
  private _communityRouteLoadVersion = 0;
  private _mapObjectSearchVersion = 0;
  private _spotPreviewCache = new Map<string, PendingSpotPanel>();
  private _eventPreviewCache = new Map<string, PkEvent>();
  private _countryViewportCache = new Map<
    string,
    google.maps.LatLngBounds | null
  >();

  /**
   * Geographic extent of the community currently surfaced in the map-island
   * (either route-driven or viewport-detected). Drawn as a low-opacity
   * circle on the map so the user can see what area the chip refers to.
   * Null when no community variant is active.
   */
  activeCommunityArea = computed<{
    center: { lat: number; lng: number };
    radiusM: number;
    googleBoundary?: {
      featureType: "COUNTRY";
      placeId?: string;
      query?: string;
      region?: string;
    };
  } | null>(() => {
    const data =
      this.selectedCommunityLanding() ?? this.pendingCommunityLanding();
    if (!data) return null;
    if (
      !data.boundsCenter ||
      typeof data.boundsRadiusM !== "number" ||
      data.boundsCenter.length < 2
    ) {
      return null;
    }
    const [lat, lng] = data.boundsCenter;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      center: { lat, lng },
      radiusM: data.boundsRadiusM,
      googleBoundary:
        data.scope === "country"
          ? {
              featureType: "COUNTRY",
              placeId: data.googleMapsPlaceId,
              query: data.displayName,
              region:
                "country" in data
                  ? data.country.code?.toUpperCase()
                  : data.countryCode?.toUpperCase(),
            }
          : undefined,
    };
  });

  /**
   * Top community pages by spot count, surfaced as a "Popular parkour
   * communities" list at the bottom of the map sidebar. Pure SEO body
   * text — gives crawlers internal links to community pages and gives
   * users a way to browse parkour cities without zooming around.
   *
   * Derives from `_promotableCommunities` (already loaded for the map
   * island) so we don't make a second Firestore read.
   */
  popularCommunities = computed(() =>
    this._promotableCommunities()
      .slice()
      .sort((a, b) => (b.totalSpots ?? 0) - (a.totalSpots ?? 0))
      .slice(0, 8),
  );

  showMapSpots = computed(() => {
    const mode = this.mapObjectMode();
    return (
      mode === "all" || mode === "spots" || this.communitySpotFocus() !== null
    );
  });

  showVisibleSpotPins = computed(
    () =>
      this.mapObjectMode() === "spots" && this.communitySpotFocus() === null,
  );

  communitySpotFocus = computed<CommunitySpotFocus | null>(() => {
    const mode = this.mapObjectMode();
    if (mode === "events") return null;

    const community =
      this.selectedCommunityLanding() ?? this.pendingCommunityLanding();
    if (!community) return null;

    if (
      !community.boundsCenter ||
      typeof community.boundsRadiusM !== "number" ||
      community.boundsCenter.length < 2
    ) {
      return null;
    }

    const [lat, lng] = community.boundsCenter;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(community.boundsRadiusM) ||
      community.boundsRadiusM <= 0
    ) {
      return null;
    }

    return {
      communityKey: community.communityKey,
      scope: community.scope,
      center: { lat, lng },
      radiusM: community.boundsRadiusM,
    };
  });

  /**
   * Locality communities with bounds info, projected into the map shape.
   * Country and region circles are intentionally excluded for now: they
   * become too large to communicate anything useful on the map, while
   * locality circles read as named places rather than background paint.
   *
   * Hide the currently-selected community's marker (the area circle +
   * panel already convey it) to avoid the chip overlapping the panel UI.
   */
  availableCommunityMarkers = computed<CommunityMapMarker[]>(() => {
    const mode = this.mapObjectMode();
    if (mode !== "all" && mode !== "communities") return [];

    const selectedKey =
      this.selectedCommunityLanding()?.communityKey ??
      this.pendingCommunityLanding()?.communityKey ??
      null;
    if (selectedKey) return [];

    return this._visibleMapCommunities()
      .filter(
        (c) =>
          c.communityKey !== selectedKey &&
          c.scope === "locality" &&
          c.boundsCenter &&
          typeof c.boundsRadiusM === "number" &&
          c.boundsRadiusM > 0,
      )
      .map((c) => ({
        communityKey: c.communityKey,
        displayName: c.displayName,
        scope: c.scope,
        center: { lat: c.boundsCenter![0], lng: c.boundsCenter![1] },
        radiusM: c.boundsRadiusM!,
      }));
  });

  /**
   * Event chip markers shown on the map. These are actual event locations
   * inside the viewport; promoted events outside the viewport only feed the
   * island and are intentionally not rendered as map markers or counted in
   * the Events chip.
   *
   * Past events are not surfaced as pins (out-of-date pins clutter the
   * map without value). Promoted events render with the highlighted
   * border style.
   */
  availableEventMarkers = computed(() => {
    const now = new Date();
    return buildVisibleEventMarkers({
      visibleEvents:
        this.mapObjectMode() === "events"
          ? this.filteredVisibleMapEvents()
          : this._visibleMapEvents(),
      selectedEvent: this.selectedEvent(),
      pendingEventRef: this.pendingEventPreview()?.idOrSlug ?? null,
      mode: this.mapObjectMode(),
      now,
    });
  });

  selectedEventBoundsOverlays = computed(() =>
    buildSelectedEventBoundsOverlays(
      this.selectedEvent(),
      this._getCssColorAsHex,
    ),
  );

  selectedEventPolygonOverlays = computed(() =>
    buildSelectedEventPolygonOverlays(
      this.selectedEvent(),
      this._getCssColorAsHex,
    ),
  );

  private _getCssColorAsHex = (
    cssVarName: string,
    fallback: string,
  ): string => {
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
  };

  /**
   * Active map-island content. Picks the most relevant variant for the
   * visible viewport. Reserved for high-signal content:
   *   1. Filter helper ("no spots match this filter") — user-action context.
   *   2. Promoted events — paid surface + first-class events.
   *
   * Communities are intentionally NOT surfaced here — they're already
   * visible as clickable circles on the map (less attention-grabbing
   * than the island chip, more appropriate to their weight).
   */
  islandContent = computed<MapIslandContent | null>(() => {
    if (this.noSpotsForFilter()) {
      return {
        kind: "filter",
        message: $localize`:Filter helper text@@filter_helper_text:There are no spots matching the filter in this area.`,
      };
    }

    const viewport = this._viewport();
    const eventPanelOpen = this.selectedEvent() || this.pendingEventPreview();
    if (viewport && !eventPanelOpen) {
      const dismissals = this._eventPromoDismissals();
      const event = rankMapIslandEventsForViewport(
        this._promotableEvents().filter(
          (e) => !this._isEventPromoDismissed(e, dismissals),
        ),
        viewport.bbox,
      )[0]?.event;
      if (event) return { kind: "event", event };
    }

    return null;
  });

  visibleIslandContent = computed<MapIslandContent | null>(() => {
    if (
      this.responsiveService.isMobile() &&
      (this.bottomSheetOpen() || this.bottomSheetProgress() > 0.05)
    ) {
      return null;
    }

    return this.islandContent();
  });

  /**
   * True when a `{lat, lng}` point falls within the viewport rectangle.
   * Used by the map-island ranking to prefer communities whose center is
   * actually visible to the user.
   */
  private _pointInViewport(
    point: { lat: number; lng: number },
    viewport: { north: number; south: number; east: number; west: number },
  ): boolean {
    if (point.lat < viewport.south || point.lat > viewport.north) return false;
    // Antimeridian handling (defensive — viewports rarely cross it in
    // practice, but the math is cheap).
    if (viewport.west <= viewport.east) {
      return point.lng >= viewport.west && point.lng <= viewport.east;
    }
    return point.lng >= viewport.west || point.lng <= viewport.east;
  }

  private _communitySpotSearchBbox(
    focus: CommunitySpotFocus,
    viewport: MapViewportBbox,
  ): MapViewportBbox | null {
    const communityBbox = this._bboxFromCircle(focus.center, focus.radiusM);
    if (focus.scope === "country") {
      return this._bboxCoversWorld(viewport) ? communityBbox : viewport;
    }

    return this._intersectBboxes(communityBbox, viewport);
  }

  private _bboxFromCircle(
    center: { lat: number; lng: number },
    radiusM: number,
  ): MapViewportBbox {
    const latRadius = radiusM / 111_320;
    const lngRadius =
      radiusM /
      (111_320 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01));

    return {
      north: Math.min(90, center.lat + latRadius),
      south: Math.max(-90, center.lat - latRadius),
      east: this._normalizeLongitude(center.lng + lngRadius),
      west: this._normalizeLongitude(center.lng - lngRadius),
    };
  }

  private _intersectBboxes(
    first: MapViewportBbox,
    second: MapViewportBbox,
  ): MapViewportBbox | null {
    const north = Math.min(first.north, second.north);
    const south = Math.max(first.south, second.south);
    if (north < south) return null;

    const firstIntervals = this._longitudeIntervals(first);
    const secondIntervals = this._longitudeIntervals(second);
    const intersections: Array<[number, number]> = [];

    for (const [firstWest, firstEast] of firstIntervals) {
      for (const [secondWest, secondEast] of secondIntervals) {
        const west = Math.max(firstWest, secondWest);
        const east = Math.min(firstEast, secondEast);
        if (west <= east) {
          intersections.push([west, east]);
        }
      }
    }

    if (intersections.length === 0) return null;

    const [west, east] = intersections.reduce((largest, current) =>
      current[1] - current[0] > largest[1] - largest[0] ? current : largest,
    );

    return { north, south, east, west };
  }

  private _spotPreviewMatchesCommunityFocus(
    preview: SpotPreviewData,
    focus: CommunitySpotFocus,
  ): boolean {
    const location = this._getPreviewLocation(preview);
    if (!location) return false;

    if (focus.scope === "country") {
      return true;
    }

    return this._distanceMeters(location, focus.center) <= focus.radiusM;
  }

  private _dedupeSpotPreviews(previews: SpotPreviewData[]): SpotPreviewData[] {
    const seen = new Set<string>();
    return previews.filter((preview) => {
      if (!preview.id || seen.has(preview.id)) return false;
      seen.add(preview.id);
      return true;
    });
  }

  private _viewportCenter(viewport: {
    north: number;
    south: number;
    east: number;
    west: number;
  }): { lat: number; lng: number } {
    return {
      lat: (viewport.north + viewport.south) / 2,
      lng: (viewport.east + viewport.west) / 2,
    };
  }

  private _viewportRadiusMeters(viewport: {
    north: number;
    south: number;
    east: number;
    west: number;
  }): number {
    const center = this._viewportCenter(viewport);
    return this._distanceMeters(center, {
      lat: viewport.north,
      lng: viewport.east,
    });
  }

  private _viewportIntersectsCircle(
    viewport: { north: number; south: number; east: number; west: number },
    center: { lat: number; lng: number },
    radiusM: number,
  ): boolean {
    const closestLat = Math.max(
      viewport.south,
      Math.min(center.lat, viewport.north),
    );
    const closestLng = Math.max(
      viewport.west,
      Math.min(center.lng, viewport.east),
    );
    const distanceM = this._distanceMeters(center, {
      lat: closestLat,
      lng: closestLng,
    });
    return distanceM <= radiusM;
  }

  private _mapObjectSearchLimits(viewport: VisibleViewport): {
    events: number;
    communities: number;
  } {
    if (viewport.zoom <= 5) {
      return { events: 120, communities: 160 };
    }

    if (viewport.zoom <= 8) {
      return { events: 80, communities: 120 };
    }

    return { events: 30, communities: 80 };
  }

  private _distanceMeters(
    left: { lat: number; lng: number },
    right: { lat: number; lng: number },
  ): number {
    const R = 6371e3;
    const φ1 = (left.lat * Math.PI) / 180;
    const φ2 = (right.lat * Math.PI) / 180;
    const Δφ = ((right.lat - left.lat) * Math.PI) / 180;
    const Δλ = ((right.lng - left.lng) * Math.PI) / 180;
    const h =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  onViewportBoundsChange(bounds: google.maps.LatLngBounds): void {
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    this._viewport.set({
      zoom: this._viewport()?.zoom ?? 0,
      bbox: {
        north: ne.lat(),
        south: sw.lat(),
        east: ne.lng(),
        west: sw.lng(),
      },
    });
  }

  onVisibleViewportChange(viewport: VisibleViewport): void {
    this._viewport.set(viewport);
  }

  onIslandDismissEvent(event: PkEvent): void {
    const dismissal = this._dismissEventPromo(event);
    this._trackMapIslandInteraction("dismiss", {
      kind: "event",
      event,
      dismissal,
    });
  }

  onIslandDismissCommunity(
    community: MapIslandCommunity | CommunityLandingPageData,
  ): void {
    this._trackMapIslandInteraction("dismiss", {
      kind: "community",
      community,
    });
    this._dismissedCommunityKeys.update((set) => {
      const next = new Set(set);
      next.add(community.communityKey);
      return next;
    });
  }

  onIslandOpenEvent(event: PkEvent): void {
    this._trackMapIslandInteraction("open", {
      kind: "event",
      event,
    });
    this.openEventPath(event.slug ?? event.id, null);
  }

  /**
   * Open the community panel without triggering a route navigation. The map
   * page is mounted on a separate top-level route from `/map/communities/<slug>`,
   * so a normal `router.navigateByUrl` would unmount and remount the map
   * (refreshing tiles, re-fetching spots, etc.). Instead we set the panel
   * state directly and push the URL via `Location.go` so the page
   * is still shareable / reloadable.
   */
  onIslandOpenCommunity(
    community: MapIslandCommunity | CommunityLandingPageData,
  ): void {
    this._trackMapIslandInteraction("open", {
      kind: "community",
      community,
    });
    this._openCommunityPanel(community);
  }

  private _openCommunityPanel(
    community: MapIslandCommunity | CommunityLandingPageData,
  ): void {
    this._prepareCommunityPanelOpen();
    this._dismissedCommunityKeys.update((set) => {
      // Clearing a previous dismissal is the right thing here — the user
      // just explicitly opened it.
      const next = new Set(set);
      next.delete(community.communityKey);
      return next;
    });

    if (this._isFullCommunityLanding(community)) {
      this.panelBackTarget.set(
        this._getCurrentPanelBackTarget(community.canonicalPath),
      );
      this.selectedCommunityLanding.set(community);
      this.pendingCommunityLanding.set(null);
      this._location.go(community.canonicalPath);
      return;
    }

    // Lightweight typesense preview — patch URL optimistically, then lazy
    // load the full landing page data from Firestore.
    const requestVersion = ++this._communityRouteLoadVersion;
    this.pendingCommunityLanding.set(community);
    this._openInfoPanel();
    this._focusCommunityPreviewOnMap(community);
    if (community.canonicalPath) {
      this.panelBackTarget.set(
        this._getCurrentPanelBackTarget(community.canonicalPath),
      );
      this._location.go(community.canonicalPath);
    }
    this._landingPagesService
      .getCommunityPage(community.slug, 8, false)
      .then((full) => {
        if (
          requestVersion !== this._communityRouteLoadVersion ||
          !this.pendingCommunityLanding()
        ) {
          return;
        }

        if (full && full.communityKey === community.communityKey) {
          this.selectedCommunityLanding.set(full);
        }
      })
      .catch((err) => {
        console.error("Failed to load community landing page", err);
      })
      .finally(() => {
        if (requestVersion === this._communityRouteLoadVersion) {
          this.pendingCommunityLanding.set(null);
        }
      });
  }

  private _trackMapIslandInteraction(
    action: "open" | "dismiss",
    content:
      | {
          kind: "event";
          event: PkEvent;
          dismissal?: EventPromoDismissalRecord;
        }
      | {
          kind: "community";
          community: MapIslandCommunity | CommunityLandingPageData;
        }
      | { kind: "filter"; message: string },
  ): void {
    const properties: Record<string, unknown> = {
      action,
      island_kind: content.kind,
      selected_filter: this.selectedFilter() || null,
      custom_filter_active: this.customFilterParams() !== null,
    };

    if (content.kind === "event") {
      properties["event_id"] = content.event.id;
      properties["event_slug"] = content.event.slug;
      properties["event_name"] = content.event.name;
      properties["event_status"] = content.event.status();
      properties["is_sponsored"] = content.event.isSponsored;
      properties["sponsor_name"] = content.event.sponsor?.name;
      properties["external_provider"] = content.event.externalSource?.provider;
      if (content.dismissal) {
        properties["show_again_at"] = content.dismissal.showAgainAt;
        properties["dismiss_count"] = content.dismissal.dismissCount;
      }
    } else if (content.kind === "community") {
      const community = content.community;
      const isFullCommunity = this._isFullCommunityLanding(community);
      properties["community_key"] = content.community.communityKey;
      properties["community_slug"] = isFullCommunity
        ? community.preferredSlug
        : community.slug;
      properties["community_name"] = content.community.displayName;
      properties["community_scope"] = content.community.scope;
      properties["country_code"] = isFullCommunity
        ? community.country.code
        : community.countryCode;
    } else {
      properties["message"] = content.message;
    }

    this._analytics.trackEvent(
      this._getMapIslandAnalyticsEventName(action, content.kind),
      properties,
    );
  }

  private _getMapIslandAnalyticsEventName(
    action: "open" | "dismiss",
    kind: "event" | "community" | "filter",
  ): string {
    if (kind === "event") {
      return action === "open"
        ? "open_event_from_island"
        : "dismiss_event_island";
    }

    if (kind === "community") {
      return action === "open"
        ? "open_community_from_island"
        : "dismiss_community_island";
    }

    return "dismiss_filter_island";
  }

  private _isEventPromoDismissed(
    event: PkEvent,
    dismissals: Record<string, EventPromoDismissalRecord>,
  ): boolean {
    const showAgainAt = Date.parse(dismissals[event.id]?.showAgainAt ?? "");
    return Number.isFinite(showAgainAt) && showAgainAt > Date.now();
  }

  private _dismissEventPromo(event: PkEvent): EventPromoDismissalRecord {
    const previous = this._eventPromoDismissals()[event.id];
    const dismissal: EventPromoDismissalRecord = {
      showAgainAt: new Date(
        Date.now() + this._eventPromoDismissalDurationMs,
      ).toISOString(),
      dismissCount: (previous?.dismissCount ?? 0) + 1,
    };

    this._eventPromoDismissals.update((dismissals) => ({
      ...dismissals,
      [event.id]: dismissal,
    }));
    this._saveEventPromoDismissals();
    return dismissal;
  }

  private _loadEventPromoDismissals(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const raw = localStorage.getItem(this._eventPromoDismissalsStorageKey);
      if (!raw) return;

      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return;
      }

      const dismissals: Record<string, EventPromoDismissalRecord> = {};
      for (const [eventId, value] of Object.entries(parsed)) {
        if (
          !eventId ||
          !value ||
          typeof value !== "object" ||
          Array.isArray(value)
        ) {
          continue;
        }

        const record = value as Partial<EventPromoDismissalRecord>;
        const showAgainAt =
          typeof record.showAgainAt === "string" ? record.showAgainAt : "";
        const dismissCount =
          typeof record.dismissCount === "number" &&
          Number.isFinite(record.dismissCount)
            ? Math.max(0, Math.floor(record.dismissCount))
            : 0;

        if (!Number.isFinite(Date.parse(showAgainAt))) {
          continue;
        }

        dismissals[eventId] = { showAgainAt, dismissCount };
      }

      this._eventPromoDismissals.set(dismissals);
    } catch (err) {
      console.warn("MapPage: failed to load event promo dismissals", err);
    }
  }

  private _saveEventPromoDismissals(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      localStorage.setItem(
        this._eventPromoDismissalsStorageKey,
        JSON.stringify(this._eventPromoDismissals()),
      );
    } catch (err) {
      console.warn("MapPage: failed to save event promo dismissals", err);
    }
  }

  /**
   * Click handler for the on-map community chip markers. Resolves the
   * key to a community preview, then opens the same panel as the island
   * without counting the marker click as a map-island interaction.
   */
  onCommunityMarkerClick(communityKey: string): void {
    const preview =
      this._visibleMapCommunities().find(
        (c) => c.communityKey === communityKey,
      ) ??
      this._promotableCommunities().find(
        (c) => c.communityKey === communityKey,
      );
    if (!preview) {
      console.warn(
        "onCommunityMarkerClick: community key not in promotable set",
        communityKey,
      );
      return;
    }
    this._openCommunityPanel(preview);
  }

  /**
   * Click handler for the on-map event chip markers. Resolves the route
   * id to the loaded event, then opens the same preview as the island
   * without counting the marker click as a map-island interaction.
   */
  onEventMarkerClick(routeId: string): void {
    const event = this._visibleMapEvents().find(
      (e) => e.slug === routeId || e.id === routeId,
    );
    if (!event) {
      console.warn("onEventMarkerClick: event not in visible map set", routeId);
      return;
    }
    // Typesense event hits intentionally contain approximate bounds only.
    // Route through the full Firestore event so selected overlays use the
    // real area polygon/custom markers instead of the search-preview bbox.
    this.openEventPath(event.slug ?? event.id, null);
  }

  openCommunityPath(path: string): void {
    const cleanPath = path.split("?")[0].split("#")[0];
    const slug = decodeURIComponent(
      cleanPath.split("/").filter(Boolean).pop() ?? "",
    );
    if (!slug) {
      return;
    }

    const nextPath = `/map/communities/${encodeURIComponent(slug)}`;
    this.panelBackTarget.set(this._getCurrentPanelBackTarget(nextPath));
    this._location.go(nextPath);
    void this._syncMapPanelStateFromUrl(nextPath);
  }

  exploreCommunitySpots(mode: "all" | "dry"): void {
    const community = this.selectedCommunityLanding();
    if (!community) {
      return;
    }

    this._focusCommunityOnMap(community);
    this.selectedCommunityLanding.set(null);
    this.pendingCommunityLanding.set(null);
    this.panelBackTarget.set(null);

    if (mode === "dry") {
      this.filterChipChanged("dry");
    } else if (this.selectedFilter() === "dry") {
      this.filterChipChanged("");
    } else {
      this.updateMapURL();
    }

    this._openInfoPanel();
  }

  getCommunityFlag(countryCode: string | null | undefined): string {
    const normalizedCode = String(countryCode ?? "")
      .trim()
      .toUpperCase();
    return normalizedCode ? (countries[normalizedCode]?.emoji ?? "") : "";
  }

  openSpotPath(
    spotIdOrSlug: string,
    preview?: Partial<PendingSpotPanel> | null,
  ): void {
    if (!spotIdOrSlug) {
      return;
    }

    const pathId = encodeURIComponent(spotIdOrSlug);
    const nextPath = `/map/spots/${pathId}`;
    if (preview) {
      this._spotPreviewCache.set(spotIdOrSlug, {
        id: String(preview.id ?? spotIdOrSlug),
        slug: preview.slug ?? spotIdOrSlug,
        name: preview.name || $localize`:@@map.spot_loading_fallback:Spot`,
        imageSrc: preview.imageSrc,
        locality: preview.locality,
        rating: preview.rating,
      });
    }
    this.panelBackTarget.set(this._getCurrentPanelBackTarget(nextPath));
    this._location.go(nextPath);

    const routeState = this._parseMapRouteState(nextPath);
    void this._handleURLParamsChange(
      routeState.spotIdOrSlug,
      routeState.showChallenges,
      routeState.challengeId,
      routeState.showEditHistory,
    );
  }

  openEventPath(
    eventIdOrSlug: string,
    event?: PkEvent | null,
    replaceUrl: boolean = false,
    options: { refresh?: boolean } = {},
  ): void {
    if (!eventIdOrSlug) {
      return;
    }

    if (event && !options.refresh) {
      this._eventPreviewCache.set(eventIdOrSlug, event);
      this._eventPreviewCache.set(event.id, event);
      if (event.slug) {
        this._eventPreviewCache.set(event.slug, event);
      }
    }

    const nextPath = `/map/events/${encodeURIComponent(eventIdOrSlug)}`;
    if (replaceUrl) {
      this._location.replaceState(nextPath);
    } else {
      this.panelBackTarget.set(this._getCurrentPanelBackTarget(nextPath));
      this._location.go(nextPath);
    }
    void this._loadEventFromRouteIfPresent(nextPath, {
      previewEvent: event ?? null,
      refresh: options.refresh ?? false,
    });
  }

  private _prepareCommunityPanelOpen(): void {
    this.selectedEvent.set(null);
    this.pendingEventPreview.set(null);
    this._spotLoadRequestVersion++;
    this.selectedSpot.set(null);
    this.pendingSpotPreview.set(null);
    this.selectedPoi.set(null);
    this.closeChallenge(false);
    this.showSpotEditHistory.set(false);
    this.selectedCommunityLanding.set(null);
    this.resetPanelContentToTop();
  }

  goBackToPreviousPanel(): void {
    this._location.back();
  }

  private _getCurrentPanelBackTarget(nextPath: string): PanelBackTarget | null {
    const currentPath = (this._location.path() || this.router.url || "")
      .split("?")[0]
      .split("#")[0];
    const cleanNextPath = nextPath.split("?")[0].split("#")[0];
    if (
      !currentPath ||
      currentPath === cleanNextPath ||
      !/^\/map\/(?:spots|events|communities)\//u.test(currentPath)
    ) {
      return null;
    }

    const label = this._getCurrentPanelBackLabel(currentPath);
    return {
      path: currentPath,
      label,
      typeLabel: this._getCurrentPanelBackTypeLabel(currentPath),
    };
  }

  private _getCurrentPanelBackTypeLabel(path: string): string {
    if (/^\/map\/communities\//u.test(path)) {
      return $localize`:@@map.panel_back_type_community:Community`;
    }
    if (/^\/map\/events\//u.test(path)) {
      return $localize`:@@map.panel_back_type_event:Event`;
    }
    if (/^\/map\/spots\//u.test(path)) {
      return $localize`:@@map.panel_back_type_spot:Spot`;
    }
    return "";
  }

  private _getCurrentPanelBackLabel(path: string): string {
    const community =
      this.selectedCommunityLanding() ?? this.pendingCommunityLanding();
    if (/^\/map\/communities\//u.test(path) && community?.displayName) {
      return community.displayName;
    }

    const event = this.selectedEvent();
    if (/^\/map\/events\//u.test(path) && event) {
      return event.name;
    }

    const pendingEvent = this.pendingEventPreview();
    if (/^\/map\/events\//u.test(path) && pendingEvent) {
      return $localize`:@@map.panel_back_event_fallback:Event`;
    }

    const spot = this.selectedSpot();
    if (/^\/map\/spots\//u.test(path) && spot instanceof Spot) {
      return spot.name();
    }

    const pendingSpot = this.pendingSpotPreview();
    if (/^\/map\/spots\//u.test(path) && pendingSpot) {
      return (
        pendingSpot.name ?? $localize`:@@map.panel_back_spot_fallback:Spot`
      );
    }

    return decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "Map");
  }

  private _isFullCommunityLanding(
    community: MapIslandCommunity | CommunityLandingPageData,
  ): community is CommunityLandingPageData {
    return (
      "topRatedSpots" in community &&
      Array.isArray((community as CommunityLandingPageData).topRatedSpots)
    );
  }

  /** Stores custom filter parameters when using the Filters dialog */
  customFilterParams: WritableSignal<CustomFilterParams | null> = signal(null);

  /** MatDialog for opening the custom filter dialog */
  private _dialog = inject(MatDialog);
  private _searchPreviewRequestVersion = 0;

  /**
   * Google POI clicks are intentionally disabled for now.
   */
  onPoiClick(_event: {
    location: google.maps.LatLngLiteral;
    placeId: string;
  }): void {}

  // Handle click on map background (bubbled up from SpotMap)
  onMapClick(event: google.maps.LatLngLiteral) {
    this.ngZone.run(() => {
      // Clear spot selection
      if (this.selectedSpot()) {
        this._spotLoadRequestVersion++;
        this.selectedSpot.set(null);
      }

      // Clear POI selection
      if (this.selectedPoi()) {
        this.selectedPoi.set(null);
        // also clear the placeholder if it was just loading
      }

      // Tapping the map should also dismiss an open community panel or
      // event preview — the user expects the same "click outside to close"
      // behavior as for spots.
      if (this.selectedEvent()) {
        this.closeEventPreview();
      }
      if (this.selectedCommunityLanding()) {
        this.closeCommunityPanel();
      }

      this.showSpotEditHistory.set(false);
      this.closeChallenge(false);

      // Update URL to remove selected spot/poi
      this.updateMapURL();
    });
  }

  /**
   * Open an event as a preview panel on the map (no navigation away). Used
   * when the user clicks an event card inside the community panel — we want
   * to keep them on the map rather than routing to `/events/<slug>`.
   *
   * Pans the map to the event's bounds when possible so the user sees the
   * relevant area as soon as the preview opens.
   */
  openEventPreview(
    event: PkEvent,
    options: { updateUrl?: boolean; replaceUrl?: boolean } = {},
  ): void {
    const updateUrl = options.updateUrl ?? true;
    const replaceUrl = options.replaceUrl ?? false;
    if (updateUrl) {
      this.openEventPath(event.slug ?? event.id, event, replaceUrl, {
        refresh: true,
      });
      return;
    }

    this._spotLoadRequestVersion++;
    this.selectedSpot.set(null);
    this.pendingSpotPreview.set(null);
    this.selectedPoi.set(null);
    this.selectedCommunityLanding.set(null);
    this.pendingCommunityLanding.set(null);
    this.closeChallenge(false);
    this.showSpotEditHistory.set(false);
    this.pendingEventPreview.set(null);
    this.selectedEvent.set(event);
    this._openInfoPanel();
    this.resetPanelContentToTop();

    const bounds = event.bounds;
    if (this.spotMap && bounds && typeof google !== "undefined") {
      try {
        const latLngBounds = new google.maps.LatLngBounds(
          { lat: bounds.south, lng: bounds.west },
          { lat: bounds.north, lng: bounds.east },
        );
        this.spotMap.focusBounds?.(latLngBounds);
      } catch (err) {
        console.warn("openEventPreview: focusBounds failed", err);
      }
    }
  }

  closeEventPreview(): void {
    if (!this.selectedEvent() && !this.pendingEventPreview()) return;
    this.selectedEvent.set(null);
    this.pendingEventPreview.set(null);
    this.panelBackTarget.set(null);
    this.resetPanelContentToTop();
    // Strip the /event(s)/<id> segment from the URL.
    const cleanUrl = (this.router.url || "").split("?")[0];
    if (/^\/map\/events?\//u.test(cleanUrl)) {
      const queryString =
        (typeof window !== "undefined" && window.location.search) || "";
      this._location.replaceState(`/map${queryString}`);
    }
  }

  /**
   * Close the community landing panel without navigating. Same reasoning as
   * `onIslandOpenCommunity`: a `router.navigate` would remount the map.
   */
  closeCommunityPanel(): void {
    if (!this.selectedCommunityLanding() && !this.pendingCommunityLanding()) {
      return;
    }
    this._communityRouteLoadVersion++;
    this.selectedCommunityLanding.set(null);
    this.pendingCommunityLanding.set(null);
    this.panelBackTarget.set(null);
    this.resetPanelContentToTop();
    // Return from the community panel to the plain map while preserving any
    // query params the map page is using.
    const queryString = window?.location?.search ?? "";
    this._location.replaceState(`/map${queryString}`);
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
    private _usersService: UsersService,
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
    public appSettings: AppSettingsService,
  ) {
    this._alainModeSubscription = GlobalVariables.alainMode.subscribe(
      (value) => {
        this.alainMode = value;
      },
    );

    this.isServer = isPlatformServer(platformId);
    this.selectedCommunityLanding.set(this._getCommunityLandingFromRoute());

    if (isPlatformBrowser(this.platformId)) {
      this._loadEventPromoDismissals();
      const compactSidenavQuery =
        "(min-width: 600px) and (max-width: 767.98px)";
      this.compactSidenavRange.set(
        this.breakpointObserver.isMatched(compactSidenavQuery),
      );
      this._compactSidenavBreakpointSubscription = this.breakpointObserver
        .observe(compactSidenavQuery)
        .subscribe((state) => this.compactSidenavRange.set(state.matches));
    }

    // Communities are admin-curated and small enough for the SEO list to load
    // once. Map object markers/counts are loaded per viewport below.
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        this.loadPromotableCommunitiesAfterConsent();
      });
    }

    // Viewport-driven object fetch: one Typesense multi-search gives us the
    // spot/event/community chip counts plus the event/community marker hits.
    // Debounced 400ms so rapid pans don't fan out into a request per frame.
    effect((onCleanup) => {
      const viewport = this._viewport();
      const objectMode = this.mapObjectMode();
      if (!viewport) return;
      if (typeof google === "undefined" || !google?.maps) return;

      const bbox = viewport.bbox;
      const requestVersion = ++this._mapObjectSearchVersion;
      const handle = setTimeout(() => {
        const bounds = new google.maps.LatLngBounds(
          { lat: bbox.south, lng: bbox.west },
          { lat: bbox.north, lng: bbox.east },
        );
        const searchLimits = this._mapObjectSearchLimits(viewport);
        this._searchService
          .searchMapObjectsInBounds(bounds, {
            eventLimit: searchLimits.events,
            communityLimit: searchLimits.communities,
            includeCountryCommunities: objectMode === "communities",
            viewportZoom: viewport.zoom,
          })
          .then((result) => {
            if (requestVersion !== this._mapObjectSearchVersion) return;
            const visibleCommunities = this._mergeVisibleCommunities(
              result.communities,
              viewport,
            );
            const counts = {
              ...result.counts,
              communities: Math.max(
                result.counts.communities,
                visibleCommunities.length,
              ),
            };

            this._baseMapObjectCounts.set(counts);
            if (this._hasActiveSpotFilter()) {
              this.mapObjectCounts.update((current) => ({
                ...counts,
                spots: current.spots,
              }));
            } else {
              this.mapObjectCounts.set(counts);
            }
            this._visibleMapEvents.set(result.events);
            this._promotableEvents.set(result.promoEvents);
            this._visibleMapCommunities.set(visibleCommunities);
          })
          .catch((err) =>
            console.warn("MapPage: failed to load map objects in bounds", err),
          );
      }, 400);

      onCleanup(() => {
        clearTimeout(handle);
        this._mapObjectSearchVersion++;
      });
    });

    effect(() => {
      const eventSeriesIds = [
        ...new Set(
          [
            ...this._visibleMapEvents(),
            ...this._promotableEvents(),
            ...(this.selectedEvent() ? [this.selectedEvent()!] : []),
          ].flatMap((event) => event.seriesIds),
        ),
      ].filter(Boolean);
      const requestVersion = ++this._visibleEventSeriesLoadVersion;

      if (eventSeriesIds.length === 0) {
        this._visibleEventSeriesById.set({});
        return;
      }

      this._seriesService
        .getSeriesByIds(eventSeriesIds)
        .then((seriesById) => {
          if (requestVersion !== this._visibleEventSeriesLoadVersion) return;
          this._visibleEventSeriesById.set(seriesById);
        })
        .catch((err) => {
          if (requestVersion !== this._visibleEventSeriesLoadVersion) return;
          console.warn("MapPage: failed to load event series metadata", err);
          this._visibleEventSeriesById.set({});
        });
    });

    effect((onCleanup) => {
      const focus = this.communitySpotFocus();
      const viewport = this._viewport();

      if (
        !focus ||
        !viewport ||
        typeof google === "undefined" ||
        !google?.maps
      ) {
        this.focusedCommunitySpotPreviews.set(null);
        return;
      }

      const searchBbox = this._communitySpotSearchBbox(focus, viewport.bbox);
      if (!searchBbox) {
        this.focusedCommunitySpotPreviews.set([]);
        return;
      }

      const requestVersion = ++this._communitySpotSearchVersion;
      const handle = setTimeout(() => {
        this._searchService
          .searchSpotsInRawBounds(
            searchBbox.north,
            searchBbox.south,
            searchBbox.east,
            searchBbox.west,
            focus.scope === "country" ? 120 : 160,
          )
          .then((result) => {
            if (requestVersion !== this._communitySpotSearchVersion) return;

            const previews = (result.hits || [])
              .filter((hit: unknown) => !!hit)
              .map((hit: unknown) =>
                this._searchService.getSpotPreviewFromHit(hit),
              )
              .filter((preview) =>
                this._spotPreviewMatchesCommunityFocus(preview, focus),
              );

            this.focusedCommunitySpotPreviews.set(
              this._dedupeSpotPreviews(previews),
            );
          })
          .catch((err) => {
            if (requestVersion !== this._communitySpotSearchVersion) return;
            console.warn("MapPage: failed to load community focus spots", err);
            this.focusedCommunitySpotPreviews.set([]);
          });
      }, 300);

      onCleanup(() => {
        clearTimeout(handle);
        this._communitySpotSearchVersion++;
      });
    });

    effect(() => {
      // Read all relevant routing state signals so URL stays in sync
      this.selectedSpot();
      this.pendingSpotPreview();
      this.selectedChallenge();
      this.selectedEvent();
      this.pendingEventPreview();
      this.selectedCommunityLanding();
      this.pendingCommunityLanding();
      this.showAllChallenges();
      this.showSpotEditHistory();
      this.selectedFilter(); // Include filter in URL sync
      this.selectedEventFilter();
      this.mapObjectMode();

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

    effect(() => {
      // Only TWO tracked deps: a community arrived/changed, or the map
      // became ready. selectedSpot/selectedChallenge are GUARDS — read
      // with untracked so toggling spot selection doesn't re-fire this
      // effect (which used to cause "click spot → glitches back to
      // community" once the spot was dismissed).
      const communityLanding = this.selectedCommunityLanding();
      const isMapReady = this.mapReady();

      if (!communityLanding) {
        // Don't reset `_lastFocusedCommunityKey` here — a navigation that
        // briefly nulls selectedCommunityLanding (e.g. /map/communities/zurich
        // → /map → /map/communities/zurich again) used to trip a re-focus
        // on the way back. Keeping the last key means re-arriving at the
        // same community is a no-op.
        return;
      }

      if (!isMapReady || !this.spotMap) {
        return;
      }

      const selectedSpot = untracked(() => this.selectedSpot());
      const selectedChallenge = untracked(() => this.selectedChallenge());
      if (selectedSpot || selectedChallenge) {
        return;
      }

      this._openInfoPanel();
      this.resetPanelContentToTop();

      if (this._lastFocusedCommunityKey === communityLanding.communityKey) {
        return;
      }

      if (this._focusCommunityOnMap(communityLanding)) {
        this._debugMapEvent("focusCommunityEffect", {
          communityKey: communityLanding.communityKey,
        });
        this._lastFocusedCommunityKey = communityLanding.communityKey;
      }
    });

    effect((onCleanup) => {
      const isMapReady = this.mapReady();
      const placeId = this.searchPreviewPlaceId();

      if (!isMapReady || !this.spotMap || !placeId) {
        return;
      }

      const requestVersion = ++this._searchPreviewRequestVersion;
      let isCancelled = false;

      this.mapsService
        .getGooglePlaceById(placeId)
        .then((place) => {
          if (isCancelled) {
            return;
          }

          if (requestVersion !== this._searchPreviewRequestVersion) {
            return;
          }

          if (this.searchPreviewPlaceId() !== placeId) {
            return;
          }

          this._focusGooglePlace(place);
        })
        .catch((error) => {
          if (!isCancelled) {
            console.error(
              "[ERROR search place preview] Error fetching place:",
              error,
            );
          }
        });

      onCleanup(() => {
        isCancelled = true;
      });
    });

    effect(() => {
      const isMapReady = this.mapReady();
      const community = this.searchPreviewCommunity();
      if (!isMapReady || !this.spotMap || !community) {
        return;
      }

      this._focusCommunityPreviewOnMap(community);
    });

    // Effect to update meta tags when spot/challenge changes (for client-side navigation)
    effect(() => {
      const spot = this.selectedSpot();
      const challenge = this.selectedChallenge();

      if (challenge && challenge instanceof SpotChallenge) {
        const spotPathSegment = challenge.spot.slug ?? challenge.spot.id;
        this.metaTagService.setChallengeMetaTags(
          challenge,
          buildSpotChallengeCanonicalPath(spotPathSegment, challenge.id),
        );
      } else if (spot) {
        const canonicalPath =
          spot instanceof Spot
            ? buildSpotCanonicalPath(spot.slug ?? spot.id)
            : undefined;
        this.metaTagService.setSpotMetaTags(spot, canonicalPath);
      } else if (!this.isServer) {
        this.metaTagService.setDefaultMapMetaTags("/map");
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
                (item) => new SpotEdit(item.id, item.schema),
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

    // Keep a lightweight pending-edit count for the selected spot so the
    // main detail view can show that voting/review is pending.
    effect((onCleanup) => {
      const spot = this.selectedSpot();

      if (!(spot instanceof Spot)) {
        this.pendingSpotEditsCount.set(0);
        return;
      }

      const pendingSub = this._spotEditsService
        .getSpotEditsBySpotId$(spot.id)
        .subscribe({
          next: (editsWithIds) => {
            const pendingCount = editsWithIds.filter(
              (item) => item.schema.approved !== true,
            ).length;
            this.pendingSpotEditsCount.set(pendingCount);
          },
          error: (err) => {
            console.error("Error loading pending spot edits count:", err);
            this.pendingSpotEditsCount.set(0);
          },
        });

      onCleanup(() => {
        pendingSub.unsubscribe();
      });
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

  setVisibleSpots(spots: Spot[]) {
    if (!spots || spots.length === 0) {
      this.visibleSpots = [];
      return;
    }

    this.visibleSpots = spots;
  }

  // Initialization ///////////////////////////////////////////////////////////

  private loadPromotableCommunitiesAfterConsent(): void {
    if (
      this._promotableCommunitiesRequested ||
      !this._consentService.hasConsent()
    ) {
      return;
    }

    this._promotableCommunitiesRequested = true;
    this._searchService
      .listCommunities()
      .then((communities) => {
        this._promotableCommunities.set(communities);
        this._refreshVisibleCommunitiesFromLoadedList();
        this._focusCommunityFromQueryParam();
      })
      .catch((err) =>
        console.warn("MapPage: failed to load promotable communities", err),
      );
  }

  private _refreshVisibleCommunitiesFromLoadedList(): void {
    const viewport = this._viewport();
    if (!viewport) {
      return;
    }

    const visibleCommunities = this._mergeVisibleCommunities(
      this._visibleMapCommunities(),
      viewport,
    );
    if (visibleCommunities.length === 0) {
      return;
    }

    this._visibleMapCommunities.set(visibleCommunities);
    this._baseMapObjectCounts.update((counts) => ({
      ...counts,
      communities: Math.max(counts.communities, visibleCommunities.length),
    }));
    this.mapObjectCounts.update((counts) => ({
      ...counts,
      communities: Math.max(counts.communities, visibleCommunities.length),
    }));
  }

  private _mergeVisibleCommunities(
    searchCommunities: CommunitySearchPreview[],
    viewport: VisibleViewport,
  ): CommunitySearchPreview[] {
    const visibleByKey = new Map<string, CommunitySearchPreview>();

    for (const community of searchCommunities) {
      const key = community.communityKey || community.id || community.slug;
      if (key) {
        visibleByKey.set(key, community);
      }
    }

    for (const community of this._visibleCommunitiesFromLoadedList(viewport)) {
      const key = community.communityKey || community.id || community.slug;
      if (key && !visibleByKey.has(key)) {
        visibleByKey.set(key, community);
      }
    }

    return [...visibleByKey.values()];
  }

  private _visibleCommunitiesFromLoadedList(
    viewport: VisibleViewport,
  ): CommunitySearchPreview[] {
    const bbox = viewport.bbox;
    const coversWorld = this._bboxCoversWorld(bbox);

    return this._promotableCommunities()
      .filter(
        (community) =>
          community.scope === "locality" &&
          !!community.boundsCenter &&
          typeof community.boundsRadiusM === "number" &&
          community.boundsRadiusM > 0,
      )
      .filter(
        (community) =>
          coversWorld || this._communityIntersectsBbox(community, bbox),
      );
  }

  private _communityIntersectsBbox(
    community: CommunitySearchPreview,
    bbox: MapViewportBbox,
  ): boolean {
    if (
      !community.boundsCenter ||
      typeof community.boundsRadiusM !== "number"
    ) {
      return false;
    }

    const [lat, lng] = community.boundsCenter;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return false;
    }

    const radiusM = community.boundsRadiusM;
    const latRadius = radiusM / 111_320;
    const lngRadius =
      radiusM / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
    const communityBounds = {
      north: lat + latRadius,
      south: lat - latRadius,
      west: lng - lngRadius,
      east: lng + lngRadius,
    };

    return this._bboxesIntersect(communityBounds, bbox);
  }

  private _bboxesIntersect(a: MapViewportBbox, b: MapViewportBbox): boolean {
    if (a.north < b.south || a.south > b.north) {
      return false;
    }

    const aLngIntervals = this._longitudeIntervals(a);
    const bLngIntervals = this._longitudeIntervals(b);
    return aLngIntervals.some(([aWest, aEast]) =>
      bLngIntervals.some(([bWest, bEast]) => aEast >= bWest && aWest <= bEast),
    );
  }

  private _longitudeIntervals(
    bbox: Pick<MapViewportBbox, "east" | "west">,
  ): Array<[number, number]> {
    if (this._bboxCoversWorld(bbox)) {
      return [[-180, 180]];
    }

    const west = this._normalizeLongitude(bbox.west);
    const east = this._normalizeLongitude(bbox.east);
    return west <= east
      ? [[west, east]]
      : [
          [west, 180],
          [-180, east],
        ];
  }

  private _bboxCoversWorld(bbox: Pick<MapViewportBbox, "east" | "west">) {
    const span = Math.abs(bbox.east - bbox.west);
    return span >= 340;
  }

  private _normalizeLongitude(lng: number): number {
    const normalized = ((((lng + 180) % 360) + 360) % 360) - 180;
    return normalized === -180 && lng > 0 ? 180 : normalized;
  }

  ngOnInit() {
    console.debug("map page init");

    // Trigger Google Maps API loading since this page needs it
    // this.tryLoadMapsApi(); // TODO wtf

    if (this.checkInEnabled) {
      this.checkInService.showGlobalChip.set(false);
    }

    // Keep user-private saved spot state in sync for the "saved" chip/filter.
    this.isSignedIn.set(this.authService.isSignedIn);
    this._authStateSubscription = this.authService.authState$.subscribe(
      (authUser) => {
        const uid = authUser?.uid ?? null;
        this.isSignedIn.set(!!uid);
        this._syncPrivateDataSubscription(uid);

        // If user signs out while a private filter is active, clear it.
        if (
          !uid &&
          (this.selectedFilter() === "saved" ||
            this.selectedFilter() === "visited")
        ) {
          this.filterChipChanged("");
        }

        if (!uid) {
          setTimeout(() => this._redirectSignedOutSpotEditHistory(), 0);
        }
      },
    );

    // Listen for consent changes to retry Maps API loading when consent is granted
    this._consentSubscription = this._consentService.consentGranted$.subscribe(
      (hasConsent) => {
        if (hasConsent && !this.mapsService.isApiLoaded()) {
          this.tryLoadMapsApi();
        }
        if (hasConsent) {
          this.loadPromotableCommunitiesAfterConsent();
        }
      },
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

    this.selectedCommunityLanding.set(this._getCommunityLandingFromRoute());

    // Parse URL to handle legacy `/map/:spot` and canonical
    // `/map/spots/:spot` shapes consistently.
    const routeState = this._parseMapRouteState(this.router.url);
    const urlParts = this.router.url.split("/").filter((segment) => segment);
    // urlParts will be like ['map', 'spotId', 'edits'] or ['map', 'spotId', 'c', 'challengeId']

    console.debug("DEBUG ngOnInit URL parsing:", {
      url: this.router.url,
      urlParts,
      spotIdOrSlug: routeState.spotIdOrSlug,
      showChallenges: routeState.showChallenges,
      challengeId: routeState.challengeId,
      showEditHistory: routeState.showEditHistory,
    });

    void this.pendingTasks.run(async () => {
      await this._loadEventFromRouteIfPresent(this.router.url);
      await this._handleURLParamsChange(
        routeState.spotIdOrSlug,
        routeState.showChallenges,
        routeState.challengeId,
        routeState.showEditHistory,
        contentData?.spot || null,
        contentData?.challenge || null,
      );
    });

    const queryIndex = this.router.url.indexOf("?");
    const initialQuery =
      queryIndex >= 0 ? this.router.url.slice(queryIndex + 1) : "";
    this._syncMapQueryStateFromParams(new URLSearchParams(initialQuery));
    this._pendingCommunityFocusSlug =
      this.activatedRoute.snapshot.queryParamMap.get("community");

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
        .getSpotIdFromSpotSlug(spotIdOrSlug)
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
          this._focusCommunityFromQueryParam();
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
          void this._syncFullMapStateFromUrl(navEvent.urlAfterRedirects);
          // Also extract filter query param from URL to keep it in sync
          const queryIndex = navEvent.urlAfterRedirects.indexOf("?");
          const queryString =
            queryIndex >= 0
              ? navEvent.urlAfterRedirects.substring(queryIndex + 1)
              : "";
          const params = new URLSearchParams(queryString);
          this._syncMapQueryStateFromParams(params);
          this._pendingCommunityFocusSlug = params.get("community");
          this._focusCommunityFromQueryParam();
        });

      this._locationSubscription = this._location.subscribe((event) => {
        const url = event.url || "";
        if (!url.startsWith("/map")) {
          return;
        }

        // Event and community previews patch history with Location.go() so
        // the map stays mounted. Browser back/forward can therefore update
        // the address bar without a fresh router resolver pass; keep the
        // selected panel state in step with that URL here.
        void this._syncFullMapStateFromUrl(url);
        const queryIndex = url.indexOf("?");
        const params = new URLSearchParams(
          queryIndex >= 0 ? url.substring(queryIndex + 1) : "",
        );
        this._syncMapQueryStateFromParams(params);
        this._pendingCommunityFocusSlug = params.get("community");
        this._focusCommunityFromQueryParam();
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

  async _handleURLParamsChange(
    spotIdOrSlug: string | null,
    showChallenges: boolean,
    challengeId: string | null,
    showEditHistory: boolean,
    resolvedSpot: Spot | null = null,
    resolvedChallenge: SpotChallenge | null = null,
  ): Promise<void> {
    if (
      showEditHistory &&
      spotIdOrSlug &&
      this._redirectSignedOutSpotEditHistory(spotIdOrSlug)
    ) {
      showEditHistory = false;
    }

    if (challengeId && spotIdOrSlug) {
      // open the spot on a challenge
      if (resolvedChallenge) {
        this.selectChallenge(resolvedChallenge, false);
      } else {
        const selectedSpot = this.selectedSpot();
        if (selectedSpot && selectedSpot instanceof Spot) {
          await this.loadChallengeById(selectedSpot, challengeId, false);
        } else if (!selectedSpot) {
          // load the spot by id then the challenge
        } else {
          // the spot is a local spot
          console.error(
            "Cannot open a challenge of a local spot, it should not have one!",
          );
        }
      }
    } else if (spotIdOrSlug) {
      if (this.selectedChallenge()) this.closeChallenge();
      this.showAllChallenges.set(showChallenges);
      this.showSpotEditHistory.set(showEditHistory);
      const pendingPreview = this._spotPreviewCache.get(spotIdOrSlug);

      // If we already have the resolved spot, use it
      if (resolvedSpot && this.selectedSpot() !== resolvedSpot) {
        this.selectSpot(resolvedSpot, false);
      } else if (this.selectedSpotIdOrSlug() !== spotIdOrSlug) {
        this._openPendingSpotPanel(
          pendingPreview ?? {
            id: spotIdOrSlug,
            slug: spotIdOrSlug,
          },
          false,
        );
        const spotId = await this._getSpotIdFromSlugOrId(spotIdOrSlug);
        if (!spotId) {
          console.warn("Could not get spot id from slug or id.");
          return;
        }

        // open the spot
        await this.loadSpotById(spotId as SpotId, false);
      }
    } else {
      // close the spot
      this.closeSpot(false);
      this.showAllChallenges.set(false);
    }
  }

  openSpotOrGooglePlace(value: {
    type: "place" | "spot" | "community" | "event";
    id: string;
    community?: CommunitySearchPreview;
    event?: { id: string; slug?: string };
    spot?: {
      name?: string;
      slug?: string;
      imageSrc?: string;
      locality?: string;
      rating?: number;
    };
  }) {
    this.clearSearchPlacePreview();

    if (value.type === "place") {
      this.openGooglePlaceById(value.id);
      return;
    }

    if (value.type === "event") {
      // Search dispatched an event hit. The preview panel's route guard
      // loads the full document — we just navigate by slug/id.
      const slugOrId = value.event?.slug ?? value.event?.id ?? value.id;
      this.openEventPath(slugOrId, null);
      return;
    }

    if (value.type === "community") {
      const communityPreview =
        value.community ??
        [
          ...this._visibleMapCommunities(),
          ...this._promotableCommunities(),
        ].find(
          (community) =>
            community.slug === value.id ||
            community.communityKey === value.id ||
            community.id === value.id,
        );

      if (communityPreview) {
        this.onIslandOpenCommunity(communityPreview);
        return;
      }

      this.openCommunityPath(
        `/map/communities/${encodeURIComponent(value.id)}`,
      );
      return;
    }

    this.openSpotPath(value.spot?.slug ?? value.id, {
      id: value.id,
      name: value.spot?.name,
      imageSrc: value.spot?.imageSrc,
      locality: value.spot?.locality,
      rating: value.spot?.rating,
    });
  }

  onSearchCommunityPreviewChange(community: CommunitySearchPreview | null) {
    this.searchPreviewCommunity.set(community);
  }

  onSearchPlacePreviewChange(placeId: string | null) {
    if (placeId === this.searchPreviewPlaceId()) {
      return;
    }

    if (!placeId) {
      this.clearSearchPlacePreview();
      return;
    }

    this.searchPreviewPlaceId.set(placeId);
  }

  private clearSearchPlacePreview() {
    this._searchPreviewRequestVersion += 1;
    this.searchPreviewPlaceId.set(null);
  }

  openGooglePlaceById(id: string) {
    this.clearSearchPlacePreview();
    console.debug("[DEBUG openGooglePlaceById] Opening place with id:", id);
    this.mapsService
      .getGooglePlaceById(id)
      .then((place) => {
        console.debug("[DEBUG openGooglePlaceById] Got place:", place);
        this._focusGooglePlace(place);
      })
      .catch((err) => {
        console.error("[ERROR openGooglePlaceById] Error fetching place:", err);
      });
  }

  private _focusGooglePlace(place: google.maps.places.Place) {
    if (!place?.location) {
      console.warn("[WARN focusGooglePlace] No location found");
      return;
    }

    const viewport = (place as any).viewport as
      | google.maps.LatLngBounds
      | undefined;
    if (viewport) {
      this.spotMap?.focusBounds(viewport);
      return;
    }

    const zoomLevel = this.mapsService.getZoomForPlaceType(place);
    const lat = (place.location as any).lat();
    const lng = (place.location as any).lng();

    this.spotMap?.focusPoint({ lat, lng }, zoomLevel);
  }

  async loadSpotById(
    spotId: SpotId,
    updateUrl: boolean = true,
    preview?: Partial<PendingSpotPanel> | null,
  ): Promise<Spot> {
    console.debug("loading spot by id", spotId);
    const requestVersion = ++this._spotLoadRequestVersion;
    if (preview) {
      this._openPendingSpotPanel(
        {
          id: String(preview.id ?? spotId),
          slug: preview.slug,
          name: preview.name,
          imageSrc: preview.imageSrc,
          locality: preview.locality,
          rating: preview.rating,
        },
        updateUrl,
      );
    }

    // Retry loading the spot if it's not yet populated by the cloud function
    let lastError: any;
    const maxAttempts = 15;
    const delayMs = 200;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const spot: Spot = await this._spotsService.getSpotById(
          spotId,
          this.locale,
        );
        if (requestVersion !== this._spotLoadRequestVersion) {
          return spot;
        }
        this.pendingSpotPreview.set(null);
        this.selectSpot(spot, updateUrl);
        return spot;
      } catch (error) {
        lastError = error;
        console.debug(
          `Attempt ${
            attempt + 1
          }/${maxAttempts} to load spot failed, retrying...`,
          error,
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

  private _openPendingSpotPanel(
    preview: PendingSpotPanel,
    updateUrl: boolean,
  ): void {
    this.selectedEvent.set(null);
    this.pendingEventPreview.set(null);
    this.selectedCommunityLanding.set(null);
    this.pendingCommunityLanding.set(null);
    this.selectedSpot.set(null);
    this.selectedPoi.set(null);
    this.closeChallenge(false);
    this.showSpotEditHistory.set(false);
    this.pendingSpotPreview.set(preview);
    this._openInfoPanel();
    this.resetPanelContentToTop();

    if (updateUrl) {
      this.updateMapURL();
    }
  }

  async loadChallengeById(
    spot: Spot,
    challengeId: string,
    updateUrl: boolean = true,
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

  private _cloneCustomFilterParams(
    params: CustomFilterParams | null | undefined,
  ): CustomFilterParams | null {
    if (!params) {
      return null;
    }

    return {
      types: [...(params.types ?? [])],
      accesses: [...(params.accesses ?? [])],
      amenities_true: [...(params.amenities_true ?? [])],
      amenities_false: [...(params.amenities_false ?? [])],
    };
  }

  private _getPresetFilterParams(
    filterParam: string,
  ): CustomFilterParams | null {
    const filterConfig = getFilterConfig(
      getFilterModeFromUrlParam(filterParam),
    );
    if (!filterConfig) {
      return null;
    }

    return {
      types: [...(filterConfig.types ?? [])],
      accesses: [...(filterConfig.accesses ?? [])],
      amenities_true: [...(filterConfig.amenities_true ?? [])],
      amenities_false: [...(filterConfig.amenities_false ?? [])],
    };
  }

  private _getEditableFilterParams(): {
    params: CustomFilterParams | null;
    seededFromQuickFilter: boolean;
  } {
    const customParams = this._cloneCustomFilterParams(
      this.customFilterParams(),
    );
    if (customParams) {
      return {
        params: customParams,
        seededFromQuickFilter: false,
      };
    }

    const presetParams = this._getPresetFilterParams(this.selectedFilter());
    return {
      params: presetParams,
      seededFromQuickFilter: !!presetParams,
    };
  }

  private _toSortedUniqueList<T extends string>(
    values: readonly T[] | null | undefined,
  ): T[] {
    return [...new Set(values ?? [])].sort();
  }

  private _hasFilters(params: CustomFilterParams | null | undefined): boolean {
    if (!params) {
      return false;
    }

    return (
      (params.types?.length ?? 0) > 0 ||
      (params.accesses?.length ?? 0) > 0 ||
      (params.amenities_true?.length ?? 0) > 0 ||
      (params.amenities_false?.length ?? 0) > 0
    );
  }

  private _areFilterParamsEqual(
    left: CustomFilterParams | null | undefined,
    right: CustomFilterParams | null | undefined,
  ): boolean {
    if (!left && !right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    return (
      JSON.stringify(this._toSortedUniqueList(left.types)) ===
        JSON.stringify(this._toSortedUniqueList(right.types)) &&
      JSON.stringify(this._toSortedUniqueList(left.accesses)) ===
        JSON.stringify(this._toSortedUniqueList(right.accesses)) &&
      JSON.stringify(this._toSortedUniqueList(left.amenities_true)) ===
        JSON.stringify(this._toSortedUniqueList(right.amenities_true)) &&
      JSON.stringify(this._toSortedUniqueList(left.amenities_false)) ===
        JSON.stringify(this._toSortedUniqueList(right.amenities_false))
    );
  }

  private _getMatchingPresetFilter(
    params: CustomFilterParams | null | undefined,
  ): string | null {
    if (!params) {
      return null;
    }

    for (const filterMode of [
      SpotFilterMode.ForParkour,
      SpotFilterMode.Dry,
      SpotFilterMode.Indoor,
      SpotFilterMode.Lighting,
      SpotFilterMode.Water,
    ]) {
      const presetParams = this._getPresetFilterParams(filterMode);
      if (this._areFilterParamsEqual(params, presetParams)) {
        return filterMode;
      }
    }

    return null;
  }

  clearActiveFilter(): void {
    this._trackMapIslandInteraction("dismiss", {
      kind: "filter",
      message: $localize`:Filter helper text@@filter_helper_text:There are no spots matching the filter in this area.`,
    });
    this.filterChipChanged("");
  }

  onSearchContextClear(): void {
    if (this.selectedFilter() || this.customFilterParams()) {
      this.clearActiveFilter();
      return;
    }

    if (this.mapObjectMode() !== "all") {
      this.mapObjectModeChanged("all");
    }
  }

  mapObjectModeChanged(mode: MapObjectMode): void {
    if (mode === this.mapObjectMode()) return;

    if (mode !== "all" && mode !== "spots" && this._hasActiveSpotFilter()) {
      this._clearSpotFilterState();
    }
    if (mode !== "events" && this.selectedEventFilter()) {
      this.selectedEventFilter.set("");
    }

    this.mapObjectMode.set(mode);
  }

  private _syncMapQueryStateFromParams(params: URLSearchParams): void {
    const filterParam = params.get("filter") ?? "";
    if (this.selectedFilter() !== filterParam) {
      this.filterChipChanged(filterParam);
    }

    const eventFilterParam = params.get("eventFilter") ?? "";
    if (this._isMapEventFilter(eventFilterParam)) {
      if (this.selectedEventFilter() !== eventFilterParam) {
        this.eventFilterChanged(eventFilterParam);
      }
    } else if (this.selectedEventFilter()) {
      this.eventFilterChanged("");
    }

    const typeParam = params.get("type");
    const mode = this._isMapObjectMode(typeParam)
      ? typeParam
      : filterParam
        ? "spots"
        : eventFilterParam
          ? "events"
          : "all";
    if (this.mapObjectMode() !== mode) {
      this.mapObjectMode.set(mode);
    }
    if (mode !== "all" && mode !== "spots" && this._hasActiveSpotFilter()) {
      this._clearSpotFilterState();
    }
    if (mode !== "events" && this.selectedEventFilter()) {
      this.selectedEventFilter.set("");
    }
  }

  private _isMapObjectMode(value: string | null): value is MapObjectMode {
    return (
      value === "all" ||
      value === "spots" ||
      value === "events" ||
      value === "communities"
    );
  }

  private _isMapEventFilter(value: string | null): value is MapEventFilter {
    return (
      value === "live" ||
      value === "competition" ||
      value === "jam" ||
      value === "camp"
    );
  }

  private _pluralizeMapObjectCount(
    count: number,
    singular: string,
    plural: string,
  ): string {
    return count === 1 ? singular : plural;
  }

  private _mapObjectModeLabel(mode: MapObjectMode): string {
    switch (mode) {
      case "spots":
        return $localize`:@@map_search_context_spots:Spots`;
      case "events":
        return $localize`:@@map_search_context_events:Events`;
      case "communities":
        return $localize`:@@map_search_context_communities:Communities`;
      case "all":
      default:
        return $localize`:@@map_search_context_all:All`;
    }
  }

  private _eventFilterLabel(filter: MapEventFilter): string {
    switch (filter) {
      case "live":
        return $localize`:@@map_event_filter.live:Live`;
      case "competition":
        return $localize`:@@event_category.competition:Competition`;
      case "jam":
        return $localize`:@@event_category.jam:Jam`;
      case "camp":
        return $localize`:@@event_category.camp:Camp`;
    }
  }

  private _displayMapObjectCounts(): MapObjectCounts {
    const counts = this.mapObjectCounts();
    const eventFilter = this.selectedEventFilter();
    if (!eventFilter) {
      return counts;
    }

    return {
      ...counts,
      events: this.filteredVisibleMapEvents().length,
    };
  }

  private _filterEvents(
    events: readonly PkEvent[],
    filter: MapEventFilter | "",
  ): PkEvent[] {
    if (!filter) {
      return [...events];
    }

    if (filter === "live") {
      const now = new Date();
      return events.filter((event) => event.isLive(now));
    }

    return events.filter((event) =>
      event.eventCategories.includes(filter as EventCategory),
    );
  }

  private _spotFilterLabel(filter: string): string {
    switch (filter) {
      case SpotFilterMode.ForParkour:
        return $localize`:@@for_parkour_spots_chip_label:For Parkour`;
      case SpotFilterMode.Dry:
        return $localize`:@@dry_spots_chip_label:Dry`;
      case SpotFilterMode.Indoor:
        return $localize`:@@indoor_spots_chip_label:Indoor`;
      case SpotFilterMode.Lighting:
        return $localize`:@@lighting_spots_chip_label:Lighting`;
      case SpotFilterMode.Water:
        return $localize`:@@water_spots_chip_label:Water`;
      case "saved":
        return $localize`:@@saved_spots_chip_label:Saved`;
      case "visited":
        return $localize`:@@visited_spots_chip_label:Visited`;
      case SpotFilterMode.Custom:
      default:
        return $localize`:@@map_search_context_custom_filter:Custom Filter`;
    }
  }

  private _hasActiveSpotFilter(): boolean {
    return Boolean(this.selectedFilter() || this.customFilterParams());
  }

  private _setFilteredSpotCount(count: number): void {
    this.mapObjectCounts.update((current) => ({
      ...current,
      spots: Math.max(0, Math.round(count)),
    }));
  }

  private _restoreBaseMapObjectCounts(): void {
    this.mapObjectCounts.set(this._baseMapObjectCounts());
  }

  private _clearSpotFilterState(): void {
    this._activeFilter = "";
    this._pendingFilter = null;
    this.noSpotsForFilter.set(false);
    this.highlightedSpots = [];
    this.visibleSpots = [];
    this.customFilterParams.set(null);
    this._restoreBaseMapObjectCounts();
    if (this.spotMap) {
      this.spotMap.spotFilterMode.set(SpotFilterMode.None);
    }
    if (this.selectedFilter()) {
      this.selectedFilter.set("");
    }
  }

  private _setFilteredSpotPreviews(
    previews: SpotPreviewData[],
    totalCount: number = previews.length,
  ): void {
    this.spotMap?.setFilteredSpots(previews);
    this._updateNoSpotsForFilter(previews);
    this._setFilteredSpotCount(totalCount);
  }

  private _updateNoSpotsForFilter(previews: SpotPreviewData[]): void {
    const activeFilter = this._activeFilter || this.selectedFilter();
    if (!activeFilter) {
      this.noSpotsForFilter.set(false);
      return;
    }

    const baseVisibleSpots =
      this.spotMap?.visibleSpots?.() ?? this.visibleSpots;
    this.noSpotsForFilter.set(
      previews.length === 0 && baseVisibleSpots.length > 0,
    );
  }

  /**
   * Handle filter bounds change - re-run the filter search for the new bounds.
   */
  onFilterBoundsChange(bounds: google.maps.LatLngBounds): void {
    if (!this._activeFilter || !this.spotMap) return;

    if (this._activeFilter === "saved") {
      void this._applySavedFilter(bounds);
      return;
    }
    if (this._activeFilter === "visited") {
      void this._applyVisitedFilter(bounds);
      return;
    }

    // Handle custom filter mode with stored params
    if (this._activeFilter === "custom") {
      const customParams = this.customFilterParams();
      if (!customParams) return;

      this._searchService
        .searchSpotsWithCustomFilter(
          bounds,
          customParams,
          10,
          this._viewport()?.zoom,
        )
        .then((result) => {
          const previews: SpotPreviewData[] = (result.hits || [])
            .filter((h: any) => !!h)
            .map((hit: any) => this._searchService.getSpotPreviewFromHit(hit));

          this._setFilteredSpotPreviews(
            previews,
            result.found ?? previews.length,
          );
        })
        .catch((err) => {
          console.error(
            "Error re-searching custom filter on bounds change:",
            err,
          );
        });
      return;
    }

    // Handle preset filter modes
    const filterMode = getFilterModeFromUrlParam(this._activeFilter);
    if (filterMode === SpotFilterMode.None) return;

    this._searchService
      .searchSpotsInBoundsWithFilter(
        bounds,
        filterMode,
        10,
        this._viewport()?.zoom,
      )
      .then((result) => {
        const previews: SpotPreviewData[] = (result.hits || [])
          .filter((h: any) => !!h)
          .map((hit: any) => this._searchService.getSpotPreviewFromHit(hit));

        this._setFilteredSpotPreviews(
          previews,
          result.found ?? previews.length,
        );
      })
      .catch((err) => {
        console.error("Error re-searching for filter on bounds change:", err);
      });
  }

  filterChipChanged(selectedChip: string) {
    if (!selectedChip || selectedChip.length === 0) {
      this._clearSpotFilterState();
      return;
    }

    if (this.mapObjectMode() === "all") {
      this.mapObjectMode.set("spots");
    }
    if (this.selectedEventFilter()) {
      this.selectedEventFilter.set("");
    }

    // Update the selectedFilter signal for URL sync and chip binding
    // Only update signal if it's different to avoid infinite effect loops
    if (this.selectedFilter() !== (selectedChip || "")) {
      this.selectedFilter.set(selectedChip || "");
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
    if (selectedChip === "saved") {
      if (!this.isSignedIn()) {
        this._snackbar.open($localize`Sign in to view saved spots`, "OK", {
          duration: 2500,
        });
        this.filterChipChanged("");
        return;
      }

      // Reuse Custom mode to trigger filterBoundsChange on pan for this user-defined filter.
      if (this.spotMap) {
        this.spotMap.spotFilterMode.set(SpotFilterMode.Custom);
      }

      const bounds = this.spotMap?.bounds;
      if (!bounds) {
        console.debug("Saved filter set, waiting for bounds...");
        return;
      }

      if (this.selectedSpot()) {
        this._spotLoadRequestVersion++;
        this.selectedSpot.set(null);
      }

      void this._applySavedFilter(bounds);
      return;
    }

    if (selectedChip === "visited") {
      if (!this.isSignedIn()) {
        this._snackbar.open($localize`Sign in to view visited spots`, "OK", {
          duration: 2500,
        });
        this.filterChipChanged("");
        return;
      }

      // Reuse Custom mode to trigger filterBoundsChange on pan for this user-defined filter.
      if (this.spotMap) {
        this.spotMap.spotFilterMode.set(SpotFilterMode.Custom);
      }

      const bounds = this.spotMap?.bounds;
      if (!bounds) {
        console.debug("Visited filter set, waiting for bounds...");
        return;
      }

      if (this.selectedSpot()) {
        this._spotLoadRequestVersion++;
        this.selectedSpot.set(null);
      }

      void this._applyVisitedFilter(bounds);
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
      this._spotLoadRequestVersion++;
      this.selectedSpot.set(null);
    }

    // Generic filter search
    console.log(`Searching for ${selectedChip} spots in bounds:`, bounds);

    this._searchService
      .searchSpotsInBoundsWithFilter(
        bounds,
        filterMode,
        10,
        this._viewport()?.zoom,
      )
      .then((result) => {
        const hits = result.hits || [];
        console.log(`Found ${selectedChip} spots:`, hits);

        const previews: SpotPreviewData[] = hits
          .filter((h: any) => !!h)
          .map((hit: any) => this._searchService.getSpotPreviewFromHit(hit));

        this._setFilteredSpotPreviews(
          previews,
          result.found ?? previews.length,
        );
      })
      .catch((err) => {
        console.error(`Error searching for ${selectedChip} spots:`, err);
      });
  }

  eventFilterChanged(selectedFilter: string): void {
    const filter = this._isMapEventFilter(selectedFilter) ? selectedFilter : "";
    if (filter && this.mapObjectMode() !== "events") {
      this.mapObjectMode.set("events");
    }

    this.selectedEventFilter.set(
      this.selectedEventFilter() === filter ? "" : filter,
    );
  }

  /**
   * Opens the custom filter dialog and applies the selected filters.
   */
  openCustomFilterDialog(): void {
    if (this.mapObjectMode() === "all") {
      this.mapObjectMode.set("spots");
    }
    if (this.selectedEventFilter()) {
      this.selectedEventFilter.set("");
    }

    const editableState = this._getEditableFilterParams();
    const dialogRef = this._dialog.open(CustomFilterDialogComponent, {
      width: "400px",
      maxWidth: "90vw",
      maxHeight: "90vh",
      data: {
        currentParams: editableState.params,
        seededFromQuickFilter: editableState.seededFromQuickFilter,
      },
    });

    dialogRef.afterClosed().subscribe((result: CustomFilterParams | null) => {
      if (!result) {
        // User cancelled - do nothing
        return;
      }

      if (!this._hasFilters(result)) {
        // Clear custom filter and reset to no filter
        this.customFilterParams.set(null);
        this.filterChipChanged("");
        return;
      }

      const matchingPreset = this._getMatchingPresetFilter(result);
      if (matchingPreset) {
        this.customFilterParams.set(null);
        this.filterChipChanged(matchingPreset);
        return;
      }

      // Store the custom filter params
      this.customFilterParams.set(this._cloneCustomFilterParams(result));

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
        this._spotLoadRequestVersion++;
        this.selectedSpot.set(null);
      }

      console.log("Searching with custom filter:", result);

      this._searchService
        .searchSpotsWithCustomFilter(bounds, result, 10, this._viewport()?.zoom)
        .then((searchResult) => {
          const hits = searchResult.hits || [];
          console.log("Found custom filter spots:", hits);

          const previews: SpotPreviewData[] = hits
            .filter((h: any) => !!h)
            .map((hit: any) => this._searchService.getSpotPreviewFromHit(hit));

          this._setFilteredSpotPreviews(
            previews,
            searchResult.found ?? previews.length,
          );
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
    const pendingSpot = this.pendingSpotPreview();
    const selectedChallenge = this.selectedChallenge();
    const showEditHistory = this.showSpotEditHistory();
    const activeFilter = this.selectedFilter();
    const activeEventFilter = this.selectedEventFilter();
    const communityLanding = this.selectedCommunityLanding();
    const pendingCommunityLanding = this.pendingCommunityLanding();
    const selectedEvent = this.selectedEvent();
    const pendingEvent = this.pendingEventPreview();
    const mapObjectMode = this.mapObjectMode();

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
      path = buildSpotChallengeCanonicalPath(
        spot.slug ?? spot.id,
        selectedChallenge.id,
      );
    } else if (spot && showEditHistory) {
      path = buildSpotEditHistoryCanonicalPath(spot.slug ?? spot.id);
    } else if (spot && this.showAllChallenges()) {
      path = buildSpotChallengeCanonicalPath(spot.slug ?? spot.id);
    } else if (spot) {
      path = buildSpotCanonicalPath(spot.slug ?? spot.id);
    } else if (pendingSpot) {
      path = buildSpotCanonicalPath(pendingSpot.slug ?? pendingSpot.id);
    } else if (selectedEvent) {
      path = `/map/events/${encodeURIComponent(
        selectedEvent.slug ?? selectedEvent.id,
      )}`;
    } else if (pendingEvent) {
      path = `/map/events/${encodeURIComponent(pendingEvent.idOrSlug)}`;
    } else if (communityLanding) {
      path = communityLanding.canonicalPath;
    } else if (pendingCommunityLanding?.canonicalPath) {
      path = pendingCommunityLanding.canonicalPath;
    } else {
      path = `/map`;
    }

    // Use Location.path() to get the actual browser URL including query params
    // This is necessary because Location.replaceState() doesn't update router.url
    const currentUrl = this._location.path();
    const currentPath = currentUrl.split("?")[0];
    if (/^\/map\/events\/[^/]+$/u.test(currentPath) && !selectedEvent) {
      return;
    }
    const queryIndex = currentUrl.indexOf("?");
    const existingParams = new URLSearchParams(
      queryIndex >= 0 ? currentUrl.substring(queryIndex + 1) : "",
    );

    // Update the filter param based on activeFilter signal
    if (activeFilter) {
      existingParams.set("filter", activeFilter);
    } else {
      existingParams.delete("filter");
    }
    if (activeEventFilter) {
      existingParams.set("eventFilter", activeEventFilter);
    } else {
      existingParams.delete("eventFilter");
    }
    if (mapObjectMode !== "all") {
      existingParams.set("type", mapObjectMode);
    } else {
      existingParams.delete("type");
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
            this._sidebarScrollListener as EventListener,
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
            this._bottomSheetContentListener as EventListener,
          );
        } catch (e) {
          /* ignore */
        }
        this._bottomSheetContentEl = undefined;
        this._bottomSheetContentListener = undefined;
      }

      // Try to attach sidebar (desktop) listener
      const drawerInner = document.querySelector(
        ".mat-drawer-inner-container",
      ) as HTMLElement | null;
      if (drawerInner) {
        this._sidebarScrollEl = drawerInner;
        this._sidebarScrollListener = () => {
          this.sidebarContentIsScrolling.set(
            !!(this._sidebarScrollEl && this._sidebarScrollEl.scrollTop > 0),
          );
        };
        this._sidebarScrollEl.addEventListener(
          "scroll",
          this._sidebarScrollListener,
          { passive: true },
        );
        this.sidebarContentIsScrolling.set(this._sidebarScrollEl.scrollTop > 0);
      } else {
        this.sidebarContentIsScrolling.set(false);
      }

      // Try to attach bottom-sheet (mobile) listener
      const bottomContent = document.querySelector(
        "app-bottom-sheet #contentEl",
      ) as HTMLElement | null;
      if (bottomContent) {
        this._bottomSheetContentEl = bottomContent;
        this._bottomSheetContentListener = () => {
          this.sidebarContentIsScrolling.set(
            !!(
              this._bottomSheetContentEl &&
              this._bottomSheetContentEl.scrollTop > 0
            ),
          );
        };
        this._bottomSheetContentEl.addEventListener(
          "scroll",
          this._bottomSheetContentListener,
          { passive: true },
        );
        this.sidebarContentIsScrolling.set(
          this._bottomSheetContentEl.scrollTop > 0,
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
    updateUrl: boolean = true,
  ) {
    // console.debug("selecting spot", spot);
    if (!spot) {
      this.closeSpot(updateUrl);
    } else {
      // Check for SpotPreviewData
      if (!("clone" in spot)) {
        if (updateUrl) {
          this.openSpotPath(spot.slug ?? spot.id, {
            id: spot.id,
            slug: spot.slug,
            name: spot.name,
            imageSrc: spot.imageSrc,
            locality: spot.locality,
            rating: spot.rating,
          });
          return;
        }

        this.loadSpotById(spot.id as SpotId, false, {
          id: spot.id,
          slug: spot.slug,
          name: spot.name,
          imageSrc: spot.imageSrc,
          locality: spot.locality,
          rating: spot.rating,
        }).then(() => {});
        return;
      }

      if (updateUrl && spot instanceof Spot) {
        const preview = spot.makePreviewData();
        this.openSpotPath(spot.slug ?? spot.id, {
          id: spot.id,
          slug: spot.slug ?? undefined,
          name: preview.name,
          imageSrc: preview.imageSrc,
          locality: preview.locality,
          rating: preview.rating,
        });
        return;
      }

      const previousSpotKey = this._getSelectedSpotKey(this.selectedSpot());
      const nextSpotKey = this._getSelectedSpotKey(spot);
      const spotChanged = previousSpotKey !== nextSpotKey;

      this.closeChallenge(false);
      this._spotLoadRequestVersion++;
      this.selectedEvent.set(null);
      this.pendingEventPreview.set(null);
      this.selectedCommunityLanding.set(null);
      this.pendingCommunityLanding.set(null);
      this.selectedPoi.set(null);
      this.pendingSpotPreview.set(null);
      this.selectedSpot.set(spot);
      this.resetPanelContentToTop();

      this._openInfoPanel();

      if (spotChanged) {
        this._debugMapEvent("selectSpotFocus", {
          previousSpotKey,
          nextSpotKey,
        });
        this.spotMap?.focusSpot(spot);
      }

      if (updateUrl && spot instanceof Spot) {
        this.updateMapURL();
      }
    }
  }

  onSpotOpenRequested(spot: Spot | LocalSpot | SpotPreviewData | SpotId): void {
    if (typeof spot === "string") {
      this.openSpotPath(spot);
      return;
    }

    this.selectSpot(spot);
  }

  private _getSelectedSpotKey(
    spot: Spot | LocalSpot | SpotPreviewData | null,
  ): string | null {
    if (!spot) return null;

    if ("id" in spot && spot.id) {
      return spot.id as string;
    }

    if ("location" in spot && typeof spot.location === "function") {
      const location = spot.location();
      return `local-${location.lat}_${location.lng}`;
    }

    return null;
  }

  private _debugMapEvent(
    event: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.appSettings.debugMode()) return;

    console.debug("[MapDebug][MapPage]", event, {
      ...payload,
      selectedSpot: this._getSelectedSpotKey(this.selectedSpot()),
      selectedCommunity: this.selectedCommunityLanding()?.communityKey ?? null,
      selectedEvent: this.selectedEvent()?.id ?? null,
      timestamp: Math.round(performance.now()),
    });
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
        ".mat-drawer-inner-container",
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
        "app-bottom-sheet #contentEl",
      ) as HTMLElement | null);

    if (el) {
      el.scrollTo({ top: 0 });
      this.sidebarContentIsScrolling.set(false);
    }
  }

  resetPanelContentToTop(): void {
    this.resetSidebarContentToTop();
    this.resetBottomSheetContentToTop();

    if (!isPlatformBrowser(this.platformId)) return;

    window.setTimeout(() => {
      this.resetSidebarContentToTop();
      this.resetBottomSheetContentToTop();
    }, 0);
  }

  private _parseMapRouteState(url: string): {
    spotIdOrSlug: string | null;
    showChallenges: boolean;
    challengeId: string | null;
    showEditHistory: boolean;
  } {
    const cleanUrl = (url || "").split("?")[0].split("#")[0];

    // Short-circuit for canonical community-on-map and event-on-map routes.
    if (
      /^\/map\/communities\/[^/]+$/u.test(cleanUrl) ||
      /^\/map\/events\/[^/]+$/u.test(cleanUrl)
    ) {
      return {
        spotIdOrSlug: null,
        showChallenges: false,
        challengeId: null,
        showEditHistory: false,
      };
    }

    const urlParts = cleanUrl.split("/").filter((segment) => segment);

    let spotIdOrSlug: string | null = null;
    let showChallenges = false;
    let challengeId: string | null = null;
    let showEditHistory = false;

    if (urlParts.length >= 2 && urlParts[0] === "map") {
      const hasSpotPrefix = urlParts[1] === "spots";
      const spotSegmentIndex = hasSpotPrefix ? 2 : 1;
      const actionSegmentIndex = spotSegmentIndex + 1;
      const potentialSpot = urlParts[spotSegmentIndex]
        ? decodeURIComponent(urlParts[spotSegmentIndex])
        : null;

      if (!potentialSpot) {
        return {
          spotIdOrSlug,
          showChallenges,
          challengeId,
          showEditHistory,
        };
      }

      if (urlParts.length === spotSegmentIndex + 1) {
        spotIdOrSlug = potentialSpot;
      } else if (urlParts.length >= actionSegmentIndex + 1) {
        const nextSegment = urlParts[actionSegmentIndex];

        if (nextSegment === "c") {
          spotIdOrSlug = potentialSpot;
          showChallenges = true;
          if (urlParts.length >= actionSegmentIndex + 2) {
            challengeId = decodeURIComponent(urlParts[actionSegmentIndex + 1]);
          }
        } else if (nextSegment === "edits") {
          spotIdOrSlug = potentialSpot;
          showEditHistory = true;
        } else {
          spotIdOrSlug = potentialSpot;
        }
      }
    }

    return {
      spotIdOrSlug,
      showChallenges,
      challengeId,
      showEditHistory,
    };
  }

  private _redirectSignedOutSpotEditHistory(
    spotIdOrSlug?: string | null,
  ): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    if (!this.authService.initialAuthStateResolved() || this.isSignedIn()) {
      return false;
    }

    const routeState = spotIdOrSlug
      ? {
          spotIdOrSlug,
          showEditHistory: true,
        }
      : this._parseMapRouteState(this.router.url);

    if (!routeState.showEditHistory || !routeState.spotIdOrSlug) {
      return false;
    }

    this.showSpotEditHistory.set(false);

    const queryIndex = this.router.url.indexOf("?");
    const queryString =
      queryIndex >= 0 ? this.router.url.slice(queryIndex) : "";
    const spotPath = `${buildSpotCanonicalPath(routeState.spotIdOrSlug)}${queryString}`;

    if (this.router.url === spotPath) {
      return true;
    }

    void this.router.navigateByUrl(spotPath, { replaceUrl: true });
    return true;
  }

  /**
   * If the URL is `/map/event/<id-or-slug>` or `/map/events/<id-or-slug>`,
   * fetch the event and open
   * the preview panel. Mirrors the route-driven community pattern but
   * with an async fetch since events aren't pre-resolved. Clearing
   * happens automatically when navigating away from this URL shape.
   *
   * No-op when the URL doesn't match — keeps existing selectedEvent
   * intact (e.g., user opened the event programmatically via the
   * island chip and the URL was patched via replaceState).
   */
  private _loadEventFromRouteIfPresent(
    url: string,
    options: { previewEvent?: PkEvent | null; refresh?: boolean } = {},
  ): Promise<void> {
    const cleanUrl = (url || "").split("?")[0].split("#")[0];
    const match = cleanUrl.match(/^\/map\/events?\/([^/]+)$/u);
    if (!match) {
      if (this.selectedEvent() || this.pendingEventPreview()) {
        this.selectedEvent.set(null);
        this.pendingEventPreview.set(null);
      }
      return Promise.resolve();
    }

    const eventIdOrSlug = decodeURIComponent(match[1]);
    const current = this.selectedEvent();
    if (
      !options.refresh &&
      current &&
      (current.slug === eventIdOrSlug || current.id === (eventIdOrSlug as any))
    ) {
      this.pendingEventPreview.set(null);
      return Promise.resolve(); // already showing
    }

    const previewEvent =
      options.previewEvent ??
      this._eventPreviewCache.get(eventIdOrSlug) ??
      null;
    if (previewEvent) {
      this.pendingEventPreview.set(null);
      this.openEventPreview(previewEvent, { updateUrl: false });
    } else {
      this._openPendingEventFromRoute(eventIdOrSlug);
    }

    if (previewEvent && !options.refresh) {
      return Promise.resolve();
    }

    return this._eventsService
      .getEventBySlugOrId(eventIdOrSlug)
      .then((event) => {
        if (!event) return;
        this._eventPreviewCache.set(eventIdOrSlug, event);
        this._eventPreviewCache.set(event.id, event);
        if (event.slug) {
          this._eventPreviewCache.set(event.slug, event);
        }
        // Only apply if the URL is still on this event — guard against
        // navigation racing with the fetch.
        const currentUrl = (this._location.path() || this.router.url || "")
          .split("?")[0]
          .split("#")[0];
        if (!currentUrl.endsWith(`/${eventIdOrSlug}`)) return;
        this.pendingEventPreview.set(null);
        this.openEventPreview(event, { updateUrl: false });
      })
      .catch((err) =>
        console.warn("MapPage: failed to load event from route", err),
      )
      .finally(() => {
        if (this.pendingEventPreview()?.idOrSlug === eventIdOrSlug) {
          this.pendingEventPreview.set(null);
        }
      });
  }

  private _openPendingEventFromRoute(eventIdOrSlug: string): void {
    this._spotLoadRequestVersion++;
    this.selectedSpot.set(null);
    this.pendingSpotPreview.set(null);
    this.selectedPoi.set(null);
    this.selectedCommunityLanding.set(null);
    this.pendingCommunityLanding.set(null);
    this.closeChallenge(false);
    this.showSpotEditHistory.set(false);
    this.selectedEvent.set(null);
    this.pendingEventPreview.set({ idOrSlug: eventIdOrSlug });
    this._openInfoPanel();
    this.resetPanelContentToTop();
  }

  private async _syncFullMapStateFromUrl(url: string): Promise<void> {
    this.panelBackTarget.set(null);
    await this._syncMapPanelStateFromUrl(url);
    const routeState = this._parseMapRouteState(url);
    await this._handleURLParamsChange(
      routeState.spotIdOrSlug,
      routeState.showChallenges,
      routeState.challengeId,
      routeState.showEditHistory,
    );
  }

  private async _syncMapPanelStateFromUrl(url: string): Promise<void> {
    const cleanUrl = (url || "").split("?")[0].split("#")[0];
    const communityMatch = cleanUrl.match(/^\/map\/communities\/([^/]+)$/u);

    if (communityMatch) {
      const slug = decodeURIComponent(communityMatch[1]);
      const current = this.selectedCommunityLanding();
      this.selectedEvent.set(null);
      this.pendingEventPreview.set(null);
      this._spotLoadRequestVersion++;
      this.selectedSpot.set(null);
      this.pendingSpotPreview.set(null);
      this.selectedPoi.set(null);
      this.closeChallenge(false);
      this.showSpotEditHistory.set(false);

      if (current && this._communityMatchesSlug(current, slug)) {
        this._openInfoPanel();
        return;
      }

      const routedCommunity = this._getCommunityLandingFromRoute();
      if (
        routedCommunity &&
        this._communityMatchesSlug(routedCommunity, slug)
      ) {
        this.selectedCommunityLanding.set(routedCommunity);
        this.pendingCommunityLanding.set(null);
        return;
      }

      const requestVersion = ++this._communityRouteLoadVersion;
      const preview = this._findCommunityPreviewBySlug(slug);
      this.pendingCommunityLanding.set(
        preview ?? {
          id: slug,
          communityKey: slug,
          slug,
          displayName: "",
          canonicalPath: `/map/communities/${encodeURIComponent(slug)}`,
          totalSpots: 0,
        },
      );
      this.selectedCommunityLanding.set(null);
      this._openInfoPanel();

      await this._landingPagesService
        .getCommunityPage(slug, 8, false)
        .then((community) => {
          if (!community) {
            return;
          }

          const currentPath = (this._location.path() || "")
            .split("?")[0]
            .split("#")[0];
          if (
            requestVersion !== this._communityRouteLoadVersion ||
            !currentPath.match(/^\/map\/communities\//u) ||
            !this._communityMatchesSlug(community, slug)
          ) {
            return;
          }

          this.selectedCommunityLanding.set(community);
          this.pendingCommunityLanding.set(null);
        })
        .catch((err) =>
          console.warn("MapPage: failed to load community from route", err),
        )
        .finally(() => {
          if (requestVersion === this._communityRouteLoadVersion) {
            this.pendingCommunityLanding.set(null);
          }
        });
      return;
    }

    this.selectedCommunityLanding.set(null);
    this.pendingCommunityLanding.set(null);
    await this._loadEventFromRouteIfPresent(url);
  }

  private _findCommunityPreviewBySlug(
    slug: string,
  ): CommunitySearchPreview | null {
    return (
      [...this._visibleMapCommunities(), ...this._promotableCommunities()].find(
        (community) =>
          community.slug === slug ||
          community.canonicalPath?.endsWith(`/${encodeURIComponent(slug)}`) ||
          community.canonicalPath?.endsWith(`/${slug}`),
      ) ?? null
    );
  }

  private _communityMatchesSlug(
    community: CommunityLandingPageData,
    slug: string,
  ): boolean {
    return (
      community.preferredSlug === slug ||
      community.requestedSlug === slug ||
      community.canonicalPath.endsWith(`/${encodeURIComponent(slug)}`) ||
      community.canonicalPath.endsWith(`/${slug}`)
    );
  }

  private _getCommunityLandingFromRoute(): CommunityLandingPageData | null {
    let currentSnapshot = this.activatedRoute.snapshot;

    while (currentSnapshot.firstChild) {
      currentSnapshot = currentSnapshot.firstChild;
    }

    return (
      (currentSnapshot.data?.["communityLanding"] as
        | CommunityLandingPageData
        | undefined) ??
      (this.activatedRoute.snapshot.data?.["communityLanding"] as
        | CommunityLandingPageData
        | undefined) ??
      null
    );
  }

  private _focusCommunityOnMap(
    communityLanding: CommunityLandingPageData,
  ): boolean {
    if (!isPlatformBrowser(this.platformId) || !this.spotMap) {
      return false;
    }

    if (communityLanding.scope === "country") {
      this._focusCountryCommunityOnMap(communityLanding);
      return true;
    }

    const coordinates = this._extractCommunityCoordinates(communityLanding);
    if (
      communityLanding.boundsCenter &&
      typeof communityLanding.boundsRadiusM === "number"
    ) {
      const [lat, lng] = communityLanding.boundsCenter;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const radiusDegrees = communityLanding.boundsRadiusM / 111_320;
        this.spotMap.focusBounds(
          new google.maps.LatLngBounds(
            { lat: lat - radiusDegrees, lng: lng - radiusDegrees },
            { lat: lat + radiusDegrees, lng: lng + radiusDegrees },
          ),
        );
        return true;
      }
    }

    if (coordinates.length === 0) {
      return false;
    }

    let minLat = coordinates[0].lat;
    let maxLat = coordinates[0].lat;
    let minLng = coordinates[0].lng;
    let maxLng = coordinates[0].lng;

    for (const coordinate of coordinates) {
      minLat = Math.min(minLat, coordinate.lat);
      maxLat = Math.max(maxLat, coordinate.lat);
      minLng = Math.min(minLng, coordinate.lng);
      maxLng = Math.max(maxLng, coordinate.lng);
    }

    const latSpan = Math.abs(maxLat - minLat);
    const lngSpan = Math.abs(maxLng - minLng);

    if (latSpan > 0.02 || lngSpan > 0.02) {
      this.spotMap.focusBounds(
        new google.maps.LatLngBounds(
          { lat: minLat, lng: minLng },
          { lat: maxLat, lng: maxLng },
        ),
      );
      return true;
    }

    const center = {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    };

    this.spotMap.focusPoint(
      center,
      this._getCommunityFocusZoom(communityLanding),
    );
    return true;
  }

  private _focusCommunityPreviewOnMap(
    community: Pick<
      CommunitySearchPreview,
      | "boundsCenter"
      | "boundsRadiusM"
      | "scope"
      | "displayName"
      | "countryCode"
      | "googleMapsPlaceId"
    >,
  ): void {
    if (
      !isPlatformBrowser(this.platformId) ||
      !this.spotMap ||
      typeof google === "undefined"
    ) {
      return;
    }

    if (community.scope === "country") {
      this._focusCountryCommunityOnMap(community);
      return;
    }

    if (
      !community.boundsCenter ||
      typeof community.boundsRadiusM !== "number"
    ) {
      return;
    }

    const [lat, lng] = community.boundsCenter;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const radiusDegrees = community.boundsRadiusM / 111_320;
    this.spotMap.focusBounds(
      new google.maps.LatLngBounds(
        { lat: lat - radiusDegrees, lng: lng - radiusDegrees },
        { lat: lat + radiusDegrees, lng: lng + radiusDegrees },
      ),
    );
  }

  private _focusCountryCommunityOnMap(
    community: CommunityCountryFocusData,
  ): void {
    if (!isPlatformBrowser(this.platformId) || !this.spotMap) {
      return;
    }

    const [lat, lng] = community.boundsCenter ?? [];
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      this.spotMap.focusPoint({ lat: Number(lat), lng: Number(lng) }, 5);
    }

    void this._getCountryViewportBounds(community).then((bounds) => {
      if (bounds && this.spotMap) {
        this.spotMap.focusBounds(bounds);
      }
    });
  }

  private async _getCountryViewportBounds(
    community: CommunityCountryFocusData,
  ): Promise<google.maps.LatLngBounds | null> {
    if (!this.mapsService.isApiLoaded() || typeof google === "undefined") {
      return null;
    }

    const countryCode =
      community.countryCode ?? community.country?.code ?? undefined;
    const cacheKey = (
      community.googleMapsPlaceId ||
      countryCode ||
      community.displayName
    ).toLowerCase();
    if (this._countryViewportCache.has(cacheKey)) {
      return this._countryViewportCache.get(cacheKey) ?? null;
    }

    try {
      if (community.googleMapsPlaceId) {
        const place = await this.mapsService.getGooglePlaceById(
          community.googleMapsPlaceId,
        );
        const viewport =
          (place as { viewport?: google.maps.LatLngBounds | null }).viewport ??
          null;
        this._countryViewportCache.set(cacheKey, viewport);
        return viewport;
      }

      const { Place } = (await google.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      const { places } = await Place.searchByText({
        textQuery: community.displayName,
        fields: ["id", "viewport"],
        includedType: "country",
        maxResultCount: 1,
        region: countryCode,
        useStrictTypeFiltering: true,
      });
      const viewport =
        (
          places[0] as
            | { viewport?: google.maps.LatLngBounds | null }
            | undefined
        )?.viewport ?? null;
      this._countryViewportCache.set(cacheKey, viewport);
      return viewport;
    } catch (error) {
      console.warn("MapPage: failed to resolve country viewport", error);
      this._countryViewportCache.set(cacheKey, null);
      return null;
    }
  }

  private _focusCommunityFromQueryParam(): void {
    const slug = this._pendingCommunityFocusSlug;
    if (!slug || !this.spotMap || this._promotableCommunities().length === 0) {
      return;
    }

    const preview = this._findCommunityPreviewBySlug(slug);
    if (!preview) {
      return;
    }

    this._focusCommunityPreviewOnMap(preview);
    this._pendingCommunityFocusSlug = null;
    this._clearCommunityFocusQueryParam();
  }

  private _clearCommunityFocusQueryParam(): void {
    const currentUrl = this._location.path();
    const queryIndex = currentUrl.indexOf("?");
    if (queryIndex < 0) {
      return;
    }

    const path = currentUrl.substring(0, queryIndex);
    const params = new URLSearchParams(currentUrl.substring(queryIndex + 1));
    if (!params.has("community")) {
      return;
    }

    params.delete("community");
    const queryString = params.toString();
    this._location.replaceState(queryString ? `${path}?${queryString}` : path);
  }

  private _extractCommunityCoordinates(
    communityLanding: CommunityLandingPageData,
  ): google.maps.LatLngLiteral[] {
    const pickSpots =
      communityLanding.communityPicks?.flatMap((section) => section.spots) ??
      [];
    const previews = [
      ...pickSpots,
      ...(communityLanding.spots ?? []),
      ...communityLanding.topRatedSpots,
      ...communityLanding.drySpots,
    ];
    const coordinates: google.maps.LatLngLiteral[] = [];

    for (const preview of previews) {
      const previewBounds = preview.bounds_raw ?? [];
      for (const coordinate of previewBounds) {
        if (this._isFiniteLatLng(coordinate)) {
          coordinates.push(coordinate);
        }
      }

      const rawLocation = preview.location_raw;
      if (this._isFiniteLatLng(rawLocation)) {
        coordinates.push(rawLocation);
      }

      const geoLocation = preview.location;
      const normalizedGeoLocation = geoLocation
        ? { lat: geoLocation.latitude, lng: geoLocation.longitude }
        : null;
      if (this._isFiniteLatLng(normalizedGeoLocation)) {
        coordinates.push(normalizedGeoLocation);
      }

      const geoBounds = preview.bounds ?? [];
      for (const coordinate of geoBounds) {
        const normalizedCoordinate = {
          lat: coordinate.latitude,
          lng: coordinate.longitude,
        };
        if (this._isFiniteLatLng(normalizedCoordinate)) {
          coordinates.push(normalizedCoordinate);
        }
      }

      const boundsCenter = preview.bounds_center
        ? {
            lat: preview.bounds_center.latitude,
            lng: preview.bounds_center.longitude,
          }
        : null;
      if (this._isFiniteLatLng(boundsCenter)) {
        coordinates.push(boundsCenter);
      }
    }

    return coordinates;
  }

  private _getCommunityFocusZoom(
    communityLanding: CommunityLandingPageData,
  ): number {
    switch (communityLanding.scope) {
      case "country":
        return 5;
      case "region":
        return 8;
      case "locality":
      default:
        return 11;
    }
  }

  private _isFiniteLatLng(
    coordinate: google.maps.LatLngLiteral | null | undefined,
  ): coordinate is google.maps.LatLngLiteral {
    return (
      !!coordinate &&
      Number.isFinite(coordinate.lat) &&
      Number.isFinite(coordinate.lng)
    );
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
      this.resetPanelContentToTop();

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
    this._spotLoadRequestVersion++;
    this.selectedSpot.set(null);
    this.pendingSpotPreview.set(null);
    this.selectedPoi.set(null); // Clear selected POI
    this.showSpotEditHistory.set(false);
    this.closeChallenge(false);
    this.spotMap?.selectedSpot.set(null);
    this.resetPanelContentToTop();

    if (updateUrl) {
      this.updateMapURL();
    }
  }

  closeChallenge(updateUrl: boolean = true) {
    this.selectedChallenge.set(null);
    this.resetPanelContentToTop();

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
        $localize`:@@map.highlighted_spots.structured_data_name:Featured Parkour Spots`,
      );
      this._structuredDataService.addStructuredData(
        "highlighted-spots",
        itemList,
      );
    } else {
      this._structuredDataService.removeStructuredData("highlighted-spots");
    }
  }

  private _syncPrivateDataSubscription(uid: string | null): void {
    if (uid === this._privateDataUserId) {
      return;
    }

    this._privateDataUserId = uid;
    this._privateDataSubscription?.unsubscribe();
    this._privateDataSubscription = undefined;
    this.savedSpotIds.set([]);
    this.visitedSpotIds.set([]);
    this._savedSpotPreviewCache.clear();
    this._visitedSpotPreviewCache.clear();

    if (!uid) {
      return;
    }

    this._privateDataSubscription = this._usersService
      .getPrivateData(uid)
      .subscribe(
        (privateData) => {
          const savedIds = Array.from(
            new Set((privateData?.bookmarks || []).filter((id) => !!id)),
          );
          const visitedIds = Array.from(
            new Set((privateData?.visited_spots || []).filter((id) => !!id)),
          );
          this.savedSpotIds.set(savedIds);
          this.visitedSpotIds.set(visitedIds);

          // Prune stale cache entries that are no longer saved.
          const savedIdSet = new Set(savedIds);
          for (const cachedId of this._savedSpotPreviewCache.keys()) {
            if (!savedIdSet.has(cachedId)) {
              this._savedSpotPreviewCache.delete(cachedId);
            }
          }
          const visitedIdSet = new Set(visitedIds);
          for (const cachedId of this._visitedSpotPreviewCache.keys()) {
            if (!visitedIdSet.has(cachedId)) {
              this._visitedSpotPreviewCache.delete(cachedId);
            }
          }

          if (this._activeFilter === "saved" && this.spotMap?.bounds) {
            void this._applySavedFilter(this.spotMap.bounds);
          }
          if (this._activeFilter === "visited" && this.spotMap?.bounds) {
            void this._applyVisitedFilter(this.spotMap.bounds);
          }
        },
        (error) => {
          console.error("Failed to load private spot lists", error);
        },
      );
  }

  private async _ensureSavedSpotPreviewsLoaded(
    orderedSavedIds: string[],
  ): Promise<void> {
    const missingIds = orderedSavedIds.filter(
      (id) => !this._savedSpotPreviewCache.has(id),
    );

    if (missingIds.length === 0) {
      return;
    }

    if (!this._savedPreviewLoadPromise) {
      this._savedPreviewLoadPromise = this._searchService
        .searchSpotPreviewsByIds(missingIds)
        .then((previews) => {
          previews.forEach((preview) => {
            if (preview.id) {
              this._savedSpotPreviewCache.set(preview.id, preview);
            }
          });
        })
        .catch((error) => {
          console.error("Failed to load saved spot previews", error);
        })
        .finally(() => {
          this._savedPreviewLoadPromise = null;
        });
    }

    await this._savedPreviewLoadPromise;
  }

  private async _ensureVisitedSpotPreviewsLoaded(
    orderedVisitedIds: string[],
  ): Promise<void> {
    const missingIds = orderedVisitedIds.filter(
      (id) => !this._visitedSpotPreviewCache.has(id),
    );

    if (missingIds.length === 0) {
      return;
    }

    if (!this._visitedPreviewLoadPromise) {
      this._visitedPreviewLoadPromise = this._searchService
        .searchSpotPreviewsByIds(missingIds)
        .then((previews) => {
          previews.forEach((preview) => {
            if (preview.id) {
              this._visitedSpotPreviewCache.set(preview.id, preview);
            }
          });
        })
        .catch((error) => {
          console.error("Failed to load visited spot previews", error);
        })
        .finally(() => {
          this._visitedPreviewLoadPromise = null;
        });
    }

    await this._visitedPreviewLoadPromise;
  }

  private async _applySavedFilter(
    bounds: google.maps.LatLngBounds,
  ): Promise<void> {
    const savedIds = this.savedSpotIds();

    if (!this.spotMap || savedIds.length === 0) {
      this._setFilteredSpotPreviews([]);
      return;
    }

    await this._ensureSavedSpotPreviewsLoaded(savedIds);

    const previewsInBounds: SpotPreviewData[] = [];
    for (const id of savedIds) {
      const preview = this._savedSpotPreviewCache.get(id);
      if (!preview) continue;

      const loc = this._getPreviewLocation(preview);
      if (!loc) continue;

      if (bounds.contains(loc)) {
        previewsInBounds.push(preview);
      }
    }

    this._setFilteredSpotPreviews(previewsInBounds);
  }

  private async _applyVisitedFilter(
    bounds: google.maps.LatLngBounds,
  ): Promise<void> {
    const visitedIds = this.visitedSpotIds();

    if (!this.spotMap || visitedIds.length === 0) {
      this._setFilteredSpotPreviews([]);
      return;
    }

    await this._ensureVisitedSpotPreviewsLoaded(visitedIds);

    const previewsInBounds: SpotPreviewData[] = [];
    for (const id of visitedIds) {
      const preview = this._visitedSpotPreviewCache.get(id);
      if (!preview) continue;

      const loc = this._getPreviewLocation(preview);
      if (!loc) continue;

      if (bounds.contains(loc)) {
        previewsInBounds.push(preview);
      }
    }

    this._setFilteredSpotPreviews(previewsInBounds);
  }

  private _getPreviewLocation(
    preview: SpotPreviewData,
  ): google.maps.LatLngLiteral | null {
    if (
      preview.location_raw &&
      Number.isFinite(preview.location_raw.lat) &&
      Number.isFinite(preview.location_raw.lng)
    ) {
      return preview.location_raw;
    }

    const location: any = preview.location;
    if (!location) return null;

    if (typeof location.lat === "number" && typeof location.lng === "number") {
      return { lat: location.lat, lng: location.lng };
    }

    if (
      typeof location.latitude === "number" &&
      typeof location.longitude === "number"
    ) {
      return { lat: location.latitude, lng: location.longitude };
    }

    if (
      typeof location.lat === "function" &&
      typeof location.lng === "function"
    ) {
      return { lat: location.lat(), lng: location.lng() };
    }

    return null;
  }

  ngOnDestroy() {
    console.debug("destroying map page");
    if (this.checkInEnabled) {
      this.checkInService.showGlobalChip.set(true);
    }
    this.closeSpot();
    this._routerSubscription?.unsubscribe();
    this._locationSubscription?.unsubscribe();
    this._alainModeSubscription?.unsubscribe();
    this._breakpointSubscription?.unsubscribe();
    this._compactSidenavBreakpointSubscription?.unsubscribe();
    this._consentSubscription?.unsubscribe();
    this._authStateSubscription?.unsubscribe();
    this._privateDataSubscription?.unsubscribe();
    this._structuredDataService.removeStructuredData("highlighted-spots");
    try {
      if (this._sidebarScrollEl && this._sidebarScrollListener) {
        this._sidebarScrollEl.removeEventListener(
          "scroll",
          this._sidebarScrollListener as EventListener,
        );
      }
      if (this._bottomSheetContentEl && this._bottomSheetContentListener) {
        this._bottomSheetContentEl.removeEventListener(
          "scroll",
          this._bottomSheetContentListener as EventListener,
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

    if (this._hasRoutedMapPanelOpen()) {
      return false;
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

  private _hasRoutedMapPanelOpen(): boolean {
    const currentPath = (this._location.path() || this.router.url || "")
      .split("?")[0]
      .split("#")[0];
    return /^\/map\/(?:spots|events|communities)\/[^/]+/u.test(currentPath);
  }

  spotCheckIn(spotId: SpotId) {
    this.checkInService.checkIn(spotId);
  }

  dismissCheckInSpot(spotId: SpotId) {
    this.checkInService.dismissSpot(spotId);
  }
}
