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
import { Subscription, firstValueFrom, take } from "rxjs";
import { Event as PkEvent } from "../../../db/models/Event";
import {
  EventLinkSchema,
  EventSchema,
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
import { environment } from "../../../environments/environment";
import { GoogleMap2dComponent } from "../google-map-2d/google-map-2d.component";
import {
  EventEditFormComponent,
  EventEditPatch,
} from "../event-edit-form/event-edit-form.component";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";
import { EventRsvpComponent } from "../event-rsvp/event-rsvp.component";
import { ImgCarouselComponent } from "../img-carousel/img-carousel.component";
import {
  AnyMedia,
  ExternalImage,
  ExternalVideo,
} from "../../../db/models/Media";
import { MediaSchema } from "../../../db/schemas/Media";
import { isBot } from "../../../scripts/Helpers";

type EventStatus = "upcoming" | "live" | "past";

@Component({
  selector: "app-event-info-page",
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    GoogleMap2dComponent,
    EventEditFormComponent,
    MediaPlaceholderComponent,
    EventRsvpComponent,
    ImgCarouselComponent,
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
  private _platformId = inject(PLATFORM_ID);
  private _locale = inject<LocaleCode>(LOCALE_ID);
  readonly mapsApiService = inject(MapsApiService);

  private _paramMapSubscription?: Subscription;
  private _queryParamsSubscription?: Subscription;
  private _eventSnapshotSubscription?: Subscription;
  private _eventLoadRequestVersion = 0;
  private _spotsLoadRequestVersion = 0;

  readonly event = signal<PkEvent | null>(null);
  readonly spots = signal<(Spot | LocalSpot)[]>([]);
  readonly areaPolygon = signal<PolygonSchema | null>(null);
  readonly showHeader = signal(true);
  readonly isEmbedded = signal(false);
  readonly isBrowser = signal(isPlatformBrowser(this._platformId));
  readonly isCrawler = signal(this.isBrowser() && isBot());
  readonly isEditingEvent = signal(false);
  readonly isSavingEvent = signal(false);
  readonly isAdmin = computed(() => this._authService.isAdmin());
  readonly isSponsored = computed(() => this.event()?.isSponsored ?? false);

  readonly startDateText = computed(() => this.event()?.start.toLocaleDateString(this._locale, {
    dateStyle: "medium",
  }));
  readonly endDateText = computed(() => this.event()?.end.toLocaleDateString(this._locale, {
    dateStyle: "medium",
  }));
  readonly description = computed(() => {
    const event = this.event();
    if (!event) return "";
    const startDateText = this.startDateText();
    const endDateText = this.endDateText();
    return (
      event.description ??
      $localize`Event in ` +
      event.localityString +
      ", (" +
      (this._isSameDay(event.start, event.end)
        ? startDateText
        : `${startDateText} - ${endDateText}`) +
      ")"
    );
  });

  readonly name = computed(() => this.event()?.name ?? "");
  readonly heroMedia = computed<AnyMedia[]>(() => {
    const event = this.event();
    if (!event) return [];

    const media = [
      ...(event.bannerSrc ? [new ExternalImage(event.bannerSrc)] : []),
      ...event.media.map((item) => this._eventMediaFromSchema(item)),
      ...event.inlineSpots
        .flatMap((spot) => spot.images ?? [])
        .map((src) => new ExternalImage(src)),
    ];
    const seen = new Set<string>();
    return media.filter((item) => {
      if (seen.has(item.baseSrc)) return false;
      seen.add(item.baseSrc);
      return true;
    });
  });
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
    if (status === "past") {
      return $localize`:@@events.status.past:Past event`;
    }

    const target = status === "live" ? event.end : event.start;
    const relative = this._relativeFromNow(target);
    if (status === "live") {
      return $localize`:@@events.status.live_with_end:Ongoing — ends ${relative}`;
    }
    return $localize`:@@events.status.upcoming_starts:Starts ${relative}`;
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
        url: this._analytics.addUtmToUrl(
          this._safeExternalUrl(link.url),
          "event_page",
        ) ?? link.url,
      }))
      .filter((link) => !!this._safeExternalUrl(link.url));
  });
  readonly ticketOptions = computed(() => this.event()?.ticketOptions ?? []);
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
        const event = this.event();
        const polygon = this._eventPageData.buildAreaPolygon(
          event,
          this.mapsApiService.isApiLoaded(),
        );
        this.areaPolygon.set(polygon);
      });
    }
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
    const slug = paramMap.get("slug") ?? paramMap.get("eventID") ?? "swissjam25";
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
    const slug = paramMap.get("slug") ?? paramMap.get("eventID") ?? "swissjam25";
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

  private _relativeFromNow(target: Date): string {
    const diffMs = target.getTime() - Date.now();
    if (diffMs <= 0) {
      return $localize`:@@events.now_or_past:now`;
    }

    const formatter = new Intl.RelativeTimeFormat(this._locale, {
      numeric: "always",
    });

    const hours = Math.round(diffMs / 3_600_000);
    if (hours < 48) {
      return hours >= 2
        ? formatter.format(hours, "hour")
        : formatter.format(1, "hour");
    }

    const days = Math.max(1, Math.round(diffMs / 86_400_000));
    if (days < 14) {
      return formatter.format(days, "day");
    }
    const weeks = Math.round(days / 7);
    if (weeks < 8) {
      return formatter.format(weeks, "week");
    }
    const months = Math.round(days / 30);
    return formatter.format(months, "month");
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

  private _eventMediaFromSchema(media: MediaSchema): AnyMedia {
    return media.type === MediaType.Video
      ? new ExternalVideo(
          media.src,
          media.uid,
          media.attribution,
          media.origin,
          media.isReported,
        )
      : new ExternalImage(
          media.src,
          media.uid,
          media.attribution,
          media.origin,
          media.isReported,
        );
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
