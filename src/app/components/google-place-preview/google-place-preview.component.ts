import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  computed,
  inject,
  signal,
  LOCALE_ID,
  effect,
  input,
} from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import {
  MatCard,
  MatCardHeader,
  MatCardTitle,
  MatCardSubtitle,
} from "@angular/material/card";
import { MatRipple } from "@angular/material/core";
import { SpotRatingComponent } from "../spot-rating/spot-rating.component";
import { MapsApiService } from "../../services/maps-api.service";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";

import { AnalyticsService } from "../../services/analytics.service";

@Component({
  selector: "app-google-place-preview",
  standalone: true,
  imports: [
    CommonModule,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardSubtitle,
    MatRipple,
    SpotRatingComponent,
    NgOptimizedImage,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: "./google-place-preview.component.html",
  styleUrls: ["./google-place-preview.component.scss"],
})
export class GooglePlacePreviewComponent implements OnDestroy {
  private _maps = inject(MapsApiService);
  private _analytics = inject(AnalyticsService);
  private _locale: string = inject(LOCALE_ID);

  placeId = input<string | null | undefined>(undefined);
  // Always render in standard (non-dense) layout

  loading = signal(false);
  error = signal<string | null>(null);
  place = signal<google.maps.places.Place | null>(null);

  photoUrl = computed(() => {
    const p = this.place();
    if (!p) return null;
    try {
      return this._maps.getPhotoURLOfGooglePlace(p, 300, 200);
    } catch {
      return null;
    }
  });

  websiteUrl = computed<string | null>(() => {
    const p = this.place();
    if (!p || !p.websiteURI) return null;
    return this._analytics.addUtmToUrl(p.websiteURI, "spot_preview_website");
  });

  url = computed<string | null>(() => {
    const p = this.place();
    if (!p) return null;
    let mapUrl: string;
    if (p.googleMapsURI) {
      mapUrl = p.googleMapsURI;
    } else {
      mapUrl = `https://www.google.com/maps/search/?api=1&query=${p.displayName}&query_place_id=${p.id}`;
    }
    return this._analytics.addUtmToUrl(mapUrl, "spot_preview_maps");
  });

  trackMapClick() {
    this._analytics.trackEvent("click_google_place_map", {
      place_id: this.placeId(),
      place_name: this.place()?.displayName,
      url: this.url(),
    });
    return true; // allow navigation to proceed
  }

  trackWebsiteClick() {
    this._analytics.trackEvent("click_google_place_website", {
      place_id: this.placeId(),
      place_name: this.place()?.displayName,
      url: this.websiteUrl(),
    });
    return true; // allow navigation to proceed
  }

  closedTemporarily = computed<boolean>(() => {
    const status = this.place()?.businessStatus as string | undefined;
    return status === "CLOSED_TEMPORARILY";
  });

  isOpenNow = computed<undefined | boolean>(() => {
    const p = this.place();
    const oh: any = p?.regularOpeningHours as any;
    if (!oh) return undefined;

    const periods: any[] | undefined = oh?.Eg; // periods is stored in 'Eg'
    if (!periods || periods.length === 0) return undefined;

    const now = new Date();
    const today = now.getDay(); // 0 (Sun) - 6 (Sat)
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Each period has Fg (open) and Eg (close) objects
    // Fg.Fg = day, Fg.Gg = hours, Fg.Hg = minutes
    const todays = periods.filter((per: any) => per?.Fg?.Fg === today); // Fg.Fg = day

    for (const per of todays) {
      const openH = per?.Fg?.Gg ?? 0; // Fg.Gg = open hours
      const openM = per?.Fg?.Hg ?? 0; // Fg.Hg = open minutes
      const closeH = per?.Eg?.Gg ?? 0; // Eg.Gg = close hours
      const closeM = per?.Eg?.Hg ?? 0; // Eg.Hg = close minutes

      const openMinutes = openH * 60 + (openM || 0);
      const closeMinutes = closeH * 60 + (closeM || 0);

      // Handle overnight close
      const closeDay = per?.Eg?.Fg;
      const closesTomorrow = closeDay !== undefined && closeDay !== today;
      const effectiveClose = closesTomorrow
        ? 24 * 60 + closeMinutes
        : closeMinutes;
      const effectiveNow =
        closesTomorrow && nowMinutes < openMinutes
          ? nowMinutes + 24 * 60
          : nowMinutes;

      if (effectiveNow >= openMinutes && effectiveNow < effectiveClose) {
        return true; // Open now
      }
    }
    return false; // Not open now
  });

  todayHoursText = computed<string | null>(() => {
    const p = this.place();
    const oh: any = p?.regularOpeningHours as any;
    const periods: any[] | undefined = oh?.Eg; // periods is stored in 'Eg'
    if (!periods || periods.length === 0) {
      return null;
    }

    const now = new Date();
    const today = now.getDay(); // 0 (Sun) - 6 (Sat)

    const fmtTime = new Intl.DateTimeFormat(this._locale, {
      hour: "numeric",
      minute: "2-digit",
    });
    const fmtWeekday = new Intl.DateTimeFormat(this._locale, {
      weekday: "short",
    });

    // Each period has Fg (open) and Eg (close) objects
    // Fg.Fg = day, Fg.Gg = hours, Fg.Hg = minutes
    const todays = periods.filter((per: any) => per?.Fg?.Fg === today); // Fg.Fg = day

    if (!todays || todays.length === 0) {
      // No hours today - find next opening day
      for (let i = 1; i < 7; i++) {
        const nextDay = (today + i) % 7;
        const nextDayPeriods = periods.filter(
          (per: any) => per?.Fg?.Fg === nextDay
        );
        if (nextDayPeriods.length > 0) {
          const nextDate = new Date(now);
          nextDate.setDate(nextDate.getDate() + i);
          const nextDayLabel = fmtWeekday.format(nextDate);
          const firstPeriod = nextDayPeriods[0];
          const openH = firstPeriod?.Fg?.Gg ?? 0; // Fg.Gg = open hours
          const openM = firstPeriod?.Fg?.Hg ?? 0; // Fg.Hg = open minutes
          const openDate = new Date(now);
          openDate.setHours(openH, openM, 0, 0);
          return $localize`Closed · Opens ${nextDayLabel}. ${fmtTime.format(
            openDate
          )}`;
        }
      }
      return $localize`Closed`;
    }

    const intervals: string[] = [];
    let maxCloseH = 0;
    let maxCloseM = 0;

    for (const per of todays) {
      const openH = per?.Fg?.Gg; // Fg.Gg = open hours
      const openM = per?.Fg?.Hg ?? 0; // Fg.Hg = open minutes
      const closeH = per?.Eg?.Gg ?? 0; // Eg.Gg = close hours
      const closeM = per?.Eg?.Hg ?? 0; // Eg.Hg = close minutes

      if (openH === undefined || openH === null) {
        continue;
      }

      // Track the latest closing time
      if (closeH > maxCloseH || (closeH === maxCloseH && closeM > maxCloseM)) {
        maxCloseH = closeH;
        maxCloseM = closeM;
      }

      // Build dates for formatting
      const openDate = new Date(now);
      openDate.setHours(openH, openM, 0, 0);
      const closeDate = new Date(now);
      closeDate.setHours(closeH, closeM, 0, 0);

      // Handle overnight close (close day may be different)
      if (per?.Eg?.Fg !== undefined && per?.Eg?.Fg !== today) {
        closeDate.setDate(closeDate.getDate() + 1);
      }

      const interval = `${fmtTime.format(openDate)}–${fmtTime.format(
        closeDate
      )}`;
      intervals.push(interval);
    }

    // Check if place is closed now (past closing time for today)
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const maxCloseMinutes = maxCloseH * 60 + maxCloseM;
    const isClosedNow = nowMinutes >= maxCloseMinutes;

    // If no valid intervals were found despite finding today's periods, treat as closed
    if (intervals.length === 0 || isClosedNow) {
      // No valid hours today or closed now - find next opening day
      for (let i = 1; i < 7; i++) {
        const nextDay = (today + i) % 7;
        const nextDayPeriods = periods.filter(
          (per: any) => per?.Fg?.Fg === nextDay
        );
        if (nextDayPeriods.length > 0) {
          const nextDate = new Date(now);
          nextDate.setDate(nextDate.getDate() + i);
          const nextDayLabel = fmtWeekday.format(nextDate);
          const firstPeriod = nextDayPeriods[0];
          const openH = firstPeriod?.Fg?.Gg ?? 0; // Fg.Gg = open hours
          const openM = firstPeriod?.Fg?.Hg ?? 0; // Fg.Hg = open minutes
          const openDate = new Date(now);
          openDate.setHours(openH, openM, 0, 0);
          return $localize`Closed · Opens ${nextDayLabel}. ${fmtTime.format(
            openDate
          )}`;
        }
      }
      return $localize`Closed`;
    }

    return intervals.join(", ");
  });

  openStatusText = computed<string | null>(() => {
    const p = this.place();
    if (!p) return null;
    const oh: any = p.regularOpeningHours as any;
    const periods: any[] | undefined = oh?.Eg; // periods is stored in 'Eg'
    if (!periods || periods.length === 0) return null;

    const now = new Date();
    const today = now.getDay(); // 0 (Sun) - 6 (Sat)
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const fmtTime = new Intl.DateTimeFormat(this._locale, {
      hour: "numeric",
      minute: "2-digit",
    });

    // Each period has Fg (open) and Eg (close) objects
    // Fg.Fg = day, Fg.Gg = hours, Fg.Hg = minutes
    const todays = periods.filter((per: any) => per?.Fg?.Fg === today); // Fg.Fg = day

    // Try to find an active period first
    for (const per of todays) {
      const openH = per?.Fg?.Gg ?? 0; // Fg.Gg = open hours
      const openM = per?.Fg?.Hg ?? 0; // Fg.Hg = open minutes
      const closeH = per?.Eg?.Gg ?? 0; // Eg.Gg = close hours
      const closeM = per?.Eg?.Hg ?? 0; // Eg.Hg = close minutes

      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;

      // Handle overnight close
      const closeDay = per?.Eg?.Fg;
      const closesTomorrow = closeDay !== undefined && closeDay !== today;
      const effectiveClose = closesTomorrow
        ? 24 * 60 + closeMinutes
        : closeMinutes;
      const effectiveNow =
        closesTomorrow && nowMinutes < openMinutes
          ? nowMinutes + 24 * 60
          : nowMinutes;

      if (effectiveNow >= openMinutes && effectiveNow < effectiveClose) {
        // Open now
        const closeDate = new Date(now);
        closeDate.setHours(closeH, closeM, 0, 0);
        if (closesTomorrow) closeDate.setDate(closeDate.getDate() + 1);
        return `Open now until ${fmtTime.format(closeDate)}`;
      }
    }

    // Not open now; find the next opening today
    const upcoming = todays
      .filter((per: any) => {
        const openH = per?.Fg?.Gg ?? 0;
        const openM = per?.Fg?.Hg ?? 0;
        const openMinutes = openH * 60 + openM;
        return openMinutes > nowMinutes;
      })
      .sort((a: any, b: any) => {
        const aM = (a?.Fg?.Gg ?? 0) * 60 + (a?.Fg?.Hg ?? 0);
        const bM = (b?.Fg?.Gg ?? 0) * 60 + (b?.Fg?.Hg ?? 0);
        return aM - bM;
      });

    if (upcoming.length > 0) {
      const openH = upcoming[0]?.Fg?.Gg ?? 0;
      const openM = upcoming[0]?.Fg?.Hg ?? 0;
      const openDate = new Date(now);
      openDate.setHours(openH, openM, 0, 0);
      return `Opens at ${fmtTime.format(openDate)}`;
    }
    return null;
  });

  constructor() {
    effect(() => {
      const isApiLoaded = this._maps.isApiLoaded();
      const id = this.placeId();

      if (isApiLoaded) {
        this._loadDetails();
      }
    });
  }

  ngOnDestroy(): void {}

  private async _loadDetails() {
    const id = this.placeId();
    if (!id) {
      this.place.set(null);
      return;
    }
    // SSR guard and ensure API is available
    if (typeof window === "undefined" || typeof document === "undefined") {
      this.place.set(null);
      return;
    }

    if (!this._maps.isApiLoaded()) {
      this._maps.loadGoogleMapsApi();
      this.loading.set(false);
      this.error.set("Google Maps API not loaded");
      return;
    } else {
      try {
        this.loading.set(true);
        const details = await this._maps.getGooglePlaceById(id);
        this.place.set(details);
      } catch (e: any) {
        console.warn("Failed to load Google Place details", e);
        this.error.set(
          typeof e === "string" ? e : e?.message ?? "Failed to load"
        );
        this.place.set(null);
      } finally {
        this.loading.set(false);
      }
    }
  }
}
