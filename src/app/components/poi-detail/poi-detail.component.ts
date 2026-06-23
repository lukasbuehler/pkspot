import {
  Component,
  input,
  output,
  inject,
  computed,
  signal,
  LOCALE_ID,
  ChangeDetectionStrategy
} from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { PoiData } from "../../../db/models/PoiData";
import { MapsApiService } from "../../services/maps-api.service";
import { AnalyticsService } from "../../services/analytics.service";
import { SpotRatingComponent } from "../spot-rating/spot-rating.component";
import { MatRippleModule } from "@angular/material/core";
import { getGooglePlaceOpeningHoursStatus } from "../../shared/google-place-opening-hours";

@Component({
  selector: "app-poi-detail",
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    NgOptimizedImage,
    SpotRatingComponent,
    MatRippleModule,
  ],
  templateUrl: "./poi-detail.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./poi-detail.component.scss",
})
export class PoiDetailComponent {
  poi = input.required<PoiData>();
  dismiss = output<void>();

  isImageLoaded = signal(false);

  private _maps = inject(MapsApiService);
  private _analytics = inject(AnalyticsService);
  private _locale: string = inject(LOCALE_ID);

  photoUrl = computed(() => {
    const p = this.poi().googlePlace;
    if (!p) return null;
    try {
      return this._maps.getPhotoURLOfGooglePlace(p, 600, 400);
    } catch {
      return null;
    }
  });

  onImageLoad() {
    this.isImageLoaded.set(true);
  }

  sourceText = computed(() => {
    if (this.poi().googlePlace) return "Source: Google Maps";
    if (this.poi().type === "amenity") return "Source: OpenStreetMap";
    return null;
  });

  websiteUrl = computed<string | null>(() => {
    const p = this.poi().googlePlace;
    if (!p || !p.websiteURI) return null;
    return this._analytics.addUtmToUrl(
      this._safeExternalUrl(p.websiteURI),
      "spot_preview_website"
    );
  });

  url = computed<string | null>(() => {
    const p = this.poi().googlePlace;
    // Fallback to location-based map URL if googlePlace is missing (e.g. amenities)
    if (!p) {
      const loc = this.poi().location;
      return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
    }

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

  getIcon(): string {
    if (this.poi().icon) return this.poi().icon!;
    if (this.poi().type === "amenity") return "location_on";
    return "place";
  }

  getTypeLabel(): string {
    if (this.poi().type === "amenity") {
      const icons = this.poi().marker?.icons;
      if (icons?.includes("water_full") || icons?.includes("water_drop"))
        return "Drinking Water";
      if (icons?.includes("wc")) return "Toilet";
      return "Amenity";
    }
    // Google POI types
    const p = this.poi().googlePlace;
    // Format the first type if available (e.g. "park" -> "Park")
    if (p?.types && p.types.length > 0) {
      const type = p.types[0].replace(/_/g, " ");
      return type.charAt(0).toUpperCase() + type.slice(1);
    }

    return "Point of Interest";
  }

  private openingHoursStatus = computed(() =>
    getGooglePlaceOpeningHoursStatus(
      this.poi().googlePlace?.regularOpeningHours,
      this._locale,
    ),
  );

  isOpenNow = computed<boolean | undefined>(
    () => this.openingHoursStatus().isOpenNow,
  );

  openStatusText = computed<string | null>(
    () => this.openingHoursStatus().openStatusText,
  );

  todayHoursText = computed<string | null>(
    () => this.openingHoursStatus().todayHoursText,
  );

  navigateTo() {
    const location = this.poi().location;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
    window.open(url, "_blank");
  }

  trackMapClick() {
    this._analytics.trackEvent("click_poi_map", {
      place_id: this.poi().id,
      place_name: this.poi().name,
      url: this.url(),
    });
    return true;
  }

  trackWebsiteClick() {
    this._analytics.trackEvent("click_poi_website", {
      place_id: this.poi().id,
      place_name: this.poi().name,
      url: this.websiteUrl(),
    });
    return true;
  }
}
