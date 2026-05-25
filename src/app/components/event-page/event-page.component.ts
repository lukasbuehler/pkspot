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
import { isPlatformBrowser, NgOptimizedImage } from "@angular/common";
import { ActivatedRoute, ParamMap, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Subscription, firstValueFrom, take } from "rxjs";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventSchema } from "../../../db/schemas/EventSchema";
import { LocaleCode } from "../../../db/models/Interfaces";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { MarkerSchema } from "../marker/marker.component";
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

@Component({
  selector: "app-event-info-page",
  imports: [
    NgOptimizedImage,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    GoogleMap2dComponent,
    EventEditFormComponent,
    MediaPlaceholderComponent,
    EventRsvpComponent,
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
  private _eventLoadRequestVersion = 0;
  private _spotsLoadRequestVersion = 0;

  readonly event = signal<PkEvent | null>(null);
  readonly spots = signal<(Spot | LocalSpot)[]>([]);
  readonly areaPolygon = signal<PolygonSchema | null>(null);
  readonly showHeader = signal(true);
  readonly isEmbedded = signal(false);
  readonly isBrowser = signal(isPlatformBrowser(this._platformId));
  readonly isEditingEvent = signal(false);
  readonly isSavingEvent = signal(false);
  readonly isAdmin = computed(() => this._authService.isAdmin());

  readonly name = computed(() => this.event()?.name ?? "");
  readonly mapRoute = computed(() => {
    const event = this.event();
    return event ? ["/events", event.slug ?? event.id, "map"] : ["/events"];
  });
  readonly organizer = computed(() => this.event()?.organizer?.organization);
  readonly organizerName = computed(() => this.organizer()?.name ?? "");
  readonly metaLine = computed(() => {
    const event = this.event();
    if (!event) return "";
    const relative = this._relativeUntil(event.start);
    const organizer = this.organizerName();
    if (organizer) {
      return $localize`:@@event_info.meta_with_organizer:${relative} · by ${organizer}`;
    }
    return relative;
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
  readonly mapMarkers = computed<MarkerSchema[]>(() => {
    const event = this.event();
    if (!event) return [];
    const eventMarker = this._eventPageData.eventLocationMarker(event);
    return [
      ...(eventMarker ? [eventMarker] : []),
      ...this._eventPageData.spotMapMarkers(this.spots()),
      ...this._eventPageData.customMarkers(event),
    ];
  });
  readonly mapPreviewBounds = computed(() => {
    const event = this.event();
    return event ? this._eventPageData.eventMapBounds(event) : null;
  });
  readonly hasMapPreview = computed(
    () =>
      this.isBrowser() &&
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
      void this._loadEventFromRoute(paramMap);
    });

    if (
      isPlatformBrowser(this._platformId) &&
      !this.mapsApiService.isApiLoaded()
    ) {
      this.mapsApiService.loadGoogleMapsApi();
    }
  }

  ngOnDestroy(): void {
    this._structuredData.removeStructuredData("event");
    this._paramMapSubscription?.unsubscribe();
    this._queryParamsSubscription?.unsubscribe();
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
    const description = this._eventDescription(event);
    const image = event.bannerSrc ?? "/assets/banner_1200x630.png";

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
        this._absoluteUrl(event.bannerSrc ?? "/assets/banner_1200x630.png"),
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
      offers: event.url ? { "@type": "Offer", url: event.url } : undefined,
    };
  }

  private _eventDescription(event: PkEvent): string {
    const startDateText = event.start.toLocaleDateString(this._locale, {
      dateStyle: "medium",
    });
    const endDateText = event.end.toLocaleDateString(this._locale, {
      dateStyle: "medium",
    });

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
  }

  private _relativeUntil(target: Date): string {
    const diffMs = target.getTime() - Date.now();
    if (diffMs <= 0) {
      return $localize`:@@event_info.now_or_past:Now`;
    }

    const days = Math.max(1, Math.round(diffMs / 86_400_000));
    if (days < 14) {
      return $localize`:@@event_info.in_n_days:In ${days} days`;
    }
    const weeks = Math.round(days / 7);
    if (weeks < 8) {
      return $localize`:@@event_info.in_n_weeks:In ${weeks} weeks`;
    }
    const months = Math.round(days / 30);
    return $localize`:@@event_info.in_n_months:In ${months} months`;
  }

  private _absoluteUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    return `${environment.baseUrl}/${path.replace(/^\/+/, "")}`;
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
