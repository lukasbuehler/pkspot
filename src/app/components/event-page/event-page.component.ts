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
  linkedSignal,
  resource,
  signal,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { ActivatedRoute, ParamMap, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatDialog } from "@angular/material/dialog";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatChipsModule } from "@angular/material/chips";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { Subscription, firstValueFrom, take } from "rxjs";
import {
  Event as PkEvent,
  EventFeaturedParticipant,
  EventProgramItem,
} from "../../../db/models/Event";
import {
  EventCategory,
  EventBoundsSchema,
  EventLinkSchema,
  EventQualificationPathSchema,
  EventQualificationRefSchema,
  EventSeriesMembershipSchema,
} from "../../../db/schemas/EventSchema";
import { EventTicketOption } from "../../../db/models/Event";
import {
  LocaleCode,
  LocaleMap,
  MediaType,
} from "../../../db/models/Interfaces";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { MarkerSchema } from "../map/markers/map-marker.model";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { MapsApiService } from "../../services/maps-api.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { StructuredDataService } from "../../services/structured-data.service";
import { AnalyticsService } from "../../services/analytics.service";
import { EventPageDataService } from "../../services/event-page/event-page-data.service";
import {
  SeriesDocument,
  SeriesService,
} from "../../services/firebase/firestore/series.service";
import { SearchService } from "../../services/search.service";
import { environment } from "../../../environments/environment.default";
import { GoogleMap2dComponent } from "../google-map-2d/google-map-2d.component";
import {
  EventEditFormComponent,
  EventEditPatch,
} from "../event-edit-form/event-edit-form.component";
import { EventAttendeeActionsComponent } from "../event-attendee-actions/event-attendee-actions.component";
import { EventHeroMediaComponent } from "../event-display/event-hero-media.component";
import { EventSummaryMetaComponent } from "../event-display/event-summary-meta.component";
import { EventCardComponent } from "../event-card/event-card.component";
import { EventProgramTimelineComponent } from "./event-program-timeline.component";
import {
  eventHeroMedia,
  eventImageDisplaySrc,
  eventScheduleLabel,
  eventStatusLabel,
  type EventStatus,
} from "../event-display/event-display.helpers";
import { isBot } from "../../../scripts/Helpers";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { EventLiveUpdatesComponent } from "../event-live-updates/event-live-updates.component";
import { EventLiveUpdateOrganizerMenuComponent } from "../event-live-update-organizer-menu/event-live-update-organizer-menu.component";
import type { EventRSVPOption } from "../../../db/schemas/EventRSVPSchema";
import { OrganizationButtonComponent } from "../organization-button/organization-button.component";
import { WeatherService } from "../../weather/weather.service";
import type { EventWeatherSelection } from "../../weather/event-weather";
import {
  EventWeatherForecastDialogComponent,
  type EventWeatherForecastDialogData,
} from "../event-weather-forecast-dialog/event-weather-forecast-dialog.component";
import { EventWeatherDaysComponent } from "../event-weather-days/event-weather-days.component";
import { EventDraftNoticeComponent } from "./event-draft-notice.component";
import { EventAccessManagerComponent } from "../event-access-manager/event-access-manager.component";
import { EventRegistrationManagerComponent } from "../event-registration-manager/event-registration-manager.component";
import {
  EventOwnershipClaimDialogComponent,
  EventOwnershipClaimDialogData,
} from "../event-ownership-claim-dialog/event-ownership-claim-dialog.component";
import { EventProgramDayChipsComponent } from "../event-program-day-chips/event-program-day-chips.component";
import { EventNowNextCardComponent } from "../event-now-next-card/event-now-next-card.component";
import {
  eventProgramDays,
  eventProgramLocationVisits,
  isEventProgramMarkerOccurrence,
  isEventProgramSpotOccurrence,
  resolveEventProgramOccurrences,
  type EventMarkerBinding,
  type EventProgramOccurrence,
  type EventSpotBinding,
} from "../../shared/event-program-spots";
import { eventProgramLocationColor } from "../../shared/event-program-timeline";
import {
  EventAddDialogComponent,
  type EventAddDialogData,
} from "../event-add-dialog/event-add-dialog.component";
import {
  EventQrDialogComponent,
  type EventQrDialogData,
} from "../event-qr-dialog/event-qr-dialog.component";

interface VisibleSeriesTag {
  seriesId: string;
  role?: EventSeriesMembershipSchema["role"];
}

