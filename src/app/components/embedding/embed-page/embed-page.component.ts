import {
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
  afterNextRender,
  ChangeDetectionStrategy,
  effect,
  LOCALE_ID,
} from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatSlideToggleChange } from "@angular/material/slide-toggle";
import { CodeBlockComponent } from "../../code-block/code-block.component";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { APP_BASE_HREF, isPlatformBrowser } from "@angular/common";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatInputModule } from "@angular/material/input";
import { LocaleCode } from "../../../../db/models/Interfaces";
import { MatSelectModule } from "@angular/material/select";
import { languageCodes } from "../../../../scripts/Languages";
import { Event as PkEvent } from "../../../../db/models/Event";
import { EventsService } from "../../../services/firebase/firestore/events.service";
import {
  ChipSelectorComponent,
  ChipSelectorOption,
} from "../../chip-selector/chip-selector.component";
import { buildUnembeddedUrlFromHref } from "../../../shared/embedded-url";
import { AnalyticsService } from "../../../services/analytics.service";
import { ActivatedRoute, ParamMap, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  buildEmbedPageQueryParams,
  defaultEmbedType as defaultEmbedTypeValue,
  embedCreditTextForLanguage,
  EmbedLanguage,
  EmbedType,
  normalizeEmbedLanguage,
  readEmbedPageEventId,
  readEmbedPageLanguage,
  readEmbedPageType,
  SupportedEmbedLanguage,
  supportedEmbedLanguageCodes,
} from "./embed-page.helpers";

