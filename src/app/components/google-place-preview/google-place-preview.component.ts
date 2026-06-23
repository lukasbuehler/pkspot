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
  ChangeDetectionStrategy
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
import { getGooglePlaceOpeningHoursStatus } from "../../shared/google-place-opening-hours";

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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    return this._analytics.addUtmToUrl(
      this._safeExternalUrl(p.websiteURI),
      "spot_preview_website"
    );
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
    return this._analytics.addUtmToUrl(
      this._safeExternalUrl(mapUrl),
      "spot_preview_maps"
    );
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

  closedTemporarily = computed<boolean>(() => {
    const status = this.place()?.businessStatus as string | undefined;
    return status === "CLOSED_TEMPORARILY";
  });

  private openingHoursStatus = computed(() =>
    getGooglePlaceOpeningHoursStatus(
      this.place()?.regularOpeningHours,
      this._locale,
    ),
  );

  isOpenNow = computed<undefined | boolean>(
    () => this.openingHoursStatus().isOpenNow,
  );

  todayHoursText = computed<string | null>(
    () => this.openingHoursStatus().todayHoursText,
  );

  openStatusText = computed<string | null>(
    () => this.openingHoursStatus().openStatusText,
  );

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
