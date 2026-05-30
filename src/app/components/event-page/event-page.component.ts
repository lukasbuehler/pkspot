import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { ActivatedRoute, ParamMap, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatChipsModule } from "@angular/material/chips";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { Subscription, firstValueFrom, take } from "rxjs";
import { Event as PkEvent, EventProgramItem } from "../../../db/models/Event";
import {
  EventCategory,
  EventBoundsSchema,
  EventLinkSchema,
  EventQualificationRefSchema,
  EventSchema,
  EventSeriesMembershipSchema,
} from "../../../db/schemas/EventSchema";
import { EventTicketOption } from "../../../db/models/Event";
import { LocaleCode, MediaType } from "../../../db/models/Interfaces";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { MarkerSchema } from "../map/markers/map-marker.model";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { MapsApiService } from "../../services/maps-api.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { StructuredDataService } from "../../services/structured-data.service";
import { AnalyticsService } from "../../services/analytics.service";
import { EventPageDataService } from "../../services/event-page/event-page-data.service";
import { SearchService } from "../../services/search.service";
import { environment } from "../../../environments/environment";
import { GoogleMap2dComponent } from "../google-map-2d/google-map-2d.component";
import {
  EventEditFormComponent,
  EventEditPatch,
} from "../event-edit-form/event-edit-form.component";
import { EventRsvpComponent } from "../event-rsvp/event-rsvp.component";
import { EventHeroMediaComponent } from "../event-display/event-hero-media.component";
import { EventSummaryMetaComponent } from "../event-display/event-summary-meta.component";
import { EventCardComponent } from "../event-card/event-card.component";
import { EventProgramTimelineComponent } from "./event-program-timeline.component";
import {
  eventStatusLabel,
  type EventStatus,
} from "../event-display/event-display.helpers";
import { isBot, formatDateRange } from "../../../scripts/Helpers";