@Component({
  selector: "app-embed-page",
  imports: [
    MatSlideToggleModule,
    FormsModule,
    MatButtonModule,
    ReactiveFormsModule,
    CodeBlockComponent,
    ChipSelectorComponent,
    MatTooltipModule,
    MatFormFieldModule,
    MatAutocompleteModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: "./embed-page.component.html",
  styleUrls: ["./embed-page.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (platformId: Object) => {
        if (isPlatformBrowser(platformId)) {
          return window.location.origin;
        }
        return "/"; // fallback for server-side
      },
      deps: [PLATFORM_ID],
    },
  ],
})
export class EmbedPageComponent {
  sanitizer = inject(DomSanitizer);
  baseHref = inject(APP_BASE_HREF);
  private _platformId = inject(PLATFORM_ID);
  private _eventsService = inject(EventsService);
  private _analytics = inject(AnalyticsService);
  private _locale = inject<LocaleCode>(LOCALE_ID);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);
  private _queryParamsReady = signal<boolean>(false);

  supportedLanguageCodes = supportedEmbedLanguageCodes;
  languages: Record<string, { name_english: string; name_native?: string }> =
    languageCodes;
  embedLanguage = signal<EmbedLanguage>("auto");

  showSatelliteToggle = signal<boolean>(true);
  showGeolocation = signal<boolean>(false);

  /** All events the user can pick from. Loaded on init. */
  events = signal<PkEvent[]>([]);
  eventsLoading = signal<boolean>(true);

  /** Currently selected event id/slug for the embed. Empty until events load. */
  eventId = signal<string>("");
  showEventHeader = signal<boolean>(false);

  /** Display name for the currently selected event (for the form label). */
  selectedEventName = computed<string>(() => {
    const id = this.eventId();
    const event = this.events().find((e) => (e.slug ?? e.id) === id);
    return event?.name ?? "";
  });

  defaultEmbedType: EmbedType = defaultEmbedTypeValue;
  embedTypes: EmbedType[] = ["event", "event-map"]; // "map",
  embedTypeName: Record<EmbedType, string> = {
    map: $localize`Map`,
    event: $localize`Event info`,
    "event-map": $localize`Event map`,
  };
  embedTypeOptions: ChipSelectorOption<EmbedType>[] = this.embedTypes.map(
    (embedType) => ({
      value: embedType,
      label: this.embedTypeName[embedType],
    }),
  );
  embedTypeSelectorLabel = "Embed type";

  tab = signal<EmbedType>(this.defaultEmbedType);

  effectiveEmbedLanguage = computed<SupportedEmbedLanguage>(() => {
    const language = this.embedLanguage();
    return language === "auto" ? normalizeEmbedLanguage(this._locale) : language;
  });

  embedCreditText = computed(() =>
    embedCreditTextForLanguage(this.effectiveEmbedLanguage()),
  );

  unsafeIframeUrl = computed<string>(() => {
    const baseUrl = `${this.baseHref}`;
    const tab = this.tab();
    const language = this.embedLanguage();
    const eventId = this.eventId();

    let url =
      baseUrl + (language === "auto" ? "" : "/" + language) + "/embedded/";

    switch (tab) {
      case "map":
        url += "map/";
        break;
      case "event":
        if (!eventId) return "";
        url += "events/";
        url += eventId;
        url += this.showEventHeader()
          ? "?showHeader=true"
          : "?showHeader=false";
        break;
      case "event-map":
        if (!eventId) return "";
        url += "events/";
        url += eventId;
        url += "/map";
        url += this.showEventHeader()
          ? "?showHeader=true"
          : "?showHeader=false";
        break;
    }

    return url;
  });

  safeIframeUrl = computed<SafeResourceUrl>(() => {
    const url = this.unsafeIframeUrl();
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  publicContentUrl = computed<string>(() => {
    const url = this.unsafeIframeUrl();
    if (!url) return "";
    return buildUnembeddedUrlFromHref(url, { includeEmbedCtaUtm: false });
  });

  iframeCode = computed<string>(() => {
    const url = this.unsafeIframeUrl();
    const publicUrl = this.publicContentUrl();
    if (!url) return "";
    const creditText = this.embedCreditText();
    return `<div style="width:100%;max-width:100%;height:620px;border-radius:8px;overflow:hidden;">
  <iframe src="${url}" title="${creditText.iframeTitle}" loading="lazy" style="display:block;width:100%;height:calc(100% - 22px);border:0;overflow:hidden;"></iframe>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:4px 12px 0;font:11px/1.35 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#6f7378;">
    <span>${creditText.interactiveLabel}</span>
    <span>${creditText.dataByLabel} <a href="${publicUrl}" target="_top" rel="noopener" style="color:inherit;text-decoration:underline;">PK Spot</a></span>
  </div>
</div>`;
  });

  embedAnalyticsProperties = computed<Record<string, unknown>>(() => ({
    embed_type: this.tab(),
    event_id: this.eventId() || null,
    embed_language: this.embedLanguage(),
    show_event_header: this.showEventHeader(),
    show_satellite_toggle: this.showSatelliteToggle(),
    show_geolocation: this.showGeolocation(),
  }));

  constructor() {
    this._applyEmbedPageQueryParams(this._route.snapshot.queryParamMap);
    this._route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((paramMap) => this._applyEmbedPageQueryParams(paramMap));

    effect(() => {
      if (!isPlatformBrowser(this._platformId) || !this._queryParamsReady()) {
        return;
      }

      const queryParams = buildEmbedPageQueryParams({
        eventId: this.eventId(),
        embedType: this.tab(),
        language: this.embedLanguage(),
      });

      if (this._queryParamsMatch(queryParams)) {
        return;
      }

      void this._router.navigate([], {
        relativeTo: this._route,
        queryParams,
        replaceUrl: true,
      });
    });

    if (isPlatformBrowser(this._platformId)) {
      afterNextRender(() => {
        void this._loadEvents();
      });
    }
  }

  onEmbedTypeChange(value: string | null): void {
    if (value === "map" || value === "event" || value === "event-map") {
      this.tab.set(value);
      this._analytics.trackEvent("embed_option_changed", {
        ...this.embedAnalyticsProperties(),
        option: "embed_type",
        value,
      });
    }
  }

  onEventSelectionChange(value: string): void {
    this.eventId.set(value);
    this._analytics.trackEvent("embed_option_changed", {
      ...this.embedAnalyticsProperties(),
      option: "event",
      value,
    });
  }

  onLanguageChange(value: EmbedLanguage): void {
    this.embedLanguage.set(value);
    this._analytics.trackEvent("embed_option_changed", {
      ...this.embedAnalyticsProperties(),
      option: "language",
      value,
    });
  }

  onShowEventHeaderChange(event: MatSlideToggleChange): void {
    this.showEventHeader.set(event.checked);
    this._analytics.trackEvent("embed_option_changed", {
      ...this.embedAnalyticsProperties(),
      option: "show_event_header",
      value: event.checked,
    });
  }

  onShowSatelliteToggleChange(event: MatSlideToggleChange): void {
    this.showSatelliteToggle.set(event.checked);
    this._analytics.trackEvent("embed_option_changed", {
      ...this.embedAnalyticsProperties(),
      option: "show_satellite_toggle",
      value: event.checked,
    });
  }

  onShowGeolocationChange(event: MatSlideToggleChange): void {
    this.showGeolocation.set(event.checked);
    this._analytics.trackEvent("embed_option_changed", {
      ...this.embedAnalyticsProperties(),
      option: "show_geolocation",
      value: event.checked,
    });
  }

  trackPublicContentClick(): void {
    this._analytics.trackOutboundLinkClick(
      "embed_page",
      "embedded_credit",
      this.publicContentUrl(),
      "PK Spot",
      this.embedAnalyticsProperties(),
    );
  }

  private async _loadEvents() {
    try {
      const events = await this._eventsService.getEvents({ sortByNext: true });
      this.events.set(events);
      // Default-select the first non-past event, or the first event if all are past.
      const firstUpcoming = events.find((e) => !e.isPast()) ?? events[0];
      if (firstUpcoming && !this.eventId()) {
        this.eventId.set(firstUpcoming.slug ?? firstUpcoming.id);
      }
    } catch (err) {
      console.warn("EmbedPage: failed to load events", err);
    } finally {
      this.eventsLoading.set(false);
    }
  }

  private _applyEmbedPageQueryParams(paramMap: ParamMap): void {
    this.tab.set(readEmbedPageType(paramMap) ?? this.defaultEmbedType);
    this.eventId.set(readEmbedPageEventId(paramMap) ?? "");

    const language = readEmbedPageLanguage(paramMap);
    this.embedLanguage.set(language ?? "auto");

    this._queryParamsReady.set(true);
  }

  private _queryParamsMatch(
    queryParams: Record<string, string | null>,
  ): boolean {
    const current = this._route.snapshot.queryParamMap;
    const expectedKeys = new Set(
      Object.entries(queryParams)
        .filter(([, value]) => value !== null)
        .map(([key]) => key),
    );

    if (current.keys.some((key) => !expectedKeys.has(key))) {
      return false;
    }

    return Object.entries(queryParams).every(([key, value]) => {
      return (current.get(key) ?? null) === value;
    });
  }
}
