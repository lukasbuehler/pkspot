import {
  Component,
  inject,
  LOCALE_ID,
  OnInit,
  ViewChild,
  signal,
  OnDestroy,
  effect,
  ElementRef,
  PLATFORM_ID,
  computed,
  ChangeDetectionStrategy
} from "@angular/core";
import { SpotMapComponent } from "../spot-map/spot-map.component";
import {
  isPlatformBrowser,
  KeyValuePipe,
  LocationStrategy,
} from "@angular/common";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { SpotListComponent } from "../spot-list/spot-list.component";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { ResponsiveService } from "../../services/responsive.service";
import { firstValueFrom, Subscription, take } from "rxjs";
import { LocaleCode } from "../../../db/models/Interfaces";
import { MarkerComponent } from "../marker/marker.component";
import { MarkerSchema } from "../map/markers/map-marker.model";
import { MetaTagService } from "../../services/meta-tag.service";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { ActivatedRoute, ParamMap, Router, RouterLink } from "@angular/router";
import { formatDateRange } from "../../../scripts/Helpers";
import { SpotDetailsComponent } from "../spot-details/spot-details.component";
import { trigger, transition, style, animate } from "@angular/animations";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatChipListboxChange, MatChipsModule } from "@angular/material/chips";
import { MapsApiService } from "../../services/maps-api.service";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import { GoogleMap2dComponent } from "../google-map-2d/google-map-2d.component";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { MatSidenavModule } from "@angular/material/sidenav";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";
import { SpotChallenge } from "../../../db/models/SpotChallenge";
import { ChallengeListComponent } from "../challenge-list/challenge-list.component";
import { MatDividerModule } from "@angular/material/divider";
import { ChallengeDetailComponent } from "../challenge-detail/challenge-detail.component";
import { ChipSelectComponent } from "../chip-select/chip-select.component";
import { FormControl } from "@angular/forms";
import {
  ChallengeParticipantTypeValues,
  ChallengeParticipantTypeIcons,
} from "../../../db/schemas/SpotChallengeLabels";
import {
  ChallengeLabelNames,
  ChallengeParticipantTypeNames,
} from "../../../db/models/SpotChallenge";
import {
  ChallengeLabelIcons,
  ChallengeLabelValues,
} from "../../../db/schemas/SpotChallengeLabels";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  EventEditFormComponent,
  EventEditPatch,
} from "../event-edit-form/event-edit-form.component";
import {
  EventBoundsSchema,
  EventId,
  EventSchema,
} from "../../../db/schemas/EventSchema";
import { SWISSJAM25_STATIC } from "../event-page/swissjam25.static";
import { AnalyticsService } from "../../services/analytics.service";
import { EventPageDataService } from "../../services/event-page/event-page-data.service";
import {
  eventImageDisplaySrc,
  type EventStatus,
} from "../event-display/event-display.helpers";
import { EventSummaryMetaComponent } from "../event-display/event-summary-meta.component";

type EventPageMapMarker = MarkerSchema & {
  spotIndex?: number;
  challengeIndex?: number;
};
type EventMapTab = "event" | "spots" | "challenges";