type ProgramMapMarker = MarkerSchema & {
  programOccurrence?: EventProgramOccurrence;
};

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
    EventAttendeeActionsComponent,
    EventHeroMediaComponent,
    EventSummaryMetaComponent,
    EventCardComponent,
    EventProgramTimelineComponent,
    EventWeatherDaysComponent,
    EventLiveUpdatesComponent,
    EventLiveUpdateOrganizerMenuComponent,
    OrganizationButtonComponent,
    EventDraftNoticeComponent,
    EventAccessManagerComponent,
    EventRegistrationManagerComponent,
    EventProgramDayChipsComponent,
    EventNowNextCardComponent,
  ],
  templateUrl: "./event-page.component.html",
  styleUrl: "./event-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventInfoPageComponent implements OnInit, OnDestroy {
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _snackbar = inject(MatSnackBar);
  private readonly _dialog = inject(MatDialog);
  private _eventsService = inject(EventsService);
  private _authService = inject(AuthenticationService);
  private _analytics = inject(AnalyticsService);
  private _structuredData = inject(StructuredDataService);
  private _metaTags = inject(MetaTagService);
  private _eventPageData = inject(EventPageDataService);
  private _seriesService = inject(SeriesService);
  private _search = inject(SearchService);
  private _platformId = inject(PLATFORM_ID);
  private _locale = inject<LocaleCode>(LOCALE_ID);
  private readonly _dateTime = inject(DateTimeFormatService);
  private readonly _weatherService = inject(WeatherService);
  readonly mapsApiService = inject(MapsApiService);

  private _paramMapSubscription?: Subscription;
  private _queryParamsSubscription?: Subscription;
  private _eventSnapshotSubscription?: Subscription;
  private _eventLoadRequestVersion = 0;
  private _eventAuthorizationRequestVersion = 0;
  private _spotsLoadRequestVersion = 0;
  private _minuteInterval?: number;
  private _qualifierLoadRequestVersion = 0;
  private _programLinkedEventLoadRequestVersion = 0;
  private _seriesLoadRequestVersion = 0;
  private _lastAddDialogKey = "";
  private readonly _qualificationGridResizeListener = () =>
    this._syncQualificationGridColumns();

  readonly event = signal<PkEvent | null>(null);
  readonly isLoadingEvent = signal(true);
  readonly eventLoadFailed = signal(false);
  readonly spots = signal<(Spot | LocalSpot)[]>([]);
  readonly spotBindings = signal<EventSpotBinding[]>([]);
  readonly areaPolygon = signal<PolygonSchema | null>(null);
  readonly mapPreviewViewportBounds = signal<EventBoundsSchema | null>(null);
  readonly showHeader = signal(true);
  readonly isEmbedded = signal(false);
  readonly isBrowser = signal(isPlatformBrowser(this._platformId));
  readonly isCrawler = signal(this.isBrowser() && isBot());
  readonly isEditingEvent = signal(false);
  readonly isSavingEvent = signal(false);
  readonly isEventDescriptionExpanded = signal(false);
  readonly currentRsvp = signal<EventRSVPOption | null>(null);
  readonly now = signal(new Date());
  readonly focusedProgramItemId = signal<string | null>(null);
  readonly addIntentSource = signal<EventAddDialogData["source"] | null>(null);
  readonly qualifierEventsById = signal<Record<string, PkEvent>>({});
  readonly programLinkedEventsById = signal<Record<string, PkEvent>>({});
  readonly seriesById = signal<Record<string, SeriesDocument>>({});
  readonly expandedQualificationEventGroups = signal<Record<string, boolean>>(
    {},
  );
  readonly qualificationGridColumns = signal(3);
  readonly isLoadingQualifierEvents = signal(false);
  readonly isAdmin = computed(() => this._authService.isAdmin());
  readonly isSignedIn = computed(() => !!this._authService.user.uid);
  readonly canEditEvent = signal(false);
  readonly canManageEvent = signal(false);

  openOwnershipClaimDialog(): void {
    const event = this.event();
    if (!event) return;
    this._dialog.open<
      EventOwnershipClaimDialogComponent,
      EventOwnershipClaimDialogData,
      boolean
    >(EventOwnershipClaimDialogComponent, {
      data: { eventId: String(event.id), eventName: event.name },
      maxWidth: "95vw",
    });
  }

  readonly dateRange = computed(() => {
    const event = this.event();
    if (!event) return "";
    return eventScheduleLabel(event, this._dateTime, "long");
  });
  readonly description = computed(() => {
    const event = this.event();
    if (!event) return "";
    return (
      event.description ??
      (event.localityString
        ? $localize`Event in ` + event.localityString
        : $localize`:@@event.description_without_location:Event details`) +
        ` (${this.dateRange()})`
    );
  });
  readonly hasLongDescription = computed(() => {
    const description = this.description();
    if (!description) return false;
    return description.split(/\r?\n/).length > 6 || description.length > 520;
  });
  readonly hasHeroMedia = computed(() => {
    const event = this.event();
    return event ? eventHeroMedia(event).length > 0 : false;
  });

  readonly name = computed(() => this.event()?.name ?? "");
  readonly mapRoute = computed(() => {
    const event = this.event();
    return event ? ["/events", event.slug ?? event.id, "map"] : ["/events"];
  });
  readonly organizer = computed(() => this.event()?.organizer?.organization);
  readonly organizerName = computed(() => this.event()?.organizerName ?? "");
  readonly status = computed<EventStatus | null>(
    () => this.event()?.status(this.now()) ?? null,
  );
  readonly showRsvp = computed(
    () =>
      this.event()?.published === true &&
      this.event()?.attendance.social === "rsvp" &&
      this.status() === "upcoming",
  );
  readonly showRegistration = computed(
    () =>
      this.event()?.published === true &&
      this.event()?.attendance.admission === "registration" &&
      this.status() === "upcoming",
  );
  readonly statusLabel = computed(() => {
    const event = this.event();
    const status = this.status();
    if (!event || !status) return "";
    return eventStatusLabel(event, status, this._locale);
  });
  readonly startDateTime = computed(() => {
    const event = this.event();
    if (!event) return "";
    return eventScheduleLabel(event, this._dateTime, "long");
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
  readonly featuredParticipants = computed(
    () => this.event()?.featuredParticipants ?? [],
  );
  readonly activeProgramItems = computed<EventProgramItem[]>(() => {
    const event = this.event();
    if (!event?.program) return [];
    const activePlan =
      event.program.plans.find(
        (plan) => plan.id === event.program?.active_plan_id,
      ) ?? event.program.plans[0];
    return activePlan?.items ?? [];
  });
  readonly programLinkedEventIds = computed(() => [
    ...new Set(
      this.activeProgramItems()
        .map((item) => item.linked_event_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ]);
  readonly programDays = computed(() =>
    eventProgramDays(this.activeProgramItems(), this.event()?.timeZone),
  );
  readonly selectedProgramDay = linkedSignal<
    {
      eventId: string;
      days: string[];
      timeZone: string | undefined;
    },
    string | null
  >({
    source: () => ({
      eventId: String(this.event()?.id ?? ""),
      days: this.programDays(),
      timeZone: this.event()?.timeZone,
    }),
    computation: (source, previous) => {
      if (
        previous?.source.eventId === source.eventId &&
        (previous.value === null ||
          previous.value === "" ||
          source.days.includes(previous.value))
      ) {
        return previous.value;
      }
      return null;
    },
  });
  readonly programOccurrences = computed(() =>
    resolveEventProgramOccurrences(
      this.activeProgramItems(),
      [
        ...this.spotBindings(),
        ...this.mapMarkers().flatMap((marker): EventMarkerBinding[] =>
          marker.id
            ? [
                {
                  ref: { kind: "custom_marker", id: marker.id },
                  marker,
                },
              ]
            : [],
        ),
      ],
      this.event()?.timeZone,
      this.now(),
    ),
  );
  readonly programLocationVisits = computed(() =>
    this.selectedProgramDay() === null
      ? []
      : eventProgramLocationVisits(
          this.programOccurrences(),
          this.selectedProgramDay() ?? "",
          this.now(),
        ),
  );
  readonly programFilterActive = computed(
    () => this.selectedProgramDay() !== null,
  );
  readonly eventWeatherResource = resource({
    params: () => {
      const event = this.event();
      if (
        !this.isBrowser() ||
        !event ||
        !event.location ||
        !Number.isFinite(event.location.lat) ||
        !Number.isFinite(event.location.lng) ||
        !this._weatherService.isEventForecastAvailable(event.start, event.end)
      ) {
        return undefined;
      }
      return {
        location: event.location,
        start: event.start,
        end: event.end,
      };
    },
    loader: ({ params }) =>
      this._weatherService.getEventForecastForTileAt(
        params.location,
        params.start,
        params.end,
      ),
  });
  readonly eventWeather = computed(() =>
    this.eventWeatherResource.hasValue()
      ? this.eventWeatherResource.value()
      : undefined,
  );
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
  readonly visibleSeriesTags = computed<VisibleSeriesTag[]>(() => {
    const tags: VisibleSeriesTag[] = this.visibleSeriesMemberships().map(
      (membership) => ({
        seriesId: membership.series_id,
        role: membership.role,
      }),
    );
    const keyedTags = new Set(
      tags.map((tag) => this._seriesTagKey(tag.seriesId, tag.role)),
    );
    const seriesIdsWithSpecificTags = new Set(tags.map((tag) => tag.seriesId));

    for (const seriesId of this.event()?.seriesIds ?? []) {
      if (seriesIdsWithSpecificTags.has(seriesId)) continue;
      const key = this._seriesTagKey(seriesId);
      if (!keyedTags.has(key)) {
        tags.push({ seriesId });
        keyedTags.add(key);
      }
    }

    return tags;
  });
  readonly visibleSeriesIds = computed(() => [
    ...new Set([
      ...this.visibleSeriesTags().map((tag) => tag.seriesId),
      ...Object.values(this.qualifierEventsById()).flatMap(
        (event) => event.seriesIds,
      ),
      ...Object.values(this.programLinkedEventsById()).flatMap(
        (event) => event.seriesIds,
      ),
    ]),
  ]);
  readonly qualificationMemberships = computed(() =>
    this.visibleSeriesMemberships().filter(
      (membership) =>
        membership.qualification_required ||
        (membership.qualification_paths?.length ?? 0) > 0 ||
        (membership.required_qualifiers?.length ?? 0) > 0 ||
        (membership.qualifies_to?.length ?? 0) > 0,
    ),
  );
  readonly qualificationEventRefs = computed(() =>
    this.qualificationMemberships()
      .flatMap((membership) => [
        ...this.qualificationPathsFor(membership).flatMap(
          (path) => path.requirements,
        ),
        ...(membership.qualifies_to ?? []),
      ])
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
    return this._eventPageData.customMarkers(event);
  });
  readonly programMapMarkers = computed<ProgramMapMarker[]>(() =>
    this.programLocationVisits().map((visit) => {
      const occurrence = visit.representative;
      const time = this._dateTime.format(occurrence.start, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: this.event()?.timeZone,
      });
      const additionalVisits = visit.occurrences.length - 1;
      const place =
        visit.kind === "spot"
          ? {
              name: visit.spot.name(),
              location: visit.spot.location(),
              icons: undefined,
            }
          : {
              name: visit.marker.name ?? visit.ref.id,
              location: visit.marker.location,
              icons: visit.marker.icons,
            };
      return {
        id: `program:${visit.key}`,
        name: `${place.name}: ${occurrence.item.title}, ${time}`,
        description: occurrence.item.title,
        location: place.location,
        icons: place.icons,
        number: time,
        badge: additionalVisits > 0 ? `+${additionalVisits}` : undefined,
        color: eventProgramLocationColor(visit),
        priority: "required",
        ignoreCollisions: true,
        type: "event-program",
        programOccurrence: occurrence,
      };
    }),
  );
  readonly mapPriorityMarkers = computed<ProgramMapMarker[]>(() =>
    this.programFilterActive()
      ? [
          ...this.mapMarkers().map((marker) => ({
            ...marker,
            color: "gray" as const,
          })),
          ...this.programMapMarkers(),
        ]
      : this.mapMarkers(),
  );
  readonly mapPreviewSpotMarkers = computed<SpotPreviewData[]>(() =>
    this._eventPageData.spotPreviewMarkers(this.spots()),
  );
  readonly eventLocationMarker = computed<MarkerSchema | null>(() =>
    this._eventPageData.eventLocationMarker(this.event()),
  );
  readonly mapPreviewBounds = computed(() => {
    const event = this.event();
    return event
      ? this._eventPageData.eventMapBounds(event, [
          ...this.mapMarkers().map((marker) => marker.location),
          ...this.spots().map((spot) => spot.location()),
        ])
      : null;
  });
  readonly hasMapPreview = computed(
    () =>
      this.isBrowser() &&
      !this.isCrawler() &&
      !!this.mapPreviewBounds() &&
      (this.mapMarkers().length > 0 || this.mapPreviewSpotMarkers().length > 0),
  );

  constructor() {
    this._queryParamsSubscription = this._route.queryParams.subscribe(
      (params) => {
        if (params["showHeader"] !== undefined) {
          this.showHeader.set(params["showHeader"] === "true");
        }
        this.addIntentSource.set(
          params["intent"] === "add"
            ? params["utm_source"] === "event_qr"
              ? "event_qr"
              : "event_page"
            : null,
        );
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
      this.seriesById();
      this._syncEventSeoData(event);
    });

    effect(() => {
      const event = this.event();
      const source = this.addIntentSource();
      if (!event || !source || this.isEmbedded()) return;
      const dialogKey = `${event.id}:${source}`;
      if (dialogKey === this._lastAddDialogKey) return;
      this._lastAddDialogKey = dialogKey;
      this.openAddDialog(source);
      void this._router.navigate([], {
        relativeTo: this._route,
        queryParams: { intent: null },
        queryParamsHandling: "merge",
        replaceUrl: true,
      });
    });

    effect(() => {
      const seriesIds = this.visibleSeriesIds();
      const requestVersion = ++this._seriesLoadRequestVersion;

      if (seriesIds.length === 0) {
        this.seriesById.set({});
        return;
      }

      this._seriesService
        .getSeriesByIds(seriesIds)
        .then((seriesById) => {
          if (requestVersion === this._seriesLoadRequestVersion) {
            this.seriesById.set(seriesById);
          }
        })
        .catch((error) => {
          console.warn("Failed to load event series documents.", error);
          if (requestVersion === this._seriesLoadRequestVersion) {
            this.seriesById.set({});
          }
        });
    });

    if (isPlatformBrowser(this._platformId)) {
      const minuteInterval = window.setInterval(
        () => this.now.set(new Date()),
        60_000,
      );
      this._minuteInterval = minuteInterval;
      this._syncQualificationGridColumns();
      window.addEventListener("resize", this._qualificationGridResizeListener, {
        passive: true,
      });

      effect(() => {
        const event = this.event();
        if (!event || this.isCrawler()) {
          this.spotBindings.set([]);
          this.spots.set([]);
          return;
        }
        const requestVersion = ++this._spotsLoadRequestVersion;
        this._eventPageData.loadEventSpotBindings(event).then((bindings) => {
          if (requestVersion === this._spotsLoadRequestVersion) {
            this.spotBindings.set(bindings);
            this.spots.set(bindings.map((binding) => binding.spot));
          }
        });
      });

      effect(() => {
        const eventIds = this.programLinkedEventIds();
        const requestVersion = ++this._programLinkedEventLoadRequestVersion;

        if (eventIds.length === 0 || this.isCrawler()) {
          this.programLinkedEventsById.set({});
          return;
        }

        this._search.getEventCardsByIds(eventIds).then((events) => {
          if (
            requestVersion !== this._programLinkedEventLoadRequestVersion
          ) {
            return;
          }
          this.programLinkedEventsById.set(
            Object.fromEntries(events.map((event) => [event.id, event])),
          );
        });
      });

      effect(() => {
        const refs = this.qualificationEventRefs();
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
          const foundIds = new Set(events.map((event) => String(event.id)));
          const missingIds = eventIds.filter((id) => !foundIds.has(String(id)));
          if (missingIds.length > 0) {
            console.warn(
              "Event qualification refs were hidden because no published Typesense event card was found.",
              missingIds,
            );
          }
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

  openEventWeather(selection: EventWeatherSelection): void {
    const event = this.event();
    const response = this.eventWeather();
    if (!event || !response) return;

    this._dialog.open<
      EventWeatherForecastDialogComponent,
      EventWeatherForecastDialogData
    >(EventWeatherForecastDialogComponent, {
      data: {
        eventName: event.name,
        eventStart: event.start,
        eventEnd: event.end,
        timeZone: event.timeZone,
        response,
        selection,
      },
      width: "760px",
      maxWidth: "calc(100vw - 24px)",
      maxHeight: "calc(100dvh - 24px)",
      autoFocus: "dialog",
      restoreFocus: true,
    });
  }

  updateMapPreviewViewportBounds(bounds: google.maps.LatLngBounds): void {
    this.mapPreviewViewportBounds.set(bounds.toJSON());
  }

  openMapForSpot(spot: Spot | LocalSpot | SpotPreviewData | SpotId): void {
    const spotId = this._eventMapSpotQueryParam(spot);
    if (!spotId) return;

    void this._router.navigate(this.mapRoute(), {
      queryParams: { spotId },
    });
  }

  selectProgramDay(day: string | null): void {
    this.selectedProgramDay.set(day);
  }

  focusProgramItem(itemId: string): void {
    this.focusedProgramItemId.set(itemId);
    if (!this.isBrowser()) return;

    window.requestAnimationFrame(() => {
      document
        .getElementById(`event-program-item-${itemId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  programMarkerClicked(
    event: number | { index?: number },
  ): void {
    const index = typeof event === "number" ? event : event.index;
    if (index === undefined) return;
    const occurrence = this.mapPriorityMarkers()[index]?.programOccurrence;
    if (!occurrence) return;
    void this._router.navigate(this.mapRoute(), {
      queryParams: {
        mapFilter: "program",
        day: occurrence.day,
        spotId: isEventProgramSpotOccurrence(occurrence)
          ? occurrence.ref.id
          : undefined,
        markerId: isEventProgramMarkerOccurrence(occurrence)
          ? occurrence.ref.id
          : undefined,
        programItemId: occurrence.item.id,
      },
    });
  }

  private _eventMapSpotQueryParam(
    spot: Spot | LocalSpot | SpotPreviewData | SpotId,
  ): string | null {
    if (typeof spot === "string") {
      return spot;
    }

    if (spot instanceof Spot) {
      return spot.slug ?? spot.id;
    }

    if (spot instanceof LocalSpot) {
      const boundId = this.spotBindings().find(
        (binding) => binding.spot === spot,
      )?.ref.id;
      if (boundId) return boundId;
      const index = this.spots().findIndex((candidate) => candidate === spot);
      return index >= 0
        ? (this.event()?.inlineSpots[index]?.id ?? `event-local-spot-${index}`)
        : null;
    }

    const id = String(spot.id);
    const localIndexMatch = /^event-local-spot-(\d+)$/u.exec(id);
    if (localIndexMatch) {
      return this.event()?.inlineSpots[Number(localIndexMatch[1])]?.id ?? id;
    }

    return id;
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
    if (this.isBrowser()) {
      if (this._minuteInterval !== undefined) {
        window.clearInterval(this._minuteInterval);
      }
      window.removeEventListener(
        "resize",
        this._qualificationGridResizeListener,
      );
    }
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
    this._analytics.trackEvent("share_event_clicked", {
      surface: "event_info_page",
      event_id: event.id,
      event_slug: event.slug ?? null,
      event_name: event.name,
      event_status: event.status(),
    });

    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      try {
        await Share.share({ ...shareData, dialogTitle: "Share Event" });
        this._analytics.trackEvent("share_event_succeeded", {
          surface: "event_info_page",
          event_id: event.id,
          method: "native_share",
        });
      } catch (err) {
        console.error("Couldn't share this event", err);
        this._analytics.trackEvent("share_event_failed", {
          surface: "event_info_page",
          event_id: event.id,
          method: "native_share",
        });
      }
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        this._analytics.trackEvent("share_event_succeeded", {
          surface: "event_info_page",
          event_id: event.id,
          method: "web_share",
        });
      } catch (err) {
        console.error("Couldn't share this event", err);
        this._analytics.trackEvent("share_event_failed", {
          surface: "event_info_page",
          event_id: event.id,
          method: "web_share",
        });
      }
      return;
    }

    await navigator.clipboard.writeText(`${event.name} - PK Spot \n${link}`);
    this._analytics.trackEvent("share_event_succeeded", {
      surface: "event_info_page",
      event_id: event.id,
      method: "clipboard",
    });
    this._snackbar.open(
      $localize`:@@event_info.link_copied:Event link copied to clipboard.`,
      $localize`:@@common.dismiss:Dismiss`,
      { duration: 3000, horizontalPosition: "center", verticalPosition: "top" },
    );
  }

  openAddDialog(
    source: EventAddDialogData["source"] = "event_page",
  ): void {
    const event = this.event();
    if (!event || !event.published || event.isPast(this.now())) return;
    const returnUrl =
      this._router.url || this._eventPageData.eventCanonicalPath(event);
    this._dialog.open<
      EventAddDialogComponent,
      EventAddDialogData
    >(EventAddDialogComponent, {
      data: { event, returnUrl, source },
      width: "560px",
      maxWidth: "calc(100vw - 2rem)",
      autoFocus: "first-tabbable",
    });
  }

  openQrDialog(): void {
    const event = this.event();
    if (!event || !this.canEditEvent()) return;
    const url = new URL(
      this._eventPageData.eventCanonicalPath(event),
      environment.baseUrl,
    );
    url.searchParams.set("intent", "add");
    url.searchParams.set("utm_source", "event_qr");
    url.searchParams.set("utm_medium", "qr");
    url.searchParams.set("utm_campaign", "event_attendance");
    this._dialog.open<EventQrDialogComponent, EventQrDialogData>(
      EventQrDialogComponent,
      {
        data: { event, url: url.toString() },
        width: "620px",
        maxWidth: "calc(100vw - 2rem)",
        maxHeight: "92vh",
        autoFocus: "first-tabbable",
      },
    );
  }

  startEditingEvent(): void {
    if (this.canEditEvent()) {
      this.isEditingEvent.set(true);
    }
  }

  cancelEditingEvent(): void {
    this.isEditingEvent.set(false);
  }

  toggleEventDescription(): void {
    this.isEventDescriptionExpanded.update((expanded) => !expanded);
  }

  async onSaveEvent(patch: EventEditPatch): Promise<void> {
    const current = this.event();
    if (!current || !this.canEditEvent()) return;
    this.isSavingEvent.set(true);
    try {
      await this._eventsService.updateEvent(current.id, patch);
      const reloaded = await this._eventsService.getEventById(current.id);
      if (reloaded) {
        this._setEvent(reloaded);
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
    if (!current || !this.canManageEvent()) return;
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
    this.isLoadingEvent.set(true);
    this.eventLoadFailed.set(false);
    this._eventSnapshotSubscription?.unsubscribe();
    this._eventSnapshotSubscription = this._eventPageData
      .observeEventBySlugOrId(slug)
      .subscribe({
        next: (loaded) => {
          if (requestVersion !== this._eventLoadRequestVersion) return;
          if (!loaded) {
            if (this.isBrowser()) {
              void this._router.navigate(["/events"]);
            }
            return;
          }
          this._setEvent(loaded);
        },
        error: (err) => {
          if (requestVersion !== this._eventLoadRequestVersion) return;
          console.warn("EventInfoPageComponent: failed to observe event", err);
          this.isLoadingEvent.set(false);
          this.eventLoadFailed.set(true);
        },
      });
  }

  private async _loadEventFromRoute(paramMap: ParamMap): Promise<void> {
    const slug =
      paramMap.get("slug") ?? paramMap.get("eventID") ?? "swissjam25";
    const requestVersion = ++this._eventLoadRequestVersion;
    this.isLoadingEvent.set(true);
    this.eventLoadFailed.set(false);
    const loaded = await this._eventPageData.loadEventBySlugOrId(slug);

    if (requestVersion !== this._eventLoadRequestVersion) return;
    if (!loaded) {
      if (this.isBrowser()) {
        void this._router.navigate(["/events"]);
      }
      return;
    }
    this._setEvent(loaded);
  }

  private _setEvent(event: PkEvent): void {
    if (this.event()?.id !== event.id) {
      this.isEventDescriptionExpanded.set(false);
      this.currentRsvp.set(null);
    }
    this.event.set(event);
    void this._refreshEventAuthorization(event);
    this.isLoadingEvent.set(false);
    this.eventLoadFailed.set(false);
  }

  private async _refreshEventAuthorization(event: PkEvent): Promise<void> {
    const requestVersion = ++this._eventAuthorizationRequestVersion;
    const fallback = this.isAdmin();
    const [canEdit, canManage] = await Promise.all([
      this._eventsService.canEditEvent?.(event).catch(() => false) ??
        Promise.resolve(fallback),
      this._eventsService.canManageEvent?.(event).catch(() => false) ??
        Promise.resolve(fallback),
    ]);
    if (
      requestVersion !== this._eventAuthorizationRequestVersion ||
      this.event()?.id !== event.id
    ) {
      return;
    }
    this.canEditEvent.set(canEdit);
    this.canManageEvent.set(canManage);
  }

  private _syncEventSeoData(event: PkEvent): void {
    const canonicalPath = this._eventPageData.eventCanonicalPath(event);
    if (!event.published) {
      this._structuredData.removeStructuredData("event");
      this._metaTags.setStaticPageMetaTags(
        $localize`:@@event_draft.meta.title:Draft event`,
        $localize`:@@event_draft.meta.description:This event has not been published.`,
        undefined,
        canonicalPath,
      );
      this._metaTags.setRobotsContent("noindex,nofollow");
      return;
    }
    if (event.visibility !== "public") {
      this._structuredData.removeStructuredData("event");
      this._metaTags.setStaticPageMetaTags(
        $localize`:@@event_unlisted.meta.title:Unlisted event`,
        $localize`:@@event_unlisted.meta.description:This event is available through its shared link.`,
        undefined,
        canonicalPath,
      );
      this._metaTags.setRobotsContent("noindex,nofollow");
      return;
    }
    const description = this.description();
    const image = this._eventSocialImage(event);

    this._metaTags.setEventMetaTags(
      { name: event.name, image, description },
      canonicalPath,
    );

    this._structuredData.addStructuredData(
      "event",
      this._buildEventStructuredData(event, canonicalPath, description),
    );
  }

  private _buildEventStructuredData(
    event: PkEvent,
    canonicalPath: string,
    description: string,
  ): Record<string, unknown> {
    const eventUrl = `${environment.baseUrl}/${this._locale}${canonicalPath}`;
    const offerFallbackUrl =
      this._safeExternalUrl(event.url ?? event.externalSource?.url) ?? eventUrl;

    const structuredLocation = event.location
      ? {
          "@type": "Place",
          name: event.venueString || event.localityString || event.name,
          address: {
            "@type": "PostalAddress",
            addressLocality: event.localityString || undefined,
          },
          geo: {
            "@type": "GeoCoordinates",
            latitude: event.location.lat,
            longitude: event.location.lng,
          },
        }
      : undefined;
    return {
      "@type": "Event",
      name: event.name,
      startDate: event.timing?.start_date ?? event.start.toISOString(),
      endDate:
        event.timing?.mode === "open_end"
          ? undefined
          : (event.timing?.end_date ??
            event.timing?.start_date ??
            event.end.toISOString()),
      eventAttendanceMode: event.location
        ? "https://schema.org/OfflineEventAttendanceMode"
        : "https://schema.org/MixedEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      location: structuredLocation,
      image: [
        ...this._eventStructuredImages(event).map((src) =>
          this._absoluteUrl(src),
        ),
      ],
      description,
      url: eventUrl,
      sameAs: event.url ?? event.externalSource?.url,
      organizer: this._buildOrganizerStructuredData(event),
      performer: this._buildEventPerformers(event),
      offers: this._buildEventOffers(event, offerFallbackUrl),
      superEvent: this._buildEventSeriesStructuredData(event),
      // Program entries remain crawlable page content. They are not standalone
      // Google events because they do not have their own canonical leaf pages.
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

  featuredParticipantRoleLabel(
    role: EventFeaturedParticipant["role"],
  ): string {
    switch (role) {
      case "athlete":
        return $localize`:@@event_featured_participant.role.athlete:Athlete`;
      case "judge":
        return $localize`:@@event_featured_participant.role.judge:Judge`;
      case "coach":
        return $localize`:@@event_featured_participant.role.coach:Coach`;
      case "instructor":
        return $localize`:@@event_featured_participant.role.instructor:Instructor`;
      case "speaker":
        return $localize`:@@event_featured_participant.role.speaker:Speaker`;
      case "artist":
        return $localize`:@@event_featured_participant.role.artist:Artist`;
      case "dj":
        return $localize`:@@event_featured_participant.role.dj:DJ`;
      case "performer":
        return $localize`:@@event_featured_participant.role.performer:Performer`;
      case "host":
        return $localize`:@@event_featured_participant.role.host:Host`;
      case "guest":
        return $localize`:@@event_featured_participant.role.guest:Guest`;
    }
  }

  featuredParticipantUrl(
    participant: EventFeaturedParticipant,
  ): string | undefined {
    return this._safeExternalUrl(participant.url) ?? undefined;
  }

  featuredParticipantImageSrc(
    participant: EventFeaturedParticipant,
  ): string | undefined {
    return participant.image_src
      ? this._absoluteUrl(participant.image_src)
      : undefined;
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

  categoryIcon(category: EventCategory): string {
    switch (category) {
      case "camp":
        return "camping";
      case "competition":
        return "trophy";
      case "jam":
        return "groups";
      case "workshop":
        return "school";
      case "show":
        return "theater_comedy";
      case "awards":
        return "workspace_premium";
      case "social":
        return "celebration";
      case "travel":
        return "directions_bus";
      default:
        return "sell";
    }
  }

  seriesLabel(seriesId: string): string {
    return (
      this.seriesById()[seriesId]?.name ?? this._seriesFallbackLabel(seriesId)
    );
  }

  seriesVisual(seriesId: string): { logoSrc?: string; background: string } {
    const series = this.seriesById()[seriesId];
    return {
      logoSrc: eventImageDisplaySrc(series?.logo_src),
      background:
        series?.logo_background_color ??
        "var(--mat-sys-surface-container-high)",
    };
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

  seriesTagTrackKey(tag: VisibleSeriesTag): string {
    return this._seriesTagKey(tag.seriesId, tag.role);
  }

  qualifierEventsFor(membership: EventSeriesMembershipSchema): PkEvent[] {
    return this._eventsForQualificationRefs(membership.required_qualifiers);
  }

  qualificationTargetEventsFor(
    membership: EventSeriesMembershipSchema,
  ): PkEvent[] {
    return this._eventsForQualificationRefs(membership.qualifies_to);
  }

  qualificationPathsFor(
    membership: EventSeriesMembershipSchema,
  ): EventQualificationPathSchema[] {
    if ((membership.qualification_paths?.length ?? 0) > 0) {
      return membership.qualification_paths ?? [];
    }

    if ((membership.required_qualifiers?.length ?? 0) === 0) {
      return [];
    }

    return [
      {
        id: "legacy-required-qualifiers",
        requirement_mode: "any",
        requirements: membership.required_qualifiers ?? [],
      },
    ];
  }

  qualificationPathLabel(path: EventQualificationPathSchema): string {
    return (
      this._localizedText(path.label_i18n) ??
      path.label ??
      $localize`:@@event_qualification.path_default:Qualification pathway`
    );
  }

  qualificationPathRequirementLabel(
    path: EventQualificationPathSchema,
  ): string {
    switch (path.requirement_mode) {
      case "all":
        return $localize`:@@event_qualification.path_all:Qualification requires all of these events`;
      default:
        return $localize`:@@event_qualification.path_any:Qualify through one of these events`;
    }
  }

  qualificationPathEvents(path: EventQualificationPathSchema): PkEvent[] {
    return this._eventsForQualificationRefs(path.requirements);
  }

  visibleQualificationPathEvents(
    membership: EventSeriesMembershipSchema,
    path: EventQualificationPathSchema,
  ): PkEvent[] {
    const events = this.qualificationPathEvents(path);
    if (this.isQualificationPathExpanded(membership, path)) {
      return events;
    }
    return events.slice(0, this.qualificationGridColumns());
  }

  hasHiddenQualificationPathEvents(
    path: EventQualificationPathSchema,
  ): boolean {
    return (
      this.qualificationPathEvents(path).length >
      this.qualificationGridColumns()
    );
  }

  isQualificationPathExpanded(
    membership: EventSeriesMembershipSchema,
    path: EventQualificationPathSchema,
  ): boolean {
    return (
      this.expandedQualificationEventGroups()[
        this._qualificationPathGroupKey(membership, path)
      ] === true
    );
  }

  toggleQualificationPath(
    membership: EventSeriesMembershipSchema,
    path: EventQualificationPathSchema,
  ): void {
    const key = this._qualificationPathGroupKey(membership, path);
    this.expandedQualificationEventGroups.update((groups) => ({
      ...groups,
      [key]: !groups[key],
    }));
  }

  visibleQualificationEventsFor(
    membership: EventSeriesMembershipSchema,
    kind: "qualifies_to" | "required_qualifiers",
  ): PkEvent[] {
    const events =
      kind === "qualifies_to"
        ? this.qualificationTargetEventsFor(membership)
        : this.qualifierEventsFor(membership);
    if (this.isQualificationEventGroupExpanded(membership, kind)) {
      return events;
    }
    return events.slice(0, this.qualificationGridColumns());
  }

  hasHiddenQualificationEvents(
    membership: EventSeriesMembershipSchema,
    kind: "qualifies_to" | "required_qualifiers",
  ): boolean {
    const events =
      kind === "qualifies_to"
        ? this.qualificationTargetEventsFor(membership)
        : this.qualifierEventsFor(membership);
    return events.length > this.qualificationGridColumns();
  }

  isQualificationEventGroupExpanded(
    membership: EventSeriesMembershipSchema,
    kind: "qualifies_to" | "required_qualifiers",
  ): boolean {
    return (
      this.expandedQualificationEventGroups()[
        this._qualificationEventGroupKey(membership, kind)
      ] === true
    );
  }

  toggleQualificationEventGroup(
    membership: EventSeriesMembershipSchema,
    kind: "qualifies_to" | "required_qualifiers",
  ): void {
    const key = this._qualificationEventGroupKey(membership, kind);
    this.expandedQualificationEventGroups.update((groups) => ({
      ...groups,
      [key]: !groups[key],
    }));
  }

  private _eventsForQualificationRefs(
    refs: EventQualificationRefSchema[] | undefined,
  ): PkEvent[] {
    const eventsById = this.qualifierEventsById();
    return (refs ?? [])
      .map((ref) => eventsById[ref.event_id])
      .filter((event): event is PkEvent => !!event)
      .filter(
        (event, index, events) =>
          events.findIndex((candidate) => candidate.id === event.id) === index,
      );
  }

  private _seriesFallbackLabel(seriesId: string): string {
    return seriesId
      .split("-")
      .filter(Boolean)
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join(" ");
  }

  private _seriesTagKey(
    seriesId: string,
    role?: EventSeriesMembershipSchema["role"],
  ): string {
    return `${seriesId}:${role ?? "series"}`;
  }

  private _qualificationEventGroupKey(
    membership: EventSeriesMembershipSchema,
    kind: "qualifies_to" | "required_qualifiers",
  ): string {
    return `${membership.series_id}:${membership.role}:${kind}`;
  }

  private _qualificationPathGroupKey(
    membership: EventSeriesMembershipSchema,
    path: EventQualificationPathSchema,
  ): string {
    return `${membership.series_id}:${membership.role}:path:${path.id}`;
  }

  private _localizedText(
    map: LocaleMap | Record<string, string> | undefined,
  ): string | undefined {
    if (!map) return undefined;
    const localeEntry = map[this._locale] ?? map["en"] ?? Object.values(map)[0];
    if (!localeEntry) return undefined;
    return typeof localeEntry === "string" ? localeEntry : localeEntry.text;
  }

  private _syncQualificationGridColumns(): void {
    if (!isPlatformBrowser(this._platformId)) return;
    const isMobile =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(max-width: 720px)").matches
        : window.innerWidth <= 720;
    this.qualificationGridColumns.set(isMobile ? 1 : 3);
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

  private _buildEventOffers(event: PkEvent, eventUrl: string): unknown {
    const offers = event.ticketOptions
      .map((ticket) => this._buildTicketOffer(ticket, eventUrl))
      .filter((offer): offer is Record<string, unknown> => offer !== null);

    if (offers.length > 0) {
      return offers.length === 1 ? offers[0] : offers;
    }

    return undefined;
  }

  private _buildTicketOffer(
    ticket: EventTicketOption,
    eventUrl: string,
  ): Record<string, unknown> | null {
    const url = this._safeExternalUrl(ticket.url) ?? eventUrl;
    const price = ticket.price;
    if (!price) return null;

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

  private _buildOrganizerStructuredData(event: PkEvent): unknown {
    if (event.organizer) {
      return {
        "@type": "Organization",
        name: event.organizer.organization.name,
        url: event.organizer.organization.slug
          ? `${environment.baseUrl}/${this._locale}/organizations/${event.organizer.organization.slug}`
          : undefined,
      };
    }

    if (event.organizerName) {
      return {
        "@type": "Organization",
        name: event.organizerName,
      };
    }

    const seriesOrganizer = event.seriesIds
      .map((seriesId) => this.seriesById()[seriesId])
      .find((item) => !!item?.organizer);

    if (!seriesOrganizer?.organizer) {
      return undefined;
    }

    return {
      "@type": "Organization",
      name: seriesOrganizer.organizer,
      url: seriesOrganizer.organizer_url,
    };
  }

  private _buildEventPerformers(event: PkEvent): unknown {
    const performers = event.featuredParticipants
      .map((participant) => {
        const url = this._safeExternalUrl(participant.url);
        const image = participant.image_src
          ? this._absoluteUrl(participant.image_src)
          : undefined;
        return {
          "@type":
            participant.type === "group" ? "PerformingGroup" : "Person",
          name: participant.name,
          description: participant.description,
          url,
          image,
        };
      });

    if (performers.length === 0) return undefined;
    return performers;
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

  private _buildEventSeriesStructuredData(event: PkEvent): unknown {
    const seriesById = this.seriesById();
    const series = event.seriesIds
      .map((seriesId) => seriesById[seriesId])
      .filter((item): item is SeriesDocument => !!item);

    if (series.length === 0) return undefined;

    const items = series.map((item) => ({
      "@type": "EventSeries",
      name: item.name,
      url: item.slug
        ? `${environment.baseUrl}/${this._locale}/series/${item.slug}`
        : item.url,
      organizer: item.organizer
        ? {
            "@type": "Organization",
            name: item.organizer,
            url: item.organizer_url,
          }
        : undefined,
    }));

    return items.length === 1 ? items[0] : items;
  }

  private _eventSocialImage(event: PkEvent): string {
    return (
      event.bannerSrc ??
      event.media.find((item) => item.type === MediaType.Image)?.src ??
      event.inlineSpots.flatMap((spot) => spot.images ?? [])[0] ??
      "assets/banner_1200x630.png"
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
