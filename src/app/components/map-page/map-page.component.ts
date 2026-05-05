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
import { Location, NgOptimizedImage } from "@angular/common";
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
import { UsersService } from "../../services/firebase/firestore/users.service";
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
import {
  CommunityLandingPageData,
  LandingPagesService,
} from "../../services/firebase/firestore/landing-pages.service";
import { CommunityLandingPageComponent } from "../community-landing-page/community-landing-page.component";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventPreviewComponent } from "../event-preview/event-preview.component";
import {
  MapIslandComponent,
  MapIslandContent,
} from "../map-island/map-island.component";
import { afterNextRender } from "@angular/core";

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
    CommunityLandingPageComponent,
    MapIslandComponent,
    EventPreviewComponent,
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
  selectedCommunityLanding = signal<CommunityLandingPageData | null>(null);
  /**
   * Event currently shown as a preview on the map (sidebar / bottom-sheet).
   * Set when the user clicks an event from the community panel or the
   * map island. Distinct from "navigated to /events/<slug>" — that's the
   * full event page; this is the lightweight preview that keeps the map
   * underneath.
   */
  selectedEvent = signal<PkEvent | null>(null);
  selectedPoi = signal<PoiData | null>(null);
  selectedSpotIdOrSlug: WritableSignal<SpotId | string | null> = signal(null);
  selectedSpotIdForEdits = computed(() => {
    const spot = this.selectedSpot();
    return spot instanceof Spot ? spot.id : null;
  });
  showAllChallenges: WritableSignal<boolean> = signal(false);
  allSpotChallenges: WritableSignal<SpotChallenge[]> = signal([]);
  showSpotEditHistory: WritableSignal<boolean> = signal(false);
  searchPreviewPlaceId = signal<string | null>(null);

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
  private _lastFocusedCommunityKey: string | null = null;

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
        selectedFilter
      );
      setTimeout(() => this.filterChipChanged(selectedFilter), 0);
    }
  });

  toggleSidenav() {
    this.sidenavOpen.update((open) => !open);
  }

  private _alainModeSubscription?: Subscription;
  private _routerSubscription?: Subscription;
  private _breakpointSubscription?: Subscription;
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
  private _landingPagesService = inject(LandingPagesService);
  /** All events whose promo is currently active (loaded once on init). */
  private _promotableEvents = signal<PkEvent[]>([]);
  /**
   * All published community pages with `bounds_center` + `bounds_radius_m`,
   * loaded once. Used to surface the community variant of the map island
   * by viewport-intersection (no route required).
   */
  private _promotableCommunities = signal<
    Array<{
      data: CommunityLandingPageData;
      center: { lat: number; lng: number };
      radiusM: number;
    }>
  >([]);
  /** Latest visible viewport, expressed as a bounds box for intersection checks. */
  private _viewport = signal<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);
  /** Events the user has dismissed in the current session. */
  private _dismissedEventIds = signal<Set<string>>(new Set());
  /** Communities the user has dismissed in the current session. */
  private _dismissedCommunityKeys = signal<Set<string>>(new Set());

  /**
   * Geographic extent of the community currently surfaced in the map-island
   * (either route-driven or viewport-detected). Drawn as a low-opacity
   * circle on the map so the user can see what area the chip refers to.
   * Null when no community variant is active.
   */
  activeCommunityArea = computed<
    { center: { lat: number; lng: number }; radiusM: number } | null
  >(() => {
    const data = this.selectedCommunityLanding();
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
      .map((c) => c.data)
      .sort((a, b) => (b.totalSpotCount ?? 0) - (a.totalSpotCount ?? 0))
      .slice(0, 8)
  );

  /**
   * Active map-island content. Picks the most relevant variant for the
   * visible viewport. Filter helper takes precedence (it points at user
   * action), then event promo, then community context.
   */
  islandContent = computed<MapIslandContent | null>(() => {
    if (this.noSpotsForFilter()) {
      return {
        kind: "filter",
        message: $localize`:Filter helper text@@filter_helper_text:There are no spots matching the filter in this area.`,
      };
    }

    const viewport = this._viewport();
    if (viewport) {
      const dismissed = this._dismissedEventIds();
      const selectedEventId = this.selectedEvent()?.id;
      const event = this._promotableEvents().find(
        (e) =>
          e.id !== selectedEventId &&
          !dismissed.has(e.id) &&
          e.intersectsViewport(viewport)
      );
      if (event) return { kind: "event", event };
    }

    const dismissedCommunities = this._dismissedCommunityKeys();
    const selectedCommunityKey = this.selectedCommunityLanding()?.communityKey;

    if (viewport && !selectedCommunityKey) {
      // Heuristic: prefer communities whose CENTER is inside the visible
      // viewport, then take the largest radius (most context) of those.
      // - Zoomed into Zurich: only Zurich's center is in viewport, so
      //   Zurich wins (Switzerland's center isn't visible).
      // - Zoomed out to Europe: centers of both Switzerland and Zurich
      //   are in viewport, so Switzerland (largest radius) wins.
      // Falls back to the smallest intersecting community when no
      // center-in-viewport candidate exists (e.g., panning across a
      // border with no community center on screen).
      const candidates = this._promotableCommunities().filter(
        (c) =>
          c.data.communityKey !== selectedCommunityKey &&
          !dismissedCommunities.has(c.data.communityKey) &&
          this._viewportIntersectsCircle(viewport, c.center, c.radiusM)
      );

      const centerIn = candidates.filter((c) =>
        this._pointInViewport(c.center, viewport)
      );

      const viewportCommunity =
        centerIn.length > 0
          ? centerIn.sort((a, b) => b.radiusM - a.radiusM)[0]
          : candidates.sort((a, b) => a.radiusM - b.radiusM)[0];
      if (viewportCommunity) {
        return { kind: "community", community: viewportCommunity.data };
      }
    }

    return null;
  });

  /**
   * Approximate intersection of a viewport rectangle and a geographic circle.
   * Mirrors the helper on `Event` so we don't reach across model boundaries.
   */
  /**
   * True when a `{lat, lng}` point falls within the viewport rectangle.
   * Used by the map-island ranking to prefer communities whose center is
   * actually visible to the user.
   */
  private _pointInViewport(
    point: { lat: number; lng: number },
    viewport: { north: number; south: number; east: number; west: number }
  ): boolean {
    if (point.lat < viewport.south || point.lat > viewport.north) return false;
    // Antimeridian handling (defensive — viewports rarely cross it in
    // practice, but the math is cheap).
    if (viewport.west <= viewport.east) {
      return point.lng >= viewport.west && point.lng <= viewport.east;
    }
    return point.lng >= viewport.west || point.lng <= viewport.east;
  }

  private _viewportIntersectsCircle(
    viewport: { north: number; south: number; east: number; west: number },
    center: { lat: number; lng: number },
    radiusM: number
  ): boolean {
    const closestLat = Math.max(
      viewport.south,
      Math.min(center.lat, viewport.north)
    );
    const closestLng = Math.max(
      viewport.west,
      Math.min(center.lng, viewport.east)
    );
    const R = 6371e3;
    const φ1 = (center.lat * Math.PI) / 180;
    const φ2 = (closestLat * Math.PI) / 180;
    const Δφ = ((closestLat - center.lat) * Math.PI) / 180;
    const Δλ = ((closestLng - center.lng) * Math.PI) / 180;
    const h =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const distanceM = 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return distanceM <= radiusM;
  }

  onViewportBoundsChange(bounds: google.maps.LatLngBounds): void {
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    this._viewport.set({
      north: ne.lat(),
      south: sw.lat(),
      east: ne.lng(),
      west: sw.lng(),
    });
  }

  onIslandDismissEvent(event: PkEvent): void {
    this._dismissedEventIds.update((set) => {
      const next = new Set(set);
      next.add(event.id);
      return next;
    });
  }

  onIslandDismissCommunity(community: CommunityLandingPageData): void {
    this._dismissedCommunityKeys.update((set) => {
      const next = new Set(set);
      next.add(community.communityKey);
      return next;
    });
  }

  onIslandOpenEvent(event: PkEvent): void {
    // Open the event preview in-place (no route navigation). Same pattern
    // as the community island: `openEventPreview` already syncs the URL
    // to /map/events/<id> via Location.replaceState so the result is
    // bookmarkable. The full /events/<id> page is reachable via the
    // preview's "See full event" CTA.
    this.openEventPreview(event);
  }

  /**
   * Open the community panel without triggering a route navigation. The map
   * page is mounted on a separate top-level route from `/map/community/<slug>`,
   * so a normal `router.navigateByUrl` would unmount and remount the map
   * (refreshing tiles, re-fetching spots, etc.). Instead we set the panel
   * state directly and patch the URL via `Location.replaceState` so the page
   * is still shareable / reloadable.
   */
  onIslandOpenCommunity(community: CommunityLandingPageData): void {
    this.selectedEvent.set(null);
    this.selectedSpot.set(null);
    this.selectedPoi.set(null);
    this.closeChallenge(false);
    this.selectedCommunityLanding.set(community);
    this._location.go(community.canonicalPath);
    this._dismissedCommunityKeys.update((set) => {
      // Clearing a previous dismissal is the right thing here — the user
      // just explicitly opened it.
      const next = new Set(set);
      next.delete(community.communityKey);
      return next;
    });
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
    options: { updateUrl?: boolean; replaceUrl?: boolean } = {}
  ): void {
    const updateUrl = options.updateUrl ?? true;
    const replaceUrl = options.replaceUrl ?? false;
    this.selectedSpot.set(null);
    this.selectedPoi.set(null);
    this.selectedCommunityLanding.set(null);
    this.closeChallenge(false);
    this.showSpotEditHistory.set(false);
    this.selectedEvent.set(event);
    this._openInfoPanel();
    this.resetSidebarContentToTop();
    this.resetBottomSheetContentToTop();

    // Sync the URL so the preview is bookmarkable / shareable without
    // remounting the map through Router navigation.
    const eventPathId = event.slug ?? event.id;
    if (updateUrl && eventPathId) {
      const queryString =
        (typeof window !== "undefined" && window.location.search) || "";
      const path = `/map/events/${eventPathId}${queryString}`;
      if (replaceUrl) {
        this._location.replaceState(path);
      } else {
        this._location.go(path);
      }
    }

    const bounds = event.bounds;
    if (this.spotMap && bounds && typeof google !== "undefined") {
      try {
        const latLngBounds = new google.maps.LatLngBounds(
          { lat: bounds.south, lng: bounds.west },
          { lat: bounds.north, lng: bounds.east }
        );
        this.spotMap.focusBounds?.(latLngBounds);
      } catch (err) {
        console.warn("openEventPreview: focusBounds failed", err);
      }
    }
  }

  closeEventPreview(): void {
    if (!this.selectedEvent()) return;
    this.selectedEvent.set(null);
    // Strip the /events/<id> segment from the URL.
    const cleanUrl = (this.router.url || "").split("?")[0];
    if (/^\/map\/events\//u.test(cleanUrl)) {
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
    if (!this.selectedCommunityLanding()) {
      return;
    }
    this.selectedCommunityLanding.set(null);
    // Strip the /community/<slug> segment from the URL while preserving
    // any query params the map page is using.
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
    public appSettings: AppSettingsService
  ) {
    this._alainModeSubscription = GlobalVariables.alainMode.subscribe(
      (value) => {
        this.alainMode = value;
      }
    );

    this.isServer = isPlatformServer(platformId);
    this.selectedCommunityLanding.set(this._getCommunityLandingFromRoute());

    // Load events + promotable communities for the map island. One-shot
    // fetch — both collections are small and admin-curated, no need for
    // live propagation within a session.
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        this._eventsService
          .getPromotableEvents()
          .then((events) => this._promotableEvents.set(events))
          .catch((err) =>
            console.warn("MapPage: failed to load promotable events", err)
          );
        this._landingPagesService
          .getPromotableCommunityPages()
          .then((communities) =>
            this._promotableCommunities.set(communities)
          )
          .catch((err) =>
            console.warn(
              "MapPage: failed to load promotable communities",
              err
            )
          );
      });
    }

    effect(() => {
      // Read all relevant routing state signals so URL stays in sync
      this.selectedSpot();
      this.selectedChallenge();
      this.selectedEvent();
      this.selectedCommunityLanding();
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
        // briefly nulls selectedCommunityLanding (e.g. /map/community/zurich
        // → /map → /map/community/zurich again) used to trip a re-focus
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
      this.resetSidebarContentToTop();
      this.resetBottomSheetContentToTop();

      if (this._lastFocusedCommunityKey === communityLanding.communityKey) {
        return;
      }

      if (this._focusCommunityOnMap(communityLanding)) {
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
              error
            );
          }
        });

      onCleanup(() => {
        isCancelled = true;
      });
    });

    // Effect to update meta tags when spot/challenge changes (for client-side navigation)
    effect(() => {
      const spot = this.selectedSpot();
      const challenge = this.selectedChallenge();

      if (challenge && challenge instanceof SpotChallenge) {
        const spotPathSegment = challenge.spot.slug ?? challenge.spot.id;
        this.metaTagService.setChallengeMetaTags(
          challenge,
          `/map/${spotPathSegment}/c/${challenge.id}`
        );
      } else if (spot) {
        const canonicalPath =
          spot instanceof Spot ? `/map/${spot.slug ?? spot.id}` : undefined;
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
              (item) => item.schema.approved !== true
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
      }
    );

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

    this.selectedCommunityLanding.set(this._getCommunityLandingFromRoute());
    this._loadEventFromRouteIfPresent(this.router.url);

    // Parse URL to handle the edits route correctly since Angular router
    // might interpret /map/:spot/edits as /map/:spot where :spot="edits"
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

    this.pendingTasks.run(async () => {
      this._handleURLParamsChange(
        routeState.spotIdOrSlug,
        routeState.showChallenges,
        routeState.challengeId,
        routeState.showEditHistory,
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
          this.selectedCommunityLanding.set(this._getCommunityLandingFromRoute());
          this._loadEventFromRouteIfPresent(navEvent.urlAfterRedirects);
          const routeState = this._parseMapRouteState(navEvent.urlAfterRedirects);

          // Also extract filter query param from URL to keep it in sync
          const queryIndex = navEvent.urlAfterRedirects.indexOf("?");
          const queryString =
            queryIndex >= 0
              ? navEvent.urlAfterRedirects.substring(queryIndex + 1)
              : "";
          const params = new URLSearchParams(queryString);
          const filterParam = params.get("filter") ?? "";
          if (this.selectedFilter() !== filterParam) {
            this.filterChipChanged(filterParam);
          }

          this._handleURLParamsChange(
            routeState.spotIdOrSlug,
            routeState.showChallenges,
            routeState.challengeId,
            routeState.showEditHistory
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
    this.clearSearchPlacePreview();

    if (value.type === "place") {
      return;
    }

    this.loadSpotById(value.id as SpotId).then(() => {});
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

  async loadSpotById(spotId: SpotId, updateUrl: boolean = true): Promise<Spot> {
    console.debug("loading spot by id", spotId);

    // Retry loading the spot if it's not yet populated by the cloud function
    let lastError: any;
    const maxAttempts = 15;
    const delayMs = 200;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const spot: Spot = await this._spotsService.getSpotById(
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

  private _cloneCustomFilterParams(
    params: CustomFilterParams | null | undefined
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

  private _getPresetFilterParams(filterParam: string): CustomFilterParams | null {
    const filterConfig = getFilterConfig(getFilterModeFromUrlParam(filterParam));
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
    const customParams = this._cloneCustomFilterParams(this.customFilterParams());
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
    values: readonly T[] | null | undefined
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
    right: CustomFilterParams | null | undefined
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
    params: CustomFilterParams | null | undefined
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
    this.filterChipChanged("");
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
    const communityLanding = this.selectedCommunityLanding();
    const selectedEvent = this.selectedEvent();

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
    } else if (selectedEvent) {
      path = `/map/events/${encodeURIComponent(
        selectedEvent.slug ?? selectedEvent.id
      )}`;
    } else if (communityLanding) {
      path = communityLanding.canonicalPath;
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
      this.selectedEvent.set(null);
      this.selectedCommunityLanding.set(null);
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

  private _parseMapRouteState(url: string): {
    spotIdOrSlug: string | null;
    showChallenges: boolean;
    challengeId: string | null;
    showEditHistory: boolean;
  } {
    const cleanUrl = (url || "").split("?")[0].split("#")[0];

    // Match new plural path AND the legacy singular path (until the
    // redirect rewrites the URL). Also short-circuit for event-on-map.
    if (
      /^\/map\/(community|communities)\/[^/]+$/u.test(cleanUrl) ||
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
      const potentialSpot = decodeURIComponent(urlParts[1]);

      if (urlParts.length === 2) {
        spotIdOrSlug = potentialSpot;
      } else if (urlParts.length >= 3) {
        const nextSegment = urlParts[2];

        if (nextSegment === "c") {
          spotIdOrSlug = potentialSpot;
          showChallenges = true;
          if (urlParts.length >= 4) {
            challengeId = decodeURIComponent(urlParts[3]);
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

  /**
   * If the URL is `/map/events/<id-or-slug>`, fetch the event and open
   * the preview panel. Mirrors the route-driven community pattern but
   * with an async fetch since events aren't pre-resolved. Clearing
   * happens automatically when navigating away from this URL shape.
   *
   * No-op when the URL doesn't match — keeps existing selectedEvent
   * intact (e.g., user opened the event programmatically via the
   * island chip and the URL was patched via replaceState).
   */
  private _loadEventFromRouteIfPresent(url: string): void {
    const cleanUrl = (url || "").split("?")[0].split("#")[0];
    const match = cleanUrl.match(/^\/map\/events\/([^/]+)$/u);
    if (!match) {
      if (this.selectedEvent()) {
        this.selectedEvent.set(null);
      }
      return;
    }

    const eventIdOrSlug = decodeURIComponent(match[1]);
    const current = this.selectedEvent();
    if (
      current &&
      (current.slug === eventIdOrSlug || current.id === (eventIdOrSlug as any))
    ) {
      return; // already showing
    }

    void this._eventsService
      .getEventBySlugOrId(eventIdOrSlug)
      .then((event) => {
        if (!event) return;
        // Only apply if the URL is still on this event — guard against
        // navigation racing with the fetch.
        const currentUrl = (this.router.url || "").split("?")[0];
        if (!currentUrl.endsWith(`/${eventIdOrSlug}`)) return;
        this.openEventPreview(event, { updateUrl: false });
      })
      .catch((err) =>
        console.warn("MapPage: failed to load event from route", err)
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

  private _focusCommunityOnMap(communityLanding: CommunityLandingPageData): boolean {
    if (!isPlatformBrowser(this.platformId) || !this.spotMap) {
      return false;
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
            { lat: lat + radiusDegrees, lng: lng + radiusDegrees }
          )
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
          { lat: maxLat, lng: maxLng }
        )
      );
      return true;
    }

    const center = {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    };

    this.spotMap.focusPoint(center, this._getCommunityFocusZoom(communityLanding));
    return true;
  }

  private _extractCommunityCoordinates(
    communityLanding: CommunityLandingPageData
  ): google.maps.LatLngLiteral[] {
    const previews = [
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
    communityLanding: CommunityLandingPageData
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
    coordinate: google.maps.LatLngLiteral | null | undefined
  ): coordinate is google.maps.LatLngLiteral {
    return !!coordinate &&
      Number.isFinite(coordinate.lat) &&
      Number.isFinite(coordinate.lng);
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
            new Set((privateData?.bookmarks || []).filter((id) => !!id))
          );
          const visitedIds = Array.from(
            new Set((privateData?.visited_spots || []).filter((id) => !!id))
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
        }
      );
  }

  private async _ensureSavedSpotPreviewsLoaded(
    orderedSavedIds: string[]
  ): Promise<void> {
    const missingIds = orderedSavedIds.filter(
      (id) => !this._savedSpotPreviewCache.has(id)
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
    orderedVisitedIds: string[]
  ): Promise<void> {
    const missingIds = orderedVisitedIds.filter(
      (id) => !this._visitedSpotPreviewCache.has(id)
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
    bounds: google.maps.LatLngBounds
  ): Promise<void> {
    const savedIds = this.savedSpotIds();

    if (!this.spotMap || savedIds.length === 0) {
      this.spotMap?.setFilteredSpots([]);
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

    this.spotMap.setFilteredSpots(previewsInBounds);
  }

  private async _applyVisitedFilter(
    bounds: google.maps.LatLngBounds
  ): Promise<void> {
    const visitedIds = this.visitedSpotIds();

    if (!this.spotMap || visitedIds.length === 0) {
      this.spotMap?.setFilteredSpots([]);
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

    this.spotMap.setFilteredSpots(previewsInBounds);
  }

  private _getPreviewLocation(
    preview: SpotPreviewData
  ): google.maps.LatLngLiteral | null {
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
    this._alainModeSubscription?.unsubscribe();
    this._breakpointSubscription?.unsubscribe();
    this._consentSubscription?.unsubscribe();
    this._authStateSubscription?.unsubscribe();
    this._privateDataSubscription?.unsubscribe();
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