@Component({
  selector: "app-event-map-page",
  imports: [
    SpotListComponent,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    SpotDetailsComponent,
    MatMenuModule,
    MatTooltipModule,
    MatChipsModule,
    GoogleMap2dComponent,
    MatSidenavModule,
    ChallengeListComponent,
    MatDividerModule,
    ChallengeDetailComponent,
    KeyValuePipe,
    MarkerComponent,
    ChipSelectComponent,
    EventEditFormComponent,
    EventSummaryMetaComponent,
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
  templateUrl: "./event-map-page.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./event-map-page.component.scss",
})
export class EventMapPageComponent implements OnInit, OnDestroy {
  @ViewChild("spotMap") spotMap:
    | SpotMapComponent
    | GoogleMap2dComponent
    | undefined;
  @ViewChild("scrollContainer") scrollContainer:
    | ElementRef<HTMLElement>
    | undefined;
  @ViewChild("spotScrollContainer")
  spotScrollContainer?: ElementRef<HTMLElement>;

  metaTagService = inject(MetaTagService);
  locale = inject<LocaleCode>(LOCALE_ID);
  responsive = inject(ResponsiveService);
  private _spotService = inject(SpotsService);
  private _challengeService = inject(SpotChallengesService);
  private _eventsService = inject(EventsService);
  private _authService = inject(AuthenticationService);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _snackbar = inject(MatSnackBar);
  private _analytics = inject(AnalyticsService);
  private _eventPageData = inject(EventPageDataService);
  mapsApiService = inject(MapsApiService);

  /** True when the current user has admin rights — gates the edit button. */
  isAdmin = computed(() => this._authService.isAdmin());
  /** Toggles the inline edit form for the active event. Admin-only. */
  isEditingEvent = signal<boolean>(false);
  /** True while a save / delete is in flight (form disables itself). */
  isSavingEvent = signal<boolean>(false);

  private _queryParamsSubscription?: Subscription;
  private _paramMapSubscription?: Subscription;
  private _eventLoadRequestVersion = 0;
  private _spotsLoadRequestVersion = 0;
  private _challengeLoadRequestVersion = 0;

  /** The loaded event. Drives every visible field on the page. */
  event = signal<PkEvent | null>(null);

  selectedSpot = signal<Spot | LocalSpot | null>(null);
  selectedChallenge = signal<(SpotChallenge & { number: number }) | null>(null);
  selectedCustomMarker = signal<MarkerSchema | null>(null);

  sidenavOpen = signal<boolean>(false);
  tabs: Record<EventMapTab, string> = {
    event: $localize`Event`,
    spots: $localize`Spots`,
    challenges: $localize`Challenges`,
  };
  tab = signal<EventMapTab>("spots");
  private _hasInitializedResponsiveSidenav = false;
  private _userToggledSidenav = false;

  /**
   * Tabs to render in the sidebar. Hides "Challenges" when there are none —
   * an event without challenges shouldn't show an empty tab.
   */
  readonly visibleTabs = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (this.customMarkers().length > 0) {
      out["event"] = this.tabs.event;
    }
    out["spots"] = this.tabs.spots;
    if (this.challenges().length > 0) {
      out["challenges"] = this.tabs.challenges;
    }
    return out;
  });

  showHeader = signal<boolean>(true);
  isCompactView = false;
  private _isEmbedded = false;

  // Derived display values. Defaults keep the template safe before the event loads.
  readonly name = computed(() => this.event()?.name ?? "");
  readonly venueString = computed(() => this.event()?.venueString ?? "");
  readonly localityString = computed(() => this.event()?.localityString ?? "");
  readonly bannerImageSrc = computed(
    () => eventImageDisplaySrc(this.event()?.bannerSrc) ?? "",
  );
  readonly isSponsored = computed(() => this.event()?.isSponsored ?? false);
  readonly url = computed(() =>
    this._analytics.addUtmToUrl(
      this._safeExternalUrl(
        this.event()?.url ?? this.event()?.externalSource?.url,
      ),
      "event_page",
    ),
  );
  readonly bounds = computed(() => {
    const event = this.event();
    return event ? this._eventPageData.eventMapBounds(event) : null;
  });
  readonly focusZoom = computed(() => this.event()?.focusZoom ?? 18);
  /** Live event status, recomputed against the current event's dates. */
  readonly eventStatus = computed<EventStatus | null>(
    () => this.event()?.status() ?? null,
  );

  readonly customMarkers = computed<MarkerSchema[]>(() =>
    this._eventPageData.customMarkers(this.event()),
  );
  readonly eventLocationMarker = computed<EventPageMapMarker | null>(() =>
    this._eventPageData.eventLocationMarker(this.event()),
  );
  readonly staticMarkers = computed<EventPageMapMarker[]>(() => {
    return this.customMarkers();
  });
  readonly markers = signal<EventPageMapMarker[]>([]);
  readonly spotMapMarkers = computed<EventPageMapMarker[]>(() =>
    this._eventPageData.spotMapMarkers(this.spots()),
  );
  readonly mapPriorityMarkers = computed<EventPageMapMarker[]>(() =>
    this.markers(),
  );
  readonly areaPolygon = signal<PolygonSchema | null>(null);
  readonly visibleMapBounds = signal<EventBoundsSchema | null>(null);

  /**
   * Spots passed to the map's `highlightedSpots` input — these render as
   * `<app-highlight-marker>` at every zoom level (whereas plain `[spots]`
   * are only drawn at zoom ≥ 16). Used so an event with a low `focus_zoom`
   * still shows its participating spot pins when zoomed out.
   */
  readonly highlightedSpots = computed<SpotPreviewData[]>(() =>
    this._eventPageData.spotPreviewMarkers(this.spots()),
  );

  readonly challenges = signal<(SpotChallenge & { number: number })[]>([]);
  readonly spots = signal<(Spot | LocalSpot)[]>([]);

  /**
   * Lower bound on user zoom for the event-page map. Default is intentionally
   * permissive (10) so events with a low `focus_zoom` (city/region scale, e.g.
   * a multi-spot camp) still render — the previous default of 14 hid the
   * markers and inline spots when zoomed out further than the event's focus.
   */
  readonly minZoom = computed(() => this.event()?.minZoom ?? 10);

  platformId = inject(PLATFORM_ID);

  mapStyle: "roadmap" | "hybrid" = "hybrid";

  selectedLabels = signal<string[]>([]);
  selectedParticipantTypes = signal<string[]>([]);

  challengeParticipantTypes = ChallengeParticipantTypeValues;
  challengeParticipantTypeNames = ChallengeParticipantTypeNames;
  challengeParticipantTypeIcons = ChallengeParticipantTypeIcons;
  participantTypeCtrl = new FormControl<string[]>([], { nonNullable: true });
  labelCtrl = new FormControl<string[]>([], { nonNullable: true });

  readonly challengeLabels = ChallengeLabelValues;
  readonly challengeLabelNames = ChallengeLabelNames;
  readonly challengeLabelIcons = ChallengeLabelIcons;

  /** Backwards-compat alias for the existing template binding. */
  get hasSpotIds(): boolean {
    return (this.event()?.spotIds.length ?? 0) > 0;
  }

  constructor() {
    this._queryParamsSubscription = this._route.queryParams.subscribe(
      (params) => {
        if (params["showHeader"]) {
          this.showHeader.set(params["showHeader"] === "true");
        }
      },
    );

    // Keep event SEO on the SSR path so social crawlers see event-specific
    // OpenGraph/Twitter tags before any browser JavaScript runs.
    effect(() => {
      const event = this.event();
      if (!event) return;

      this._syncEventSeoData(event);
    });

    this.updateCompactView = this.updateCompactView.bind(this);
    if (isPlatformBrowser(this.platformId) && typeof window !== "undefined") {
      window.addEventListener("resize", this.updateCompactView);

      firstValueFrom(this._route.data.pipe(take(1))).then((data) => {
        if (data["routeName"]?.toLowerCase().includes("embed")) {
          this._isEmbedded = true;
          this.updateCompactView();
        }
      });

      this.updateCompactView();

      effect(() => {
        this.selectedChallenge();
        if (this.scrollContainer && this.scrollContainer.nativeElement) {
          setTimeout(() => {
            this.scrollContainer?.nativeElement.scrollTo({
              top: 0,
              behavior: "smooth",
            });
          });
        }
      });

      effect(() => {
        this.selectedSpot();
        if (
          this.spotScrollContainer &&
          this.spotScrollContainer.nativeElement
        ) {
          setTimeout(() => {
            this.spotScrollContainer?.nativeElement.scrollTo({
              top: 0,
              behavior: "smooth",
            });
          });
        }
      });

      // Build the area polygon for the map once the Maps API is ready and
      // the event document has loaded.
      effect(() => {
        this.areaPolygon.set(
          this._eventPageData.buildAreaPolygon(
            this.event(),
            this.mapsApiService.isApiLoaded(),
            this.visibleMapBounds(),
          ),
        );
      });

      // Load Firestore spots + inline event spots whenever the event changes.
      effect(() => {
        const event = this.event();
        if (!event) {
          this.spots.set([]);
          return;
        }

        const requestVersion = ++this._spotsLoadRequestVersion;
        this._eventPageData.loadEventSpots(event).then((spots) => {
          if (requestVersion === this._spotsLoadRequestVersion) {
            this.spots.set(spots);
          }
        });
      });

      // Build challenge markers + listings from the event's challenge_spot_map.
      effect(() => {
        const event = this.event();
        const spots = this.spots();
        const selectedLabels = this.selectedLabels();
        const selectedParticipantTypes = this.selectedParticipantTypes();

        if (!event || Object.keys(event.challengeSpotMap).length === 0) {
          this.markers.set(this.staticMarkers());
          return;
        }

        const requestVersion = ++this._challengeLoadRequestVersion;
        this._eventPageData
          .loadEventChallenges(event, spots)
          .then((allChallenges) => {
            if (requestVersion !== this._challengeLoadRequestVersion) return;

            this.challenges.set(
              this._eventPageData.numberChallenges(allChallenges),
            );
            const challengeMarkers = this._eventPageData.challengeMarkers(
              allChallenges,
              selectedLabels,
              selectedParticipantTypes,
            );

            if (challengeMarkers.length > 0) {
              this.markers.set([...this.customMarkers(), ...challengeMarkers]);
              this.tab.set("challenges");
            } else {
              this.markers.set(this.staticMarkers());
            }
          });
      });
    }
  }

  updateVisibleMapBounds(bounds: google.maps.LatLngBounds): void {
    this.visibleMapBounds.set(bounds.toJSON());
  }

  private async _loadEventFromRoute(paramMap: ParamMap) {
    const slug =
      paramMap.get("slug") ?? paramMap.get("eventID") ?? "swissjam25";
    const requestVersion = ++this._eventLoadRequestVersion;

    const loaded = await this._eventPageData.loadEventBySlugOrId(slug);

    if (requestVersion !== this._eventLoadRequestVersion) {
      return;
    }

    if (!loaded) {
      this._router.navigate(["/events"]);
      return;
    }

    this.event.set(loaded);
  }

  updateCompactView() {
    if (!isPlatformBrowser(this.platformId) || typeof window === "undefined") {
      return;
    }
    this.isCompactView = this._isEmbedded || window.innerWidth <= 576;
    const hasSidenavRoom = this._hasSidenavRoom();

    if (!this._hasInitializedResponsiveSidenav) {
      this.sidenavOpen.set(hasSidenavRoom);
      this._hasInitializedResponsiveSidenav = true;
      return;
    }

    if (!hasSidenavRoom) {
      this.sidenavOpen.set(false);
      return;
    }

    if (!this._userToggledSidenav) {
      this.sidenavOpen.set(true);
    }
  }

  public get isEmbedded(): boolean {
    return this._isEmbedded;
  }

  ngOnInit() {
    this._paramMapSubscription = this._route.paramMap.subscribe((paramMap) => {
      void this._loadEventFromRoute(paramMap);
    });

    if (
      isPlatformBrowser(this.platformId) &&
      !this.mapsApiService.isApiLoaded()
    ) {
      this.mapsApiService.loadGoogleMapsApi();
    }
  }

  spotClickedIndex(spotIndex: number) {
    this.selectSpot(this.spots()[spotIndex]);
  }

  ngOnDestroy() {
    if (isPlatformBrowser(this.platformId) && typeof window !== "undefined") {
      window.removeEventListener("resize", this.updateCompactView);
    }

    if (this._queryParamsSubscription) {
      this._queryParamsSubscription.unsubscribe();
    }

    if (this._paramMapSubscription) {
      this._paramMapSubscription.unsubscribe();
    }
  }

  private _syncEventSeoData(event: PkEvent): void {
    const canonicalPath = this._eventCanonicalPath(event);
    const description = this._eventDescription(event);
    const image =
      eventImageDisplaySrc(event.bannerSrc) ?? "/assets/banner_1200x630.png";

    this.metaTagService.setEventMetaTags(
      {
        name: event.name,
        image,
        description,
      },
      canonicalPath,
    );

    this.metaTagService.setRobotsContent(
      "noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );
  }

  private _eventCanonicalPath(event: PkEvent): string {
    return this._eventPageData.eventCanonicalPath(event);
  }

  private _eventDescription(event: PkEvent): string {
    const range = formatDateRange(event.start, event.end, this.locale);

    return (
      event.description ??
      $localize`Event in ` + event.localityString + ` (${range})`
    );
  }

  trackWebsiteClick() {
    const event = this.event();
    this._analytics.trackEvent("click_event_website", {
      surface: "event_page",
      event_id: event?.id,
      event_slug: event?.slug,
      event_name: event?.name,
      event_status: this.eventStatus(),
      is_sponsored: event?.isSponsored ?? false,
      sponsor_name: event?.sponsor?.name,
      external_provider: event?.externalSource?.provider,
      url: this.url(),
    });
    return true;
  }

  async shareEvent() {
    const event = this.event();
    if (!event) return;

    const { buildAbsoluteUrlNoLocale } =
      await import("../../../scripts/Helpers");
    const link = buildAbsoluteUrlNoLocale(`/events/${event.slug ?? event.id}`);

    const shareData = {
      title: event.name,
      text: `PK Spot: ${event.name}`,
      url: link,
    };

    const { Capacitor } = await import("@capacitor/core");
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      const { Share } = await import("@capacitor/share");
      try {
        await Share.share({ ...shareData, dialogTitle: "Share Event" });
      } catch (err) {
        console.error("Couldn't share this event", err);
      }
    } else if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error("Couldn't share this event", err);
      }
    } else {
      navigator.clipboard.writeText(`${event.name} - PK Spot \n${link}`);
      this._snackbar.open(
        `Link to ${event.name} event copied to clipboard`,
        "Dismiss",
        {
          duration: 3000,
          horizontalPosition: "center",
          verticalPosition: "top",
        },
      );
    }
  }

  selectSpot(spot: Spot | LocalSpot | SpotId | SpotPreviewData) {
    this.tab.set("spots");
    this.sidenavOpen.set(true);
    this.selectedCustomMarker.set(null);
    this.selectedChallenge.set(null);

    if (this._isSpotPreviewData(spot)) {
      const resolvedSpot = this._resolveSpotPreviewSelection(spot);
      if (resolvedSpot) {
        this._selectResolvedSpot(resolvedSpot);
      }
      return;
    }

    if (typeof spot === "string") {
      const resolvedSpot = this.spots().find(
        (eventSpot) => eventSpot instanceof Spot && eventSpot.id === spot,
      );
      if (resolvedSpot) {
        this._selectResolvedSpot(resolvedSpot);
      }
      return;
    }

    if (spot instanceof Spot || spot instanceof LocalSpot) {
      this._selectResolvedSpot(spot);
    }
  }

  private _isSpotPreviewData(
    spot: Spot | LocalSpot | SpotId | SpotPreviewData,
  ): spot is SpotPreviewData {
    return (
      typeof spot === "object" &&
      !(spot instanceof Spot) &&
      !(spot instanceof LocalSpot) &&
      "id" in spot
    );
  }

  private _resolveSpotPreviewSelection(
    preview: SpotPreviewData,
  ): Spot | LocalSpot | null {
    const directSpot = this.spots().find(
      (spot) => spot instanceof Spot && spot.id === preview.id,
    );
    if (directSpot) return directSpot;

    const localIndexMatch = /^event-local-spot-(\d+)$/u.exec(
      String(preview.id),
    );
    if (!localIndexMatch) return null;

    const index = Number(localIndexMatch[1]);
    const localSpot = this.spots()[index];
    return localSpot instanceof LocalSpot ? localSpot : null;
  }

  private _selectResolvedSpot(spot: Spot | LocalSpot): void {
    this.selectedSpot.set(spot);
    if (this.spotMap instanceof SpotMapComponent) {
      this.spotMap?.focusSpot(spot);
    } else if (this.spotMap instanceof GoogleMap2dComponent) {
      this.spotMap?.focusOnLocation(spot.location());
    }
  }

  getSpotPreviewZoom(): number | null {
    if (this.spotMap instanceof SpotMapComponent) {
      return this.spotMap.mapZoom();
    }
    if (this.spotMap instanceof GoogleMap2dComponent) {
      return this.spotMap.zoom;
    }
    return null;
  }

  challengeClickedIndex(challengeIndex: number) {
    const challenge = this.challenges()[challengeIndex];
    if (!challenge) return;
    const location = challenge.location()!;
    this.tab.set("challenges");
    this.selectedSpot.set(null);
    this.selectedCustomMarker.set(null);
    this.selectedChallenge.set(challenge);

    if (this.spotMap instanceof SpotMapComponent && this.spotMap.map) {
      this.spotMap.map.focusOnLocation(location);
    } else if (this.spotMap instanceof GoogleMap2dComponent) {
      this.spotMap.focusOnLocation(location);
    }
  }

  deselectSpot() {
    this.selectedSpot.set(null);
    this.selectedChallenge.set(null);
    this.selectedCustomMarker.set(null);
  }

  toggleSidenav() {
    this._userToggledSidenav = true;
    this.sidenavOpen.update((open) => !open);
  }

  selectTab(tab: string): void {
    if (tab === "event" || tab === "spots" || tab === "challenges") {
      this.tab.set(tab);
    }
  }

  markerClick(markerIndex: number) {
    const marker = this.mapPriorityMarkers()[markerIndex];
    if (marker?.type === "event-custom") {
      this.selectCustomMarker(marker);
      return;
    }
    if (marker?.type === "event-spot" && marker.spotIndex !== undefined) {
      this.selectSpot(this.spots()[marker.spotIndex]);
      return;
    }
    if (marker?.type === "challenge" && marker.challengeIndex !== undefined) {
      this.challangeMarkerClicked(marker.challengeIndex);
    }
  }

  challangeMarkerClicked(challengeIndex: number) {
    const challenge = this.challenges()[challengeIndex];
    if (!challenge) return;

    this.tab.set("challenges");
    this.sidenavOpen.set(true);
    this.selectedSpot.set(null);
    this.selectedCustomMarker.set(null);
    this.selectedChallenge.set(challenge);
  }

  selectCustomMarker(marker: MarkerSchema): void {
    this.tab.set("event");
    this.sidenavOpen.set(true);
    this.selectedSpot.set(null);
    this.selectedChallenge.set(null);
    this.selectedCustomMarker.set(marker);
    this.focusCustomMarker(marker);
  }

  focusCustomMarker(marker: MarkerSchema): void {
    if (this.spotMap instanceof SpotMapComponent && this.spotMap.map) {
      this.spotMap.map.focusOnLocation(marker.location, this.focusZoom());
    } else if (this.spotMap instanceof GoogleMap2dComponent) {
      this.spotMap.focusOnLocation(marker.location, this.focusZoom());
    }
  }

  tabChanged(event: MatChipListboxChange) {
    const selectedTab = event.value as EventMapTab | undefined;
    if (selectedTab) {
      this.tab.set(selectedTab);
    }
  }

  onMarkerClickFromMap(event: number | { marker: any; index?: number }) {
    const index = typeof event === "number" ? event : event?.index;
    if (typeof index === "number") {
      this.markerClick(index);
    } else {
      console.warn("markerClickEvent payload missing index", event);
    }
  }

  private _formatDateForMeta(date: Date): string {
    return date.toLocaleDateString(this.locale, { dateStyle: "medium" });
  }

  private _isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private _hasSidenavRoom(): boolean {
    return (
      !this._isEmbedded &&
      isPlatformBrowser(this.platformId) &&
      typeof window !== "undefined" &&
      window.innerWidth >= 992
    );
  }

  // ---------------------------------------------------------------------
  // Admin edit / delete handlers — wired to <app-event-edit-form>.
  // The form is only rendered when isAdmin() && isEditingEvent() in the
  // template, so the handlers below trust those preconditions.
  // ---------------------------------------------------------------------

  startEditingEvent(): void {
    if (!this.isAdmin()) return;
    this.isEditingEvent.set(true);
  }

  cancelEditingEvent(): void {
    this.isEditingEvent.set(false);
  }

  async onSaveEvent(patch: EventEditPatch): Promise<void> {
    const current = this.event();
    if (!current || !this.isAdmin()) return;
    this.isSavingEvent.set(true);
    try {
      await this._eventsService.updateEvent(current.id, patch);
      // Reload from Firestore so all downstream computeds (status,
      // countdown, structured data) see the new values.
      const reloaded = await this._eventsService.getEventById(current.id);
      if (reloaded) {
        this.event.set(reloaded);
      }
      this.isEditingEvent.set(false);
      this._snackbar.open(
        $localize`:@@event_edit.snackbar.saved:Event saved.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 3000 },
      );
    } catch (err) {
      console.error("Failed to save event", err);
      this._snackbar.open(
        $localize`:@@event_edit.snackbar.save_failed:Couldn't save the event. Check the console for details.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 5000 },
      );
    } finally {
      this.isSavingEvent.set(false);
    }
  }

  async onDeleteEvent(): Promise<void> {
    const current = this.event();
    if (!current || !this.isAdmin()) return;
    this.isSavingEvent.set(true);
    try {
      await this._eventsService.deleteEvent(current.id);
      this._snackbar.open(
        $localize`:@@event_edit.snackbar.deleted:Event deleted.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 3000 },
      );
      // Leave the page — the event no longer exists.
      this._router.navigate(["/events"]);
    } catch (err) {
      console.error("Failed to delete event", err);
      this._snackbar.open(
        $localize`:@@event_edit.snackbar.delete_failed:Couldn't delete the event.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 5000 },
      );
      this.isSavingEvent.set(false);
    }
  }

  private _safeExternalUrl(value: string | undefined): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.toString();
      }
    } catch {
      return null;
    }
    return null;
  }
}
