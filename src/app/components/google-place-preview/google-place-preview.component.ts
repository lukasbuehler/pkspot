import {
  Component,
  computed,
  inject,
  signal,
  LOCALE_ID,
  effect,
  input,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
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
import { PlatformService } from "../../services/platform.service";
import { NativeGooglePlacePhotoService } from "../../services/native-google-place-photo.service";

@Component({
  selector: "app-google-place-preview",
  imports: [
    CommonModule,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardSubtitle,
    MatRipple,
    SpotRatingComponent,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: "./google-place-preview.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./google-place-preview.component.scss"],
})
export class GooglePlacePreviewComponent {
  private _maps = inject(MapsApiService);
  private _analytics = inject(AnalyticsService);
  private _platform = inject(PlatformService);
  private _nativePhoto = inject(NativeGooglePlacePhotoService);
  private _locale: string = inject(LOCALE_ID);
  private _nativePhotoRequestId = 0;

  placeId = input<string | null | undefined>(undefined);
  // Always render in standard (non-dense) layout

  loading = signal(false);
  error = signal<string | null>(null);
  place = signal<google.maps.places.Place | null>(null);
  nativePhotoUrl = signal<string | null>(null);
  nativePhotoAttributions = signal<string[]>([]);

  photoUrl = computed(() => {
    const p = this.place();
    if (!p) return null;
    if (this._isIosWebKit()) return this.nativePhotoUrl();
    try {
      return this._maps.getPhotoURLOfGooglePlace(p, 300, 200);
    } catch {
      return null;
    }
  });

  photoAttributionText = computed(() => {
    if (this._isIosWebKit()) {
      return this._formatAttributions(this.nativePhotoAttributions());
    }

    const attributions = this.place()?.photos?.[0]?.authorAttributions.map(
      (attribution) => attribution.displayName,
    );
    return this._formatAttributions(attributions);
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
      this.placeId();
      if (this._maps.isApiLoaded()) {
        this._loadDetails();
      }
    });

    effect(() => {
      const id = this.placeId();
      if (id && this._nativePhoto.isAvailable()) {
        this._loadNativePhoto(id);
      } else {
        this._nativePhotoRequestId++;
        this.nativePhotoUrl.set(null);
        this.nativePhotoAttributions.set([]);
      }
    });
  }

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
      } catch (e: unknown) {
        console.warn("Failed to load Google Place details", e);
        this.error.set(
          typeof e === "string"
            ? e
            : e instanceof Error
              ? e.message
              : "Failed to load"
        );
        this.place.set(null);
      } finally {
        this.loading.set(false);
      }
    }
  }

  private async _loadNativePhoto(placeId: string): Promise<void> {
    const requestId = ++this._nativePhotoRequestId;
    this.nativePhotoUrl.set(null);
    this.nativePhotoAttributions.set([]);

    const photo = await this._nativePhoto.getPhoto(
      placeId,
      300,
      200,
    );

    if (requestId !== this._nativePhotoRequestId) {
      return;
    }

    this.nativePhotoUrl.set(photo?.imageDataUrl ?? null);
    this.nativePhotoAttributions.set(photo?.attributions ?? []);
  }

  private _formatAttributions(
    attributions: readonly (string | null | undefined)[] | undefined,
  ): string | null {
    const names = [
      ...new Set(
        (attributions ?? [])
          .map((attribution) => attribution?.trim())
          .filter((attribution): attribution is string => !!attribution),
      ),
    ];

    return names.length ? names.join(", ") : null;
  }

  private _isIosWebKit(): boolean {
    if (this._platform.getPlatform() === "ios") {
      return true;
    }
    if (typeof navigator === "undefined") {
      return false;
    }

    return (
      /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }
}