@Component({
  selector: "app-event-info-page",
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    GoogleMap2dComponent,
    EventEditFormComponent,
    EventRsvpComponent,
    EventHeroMediaComponent,
    EventSummaryMetaComponent,
    EventCardComponent,
    EventProgramTimelineComponent,
  ],
  templateUrl: "./event-page.component.html",
  styleUrl: "./event-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventInfoPageComponent implements OnInit, OnDestroy {
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _snackbar = inject(MatSnackBar);
  private _eventsService = inject(EventsService);
  private _authService = inject(AuthenticationService);
  private _analytics = inject(AnalyticsService);
  private _structuredData = inject(StructuredDataService);
  private _metaTags = inject(MetaTagService);
  private _eventPageData = inject(EventPageDataService);
  private _search = inject(SearchService);
  private _platformId = inject(PLATFORM_ID);
  private _locale = inject<LocaleCode>(LOCALE_ID);
  readonly mapsApiService = inject(MapsApiService);

  private _paramMapSubscription?: Subscription;
  private _queryParamsSubscription?: Subscription;
  private _eventSnapshotSubscription?: Subscription;
  private _eventLoadRequestVersion = 0;
  private _spotsLoadRequestVersion = 0;
  private _qualifierLoadRequestVersion = 0;

  readonly event = signal<PkEvent | null>(null);
  readonly spots = signal<(Spot | LocalSpot)[]>([]);
  readonly areaPolygon = signal<PolygonSchema | null>(null);
  readonly mapPreviewViewportBounds = signal<EventBoundsSchema | null>(null);
  readonly showHeader = signal(true);
  readonly isEmbedded = signal(false);
  readonly isBrowser = signal(isPlatformBrowser(this._platformId));
  readonly isCrawler = signal(this.isBrowser() && isBot());
  readonly isEditingEvent = signal(false);
  readonly isSavingEvent = signal(false);
  readonly qualifierEventsById = signal<Record<string, PkEvent>>({});
  readonly isLoadingQualifierEvents = signal(false);
  readonly isAdmin = computed(() => this._authService.isAdmin());

  readonly dateRange = computed(() => {
    const event = this.event();
    if (!event) return "";
    return formatDateRange(event.start, event.end, this._locale, "long");
  });
  readonly description = computed(() => {
    const event = this.event();
    if (!event) return "";
    return (
      event.description ??
      $localize`Event in ` + event.localityString + ` (${this.dateRange()})`
    );
  });

  readonly name = computed(() => this.event()?.name ?? "");
  readonly mapRoute = computed(() => {
    const event = this.event();
    return event ? ["/events", event.slug ?? event.id, "map"] : ["/events"];
  });
  readonly organizer = computed(() => this.event()?.organizer?.organization);
  readonly organizerName = computed(() => this.organizer()?.name ?? "");
  readonly status = computed<EventStatus | null>(
    () => this.event()?.status() ?? null,
  );
  readonly showRsvp = computed(() => this.status() === "upcoming");
  readonly statusLabel = computed(() => {
    const event = this.event();
    const status = this.status();
    if (!event || !status) return "";
    return eventStatusLabel(event, status, this._locale);
  });
  readonly startDateTime = computed(() => {
    const event = this.event();
    if (!event) return "";
    return event.start.toLocaleString(this._locale, {
      dateStyle: "full",
      timeStyle: "short",
    });
  });
  readonly websiteUrl = computed(() =>
    this._analytics.addUtmToUrl(
      this._safeExternalUrl(
        this.event()?.url ?? this.event()?.externalSource?.url,
      ),
      "event_page",
    ),
  );
  readonly eventLinks = computed<EventLinkSchema[]>(() => {
    const event = this.event();
    if (!event) return [];

    const links = [...event.eventLinks];
    const fallbackUrl = this._safeExternalUrl(
      event.url ?? event.externalSource?.url,
    );
    if (fallbackUrl && !links.some((link) => link.url === fallbackUrl)) {
      links.unshift({
        label: $localize`:@@event_info.website_button:Website`,
        url: fallbackUrl,
        kind: event.externalSource ? "other" : "website",
        provider: event.externalSource?.provider,
        primary: links.length === 0,
      });
    }

    return links
      .map((link) => ({
        ...link,
        url:
          this._analytics.addUtmToUrl(
            this._safeExternalUrl(link.url),
            "event_page",
          ) ?? link.url,
      }))
      .filter((link) => !!this._safeExternalUrl(link.url));
  });
  readonly ticketOptions = computed(() => this.event()?.ticketOptions ?? []);
  readonly activeProgramItems = computed<EventProgramItem[]>(() => {
    const event = this.event();
    if (!event?.program) return [];
    const activePlan =
      event.program.plans.find(
        (plan) => plan.id === event.program?.active_plan_id,
      ) ?? event.program.plans[0];
    return activePlan?.items ?? [];
  });
  readonly visibleSeriesMemberships = computed(() =>
    [
      ...(this.event()?.seriesMemberships ?? []),
      ...this.activeProgramItems().flatMap(
        (item) => item.series_memberships ?? [],
      ),
    ].filter(
      (membership, index, memberships) =>
        memberships.findIndex(
          (candidate) =>
            candidate.series_id === membership.series_id &&
            candidate.role === membership.role,
        ) === index,
    ),
  );
  readonly qualificationMemberships = computed(() =>
    this.visibleSeriesMemberships().filter(
      (membership) =>
        membership.qualification_required ||
        (membership.required_qualifiers?.length ?? 0) > 0,
    ),
  );
  readonly requiredQualifierRefs = computed(() =>
    this.qualificationMemberships()
      .flatMap((membership) => membership.required_qualifiers ?? [])
      .filter(
        (ref, index, refs) =>
          refs.findIndex(
            (candidate) =>
              candidate.event_id === ref.event_id &&
              candidate.program_item_id === ref.program_item_id,
          ) === index,
      ),
  );
  readonly mapMarkers = computed<MarkerSchema[]>(() => {
    const event = this.event();
    if (!event) return [];
    return [
      ...this._eventPageData.customMarkers(event),
      ...this._eventPageData.spotMapMarkers(this.spots()),
    ];
  });
  readonly mapPreviewBounds = computed(() => {
    const event = this.event();
    return event ? this._eventPageData.eventMapBounds(event) : null;
  });
  readonly hasMapPreview = computed(
    () =>
      this.isBrowser() &&
      !this.isCrawler() &&
      !!this.mapPreviewBounds() &&
      this.mapMarkers().length > 0,
  );

  constructor() {
    this._queryParamsSubscription = this._route.queryParams.subscribe(
      (params) => {
        if (params["showHeader"] !== undefined) {
          this.showHeader.set(params["showHeader"] === "true");
        }
      },
    );

    firstValueFrom(this._route.data.pipe(take(1))).then((data) => {
      this.isEmbedded.set(
        String(data["routeName"] ?? "")
          .toLowerCase()
          .includes("embed"),
      );
    });

    effect(() => {
      const event = this.event();
      if (!event) return;
      this._syncEventSeoData(event);
    });

    if (isPlatformBrowser(this._platformId)) {
      effect(() => {
        const event = this.event();
        if (!event || this.isCrawler()) {
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

      effect(() => {
        const refs = this.requiredQualifierRefs();
        const eventIds = [...new Set(refs.map((ref) => ref.event_id))].filter(
          Boolean,
        );
        const requestVersion = ++this._qualifierLoadRequestVersion;

        if (eventIds.length === 0 || this.isCrawler()) {
          this.qualifierEventsById.set({});
          this.isLoadingQualifierEvents.set(false);
          return;
        }

        this.isLoadingQualifierEvents.set(true);
        this._search.getEventCardsByIds(eventIds).then((events) => {
          if (requestVersion !== this._qualifierLoadRequestVersion) return;
          this.qualifierEventsById.set(
            Object.fromEntries(events.map((event) => [event.id, event])),
          );
          this.isLoadingQualifierEvents.set(false);
        });
      });

      effect(() => {
        const event = this.event();
        const viewportBounds = this.mapPreviewViewportBounds();
        const polygon = this._eventPageData.buildAreaPolygon(
          event,
          this.mapsApiService.isApiLoaded(),
          viewportBounds,
        );
        this.areaPolygon.set(polygon);
      });
    }
  }

  updateMapPreviewViewportBounds(bounds: google.maps.LatLngBounds): void {
    this.mapPreviewViewportBounds.set(bounds.toJSON());
  }

  ngOnInit(): void {
    this._paramMapSubscription = this._route.paramMap.subscribe((paramMap) => {
      if (this.isBrowser()) {
        this._subscribeToEventFromRoute(paramMap);
      } else {
        void this._loadEventFromRoute(paramMap);
      }
    });

    if (
      this.isBrowser() &&
      !this.isCrawler() &&
      !this.mapsApiService.isApiLoaded()
    ) {
      this.mapsApiService.loadGoogleMapsApi();
    }
  }

  ngOnDestroy(): void {
    this._structuredData.removeStructuredData("event");
    this._paramMapSubscription?.unsubscribe();
    this._queryParamsSubscription?.unsubscribe();
    this._eventSnapshotSubscription?.unsubscribe();
  }

  trackWebsiteClick(): boolean {
    const event = this.event();
    this._analytics.trackEvent("click_event_website", {
      surface: "event_info_page",
      event_id: event?.id,
      event_slug: event?.slug,
      event_name: event?.name,
      event_status: event?.status(),
      is_sponsored: event?.isSponsored ?? false,
      sponsor_name: event?.sponsor?.name,
      organizer_name: this.organizerName(),
      external_provider: event?.externalSource?.provider,
      url: this.websiteUrl(),
    });
    return true;
  }

  trackEventLinkClick(link: EventLinkSchema): boolean {
    const event = this.event();
    this._analytics.trackEvent("click_event_link", {
      surface: "event_info_page",
      event_id: event?.id,
      event_slug: event?.slug,
      event_name: event?.name,
      event_status: event?.status(),
      link_kind: link.kind,
      link_label: link.label,
      provider: link.provider,
      url: link.url,
    });
    return true;
  }

  async shareEvent(): Promise<void> {
    const event = this.event();
    if (!event) return;

    const { buildAbsoluteUrlNoLocale } =
      await import("../../../scripts/Helpers");
    const link = buildAbsoluteUrlNoLocale(
      this._eventPageData.eventCanonicalPath(event),
    );
    const shareData = {
      title: event.name,
      text: `PK Spot: ${event.name}`,
      url: link,
    };

    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      try {
        await Share.share({ ...shareData, dialogTitle: "Share Event" });
      } catch (err) {
        console.error("Couldn't share this event", err);
      }
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error("Couldn't share this event", err);
      }
      return;
    }

    await navigator.clipboard.writeText(`${event.name} - PK Spot \n${link}`);
    this._snackbar.open(
      $localize`:@@event_info.link_copied:Event link copied to clipboard.`,
      $localize`:@@common.dismiss:Dismiss`,
      { duration: 3000, horizontalPosition: "center", verticalPosition: "top" },
    );
  }

  startEditingEvent(): void {
    if (this.isAdmin()) {
      this.isEditingEvent.set(true);
    }
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
      void this._router.navigate(["/events"]);
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

  private _subscribeToEventFromRoute(paramMap: ParamMap): void {
    const slug =
      paramMap.get("slug") ?? paramMap.get("eventID") ?? "swissjam25";
    const requestVersion = ++this._eventLoadRequestVersion;
    this._eventSnapshotSubscription?.unsubscribe();
    this._eventSnapshotSubscription = this._eventPageData
      .observeEventBySlugOrId(slug)
      .subscribe({
        next: (loaded) => {
          if (requestVersion !== this._eventLoadRequestVersion) return;
          if (!loaded) {
            void this._router.navigate(["/events"]);
            return;
          }
          this.event.set(loaded);
        },
        error: (err) => {
          if (requestVersion !== this._eventLoadRequestVersion) return;
          console.warn("EventInfoPageComponent: failed to observe event", err);
          void this._router.navigate(["/events"]);
        },
      });
  }

  private async _loadEventFromRoute(paramMap: ParamMap): Promise<void> {
    const slug =
      paramMap.get("slug") ?? paramMap.get("eventID") ?? "swissjam25";
    const requestVersion = ++this._eventLoadRequestVersion;
    const loaded = await this._eventPageData.loadEventBySlugOrId(slug);

    if (requestVersion !== this._eventLoadRequestVersion) return;
    if (!loaded) {
      void this._router.navigate(["/events"]);
      return;
    }
    this.event.set(loaded);
  }

  private _syncEventSeoData(event: PkEvent): void {
    const canonicalPath = this._eventPageData.eventCanonicalPath(event);
    const description = this.description();
    const image = this._eventSocialImage(event);

    this._metaTags.setEventMetaTags(
      { name: event.name, image, description },
      canonicalPath,
    );

    this._structuredData.addStructuredData(
      "event",
      event.structuredData ??
        this._buildEventStructuredData(event, canonicalPath, description),
    );
  }

  private _buildEventStructuredData(
    event: PkEvent,
    canonicalPath: string,
    description: string,
  ): Record<string, unknown> {
    return {
      "@type": "Event",
      name: event.name,
      startDate: event.start.toISOString(),
      endDate: event.end.toISOString(),
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: event.venueString || event.localityString || event.name,
        address: {
          "@type": "PostalAddress",
          addressLocality: event.localityString || undefined,
        },
      },
      image: [
        ...this._eventStructuredImages(event).map((src) =>
          this._absoluteUrl(src),
        ),
      ],
      description,
      url: `${environment.baseUrl}/${this._locale}${canonicalPath}`,
      sameAs: event.url,
      organizer: event.organizer
        ? {
            "@type": "Organization",
            name: event.organizer.organization.name,
            url: event.organizer.organization.slug
              ? `${environment.baseUrl}/${this._locale}/organizations/${event.organizer.organization.slug}`
              : undefined,
          }
        : undefined,
      offers: this._buildEventOffers(event),
    };
  }

  formatTicketPrice(ticket: EventTicketOption): string {
    const price = ticket.price;
    if (!price) {
      return $localize`:@@event_tickets.price_unknown:Price TBA`;
    }
    if ("amount" in price) {
      return this._formatCurrency(price.amount, price.currency);
    }
    return `${this._formatCurrency(
      price.min_amount,
      price.currency,
    )} - ${this._formatCurrency(price.max_amount, price.currency)}`;
  }

  ticketAvailabilityLabel(ticket: EventTicketOption): string {
    switch (ticket.availability) {
      case "available":
        return $localize`:@@event_tickets.availability.available:Available`;
      case "coming_soon":
        return $localize`:@@event_tickets.availability.coming_soon:Coming soon`;
      case "sold_out":
        return $localize`:@@event_tickets.availability.sold_out:Sold out`;
      case "waitlist":
        return $localize`:@@event_tickets.availability.waitlist:Waitlist`;
      case "ended":
        return $localize`:@@event_tickets.availability.ended:Ended`;
      default:
        return "";
    }
  }

  ticketBadgeLabel(ticket: EventTicketOption): string {
    switch (ticket.badge) {
      case "early_bird":
        return $localize`:@@event_tickets.badge.early_bird:Early bird`;
      case "discount":
        return $localize`:@@event_tickets.badge.discount:Discount`;
      case "regular":
        return $localize`:@@event_tickets.badge.regular:Regular`;
      case "late":
        return $localize`:@@event_tickets.badge.late:Late`;
      case "member":
        return $localize`:@@event_tickets.badge.member:Member`;
      default:
        return "";
    }
  }

  eventLinkIcon(link: EventLinkSchema): string {
    switch (link.kind) {
      case "tickets":
        return "paid";
      case "schedule":
        return "calendar_month";
      case "results":
        return "checklist";
      case "livestream":
        return "video_camera_front";
      case "website":
        return "language";
      default:
        return "open_in_new";
    }
  }

  categoryLabel(category: EventCategory): string {
    switch (category) {
      case "jam":
        return $localize`:@@event_category.jam:Jam`;
      case "competition":
        return $localize`:@@event_category.competition:Competition`;
      case "workshop":
        return $localize`:@@event_category.workshop:Workshop`;
      case "camp":
        return $localize`:@@event_category.camp:Camp`;
      case "show":
        return $localize`:@@event_category.show:Show`;
      case "awards":
        return $localize`:@@event_category.awards:Awards`;
      case "social":
        return $localize`:@@event_category.social:Social`;
      case "travel":
        return $localize`:@@event_category.travel:Travel`;
      default:
        return $localize`:@@event_category.other:Other`;
    }
  }

  seriesLabel(seriesId: string): string {
    switch (seriesId) {
      case "swiss-parkour-tour":
        return "Swiss Parkour Tour";
      case "parkour-earth":
        return "Parkour Earth";
      case "sport-parkour-league":
        return "Sport Parkour League";
      default:
        return seriesId
          .split("-")
          .filter(Boolean)
          .map((word) => word[0]?.toUpperCase() + word.slice(1))
          .join(" ");
    }
  }

  seriesRoleLabel(role: EventSeriesMembershipSchema["role"]): string {
    switch (role) {
      case "qualifier":
        return $localize`:@@event_series_role.qualifier:Qualifier`;
      case "final":
        return $localize`:@@event_series_role.final:Final`;
      case "championship":
        return $localize`:@@event_series_role.championship:Championship`;
      case "feeder":
        return $localize`:@@event_series_role.feeder:Feeder`;
      case "related":
        return $localize`:@@event_series_role.related:Related`;
      default:
        return $localize`:@@event_series_role.series_event:Series event`;
    }
  }

  qualificationRefLabel(ref: EventQualificationRefSchema): string {
    const eventLabel = this._knownQualificationEventLabel(String(ref.event_id));
    return ref.program_item_id
      ? `${eventLabel} / ${this._humanizeSlug(ref.program_item_id)}`
      : eventLabel;
  }

  qualifierEventsFor(membership: EventSeriesMembershipSchema): PkEvent[] {
    const eventsById = this.qualifierEventsById();
    return (membership.required_qualifiers ?? [])
      .map((ref) => eventsById[ref.event_id])
      .filter((event): event is PkEvent => !!event)
      .filter(
        (event, index, events) =>
          events.findIndex((candidate) => candidate.id === event.id) === index,
      );
  }

  private _knownQualificationEventLabel(eventId: string): string {
    switch (eventId) {
      case "parkour-expo-skill-2026":
        return "Parkour Expo Skill Competition 2026";
      case "nurf-skill-2026":
        return "Nurf Skill Competition 2026";
      case "parkour-luzern-speed-2026":
        return "Parkour Luzern Speed Competition 2026";
      case "parkour-day-staefa-2026":
        return "Parkour Day Stafa 2026";
      case "wpf-skills-competition-2026":
        return "WPF Skills Competition 2026";
      default:
        return this._humanizeSlug(eventId);
    }
  }

  private _humanizeSlug(value: string): string {
    return value
      .split("-")
      .filter(Boolean)
      .map((word) =>
        /^\\d+$/.test(word) || word.length <= 3
          ? word.toUpperCase()
          : word[0]?.toUpperCase() + word.slice(1),
      )
      .join(" ");
  }

  private _absoluteUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    return `${environment.baseUrl}/${path.replace(/^\/+/, "")}`;
  }

  private _formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat(this._locale, {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  }

  private _buildEventOffers(event: PkEvent): unknown {
    const offers = event.ticketOptions
      .map((ticket) => this._buildTicketOffer(ticket))
      .filter((offer): offer is Record<string, unknown> => offer !== null);

    if (offers.length > 0) {
      return offers.length === 1 ? offers[0] : offers;
    }

    const url = this._safeExternalUrl(event.url);
    return url ? { "@type": "Offer", url } : undefined;
  }

  private _buildTicketOffer(
    ticket: EventTicketOption,
  ): Record<string, unknown> | null {
    const url = this._safeExternalUrl(ticket.url);
    const price = ticket.price;
    if (!url && !price) return null;

    return {
      "@type": "Offer",
      name: ticket.label,
      description: ticket.description,
      url,
      price: price
        ? "amount" in price
          ? price.amount
          : price.min_amount
        : undefined,
      priceCurrency: price?.currency,
      availability: ticket.availability
        ? `https://schema.org/${this._schemaAvailability(ticket.availability)}`
        : undefined,
      validFrom: ticket.saleStartsAt?.toISOString(),
      priceValidUntil: ticket.saleEndsAt?.toISOString(),
    };
  }

  private _schemaAvailability(availability: string): string {
    switch (availability) {
      case "sold_out":
        return "SoldOut";
      case "coming_soon":
        return "PreOrder";
      case "ended":
        return "Discontinued";
      case "waitlist":
        return "LimitedAvailability";
      default:
        return "InStock";
    }
  }

  private _eventSocialImage(event: PkEvent): string {
    return (
      event.bannerSrc ??
      event.media.find((item) => item.type === MediaType.Image)?.src ??
      event.inlineSpots.flatMap((spot) => spot.images ?? [])[0] ??
      "/assets/banner_1200x630.png"
    );
  }

  private _eventStructuredImages(event: PkEvent): string[] {
    const images = [
      this._eventSocialImage(event),
      ...event.media
        .filter((item) => item.type === MediaType.Image)
        .map((item) => item.src),
      ...event.inlineSpots.flatMap((spot) => spot.images ?? []),
    ];
    return [...new Set(images)];
  }

  private _isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
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
