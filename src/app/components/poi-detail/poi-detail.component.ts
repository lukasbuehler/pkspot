import {
  Component,
  input,
  output,
  inject,
  computed,
  signal,
  LOCALE_ID,
} from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { PoiData } from "../../../db/models/PoiData";
import { MapsApiService } from "../../services/maps-api.service";
import { AnalyticsService } from "../../services/analytics.service";
import { SpotRatingComponent } from "../spot-rating/spot-rating.component";
import { MatRippleModule } from "@angular/material/core";

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
    return this._analytics.addUtmToUrl(p.websiteURI, "spot_preview_website");
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
    return this._analytics.addUtmToUrl(mapUrl, "spot_preview_maps");
  });

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

  isOpenNow = computed<boolean | undefined>(() => {
    const p = this.poi().googlePlace;
    const oh: any = p?.regularOpeningHours as any;
    if (!oh) return undefined;
    const periods = oh?.Eg;
    if (!periods || periods.length === 0) return undefined;

    const now = new Date();
    const today = now.getDay();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const todays = periods.filter((per: any) => per?.Fg?.Fg === today);

    for (const per of todays) {
      const openH = per?.Fg?.Gg ?? 0;
      const openM = per?.Fg?.Hg ?? 0;
      const closeH = per?.Eg?.Gg ?? 0;
      const closeM = per?.Eg?.Hg ?? 0;

      const openMinutes = openH * 60 + (openM || 0);
      const closeMinutes = closeH * 60 + (closeM || 0);

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
        return true;
      }
    }
    return false;
  });

  openStatusText = computed<string | null>(() => {
    const p = this.poi().googlePlace;
    if (!p) return null;
    const oh: any = p.regularOpeningHours as any;
    const periods: any[] | undefined = oh?.Eg;
    if (!periods || periods.length === 0) return null;

    const now = new Date();
    const today = now.getDay();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const fmtTime = new Intl.DateTimeFormat(this._locale, {
      hour: "numeric",
      minute: "2-digit",
    });

    const todays = periods.filter((per: any) => per?.Fg?.Fg === today);

    for (const per of todays) {
      const openH = per?.Fg?.Gg ?? 0;
      const openM = per?.Fg?.Hg ?? 0;
      const closeH = per?.Eg?.Gg ?? 0;
      const closeM = per?.Eg?.Hg ?? 0;

      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;

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
        const closeDate = new Date(now);
        closeDate.setHours(closeH, closeM, 0, 0);
        if (closesTomorrow) closeDate.setDate(closeDate.getDate() + 1);
        return `Open now until ${fmtTime.format(closeDate)}`;
      }
    }

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

    return "Closed";
  });

  todayHoursText = computed<string | null>(() => {
    const p = this.poi().googlePlace;
    const oh: any = p?.regularOpeningHours as any;
    const periods: any[] | undefined = oh?.Eg;
    if (!periods || periods.length === 0) return null;

    const now = new Date();
    const today = now.getDay();
    const fmtTime = new Intl.DateTimeFormat(this._locale, {
      hour: "numeric",
      minute: "2-digit",
    });

    const todays = periods.filter((per: any) => per?.Fg?.Fg === today);

    if (todays.length === 0) return null;

    const intervals: string[] = [];
    for (const per of todays) {
      const openH = per?.Fg?.Gg;
      const openM = per?.Fg?.Hg ?? 0;
      const closeH = per?.Eg?.Gg ?? 0;
      const closeM = per?.Eg?.Hg ?? 0;

      if (openH === undefined || openH === null) continue;

      const openDate = new Date(now);
      openDate.setHours(openH, openM, 0, 0);
      const closeDate = new Date(now);
      closeDate.setHours(closeH, closeM, 0, 0);

      if (per?.Eg?.Fg !== undefined && per?.Eg?.Fg !== today) {
        closeDate.setDate(closeDate.getDate() + 1);
      }

      intervals.push(
        `${fmtTime.format(openDate)}–${fmtTime.format(closeDate)}`
      );
    }
    return intervals.join(", ");
  });

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
