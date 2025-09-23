import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  computed,
  inject,
  signal,
  LOCALE_ID,
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
import { MapsApiService } from "../services/maps-api.service";

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
  ],
  templateUrl: "./google-place-preview.component.html",
  styleUrls: ["./google-place-preview.component.scss"],
})
export class GooglePlacePreviewComponent implements OnChanges, OnDestroy {
  private _maps = inject(MapsApiService);
  private _locale: string = inject(LOCALE_ID);

  @Input() placeId?: string | null;
  // Always render in standard (non-dense) layout

  loading = signal(false);
  error = signal<string | null>(null);
  place = signal<google.maps.places.PlaceResult | null>(null);

  photoUrl = computed(() => {
    const p = this.place();
    if (!p) return null;
    try {
      return this._maps.getPhotoURLOfGooglePlace(p, 300, 200);
    } catch {
      return null;
    }
  });

  closedTemporarily = computed<boolean>(() => {
    const status = (this.place() as any)?.business_status as string | undefined;
    return status === "CLOSED_TEMPORARILY";
  });

  isOpenNow = computed<undefined | boolean>(() => {
    const oh = this.place()?.opening_hours as any;
    try {
      if (oh && typeof oh.isOpen === "function") return !!oh.isOpen(new Date());
    } catch {}
    return undefined;
  });

  todayHoursText = computed<string | null>(() => {
    const p = this.place();
    const oh: any = p?.opening_hours as any;
    const periods: any[] | undefined = oh?.periods as any;
    if (!periods || periods.length === 0) return null;

    const now = new Date();
    const today = now.getDay(); // 0 (Sun) - 6 (Sat)
    const fmtTime = new Intl.DateTimeFormat(this._locale, {
      hour: "numeric",
      minute: "2-digit",
    });
    const fmtWeekday = new Intl.DateTimeFormat(this._locale, {
      weekday: "long",
    });

    // Collect today's opening intervals
    const todays = periods.filter((per: any) => per?.open?.day === today);
    if (!todays || todays.length === 0) return null;

    const intervals: string[] = [];
    for (const per of todays) {
      const open = per?.open;
      const close = per?.close;
      if (!open?.time || !close?.time) continue;

      const openH = parseInt(open.time.slice(0, 2), 10);
      const openM = parseInt(open.time.slice(2) || "0", 10);
      const closeH = parseInt(close.time.slice(0, 2), 10);
      const closeM = parseInt(close.time.slice(2) || "0", 10);

      // Build dates for formatting; handle overnight by adding a day when close.day != open.day
      const openDate = new Date(now);
      openDate.setHours(openH, openM, 0, 0);
      const closeDate = new Date(now);
      closeDate.setHours(closeH, closeM, 0, 0);
      if (close?.day !== undefined && close.day !== today) {
        // closes next day
        closeDate.setDate(closeDate.getDate() + 1);
      }

      intervals.push(
        `${fmtTime.format(openDate)}–${fmtTime.format(closeDate)}`
      );
    }

    const dayLabel = fmtWeekday.format(now);
    return `${dayLabel}: ${intervals.join(", ")}`;
  });

  openStatusText = computed<string | null>(() => {
    const p = this.place();
    if (!p) return null;
    const oh: any = p.opening_hours as any;
    const periods: any[] | undefined = oh?.periods as any;
    if (!periods || periods.length === 0) return null;

    const now = new Date();
    const today = now.getDay(); // 0 (Sun) - 6 (Sat)
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const fmtTime = new Intl.DateTimeFormat(this._locale, {
      hour: "numeric",
      minute: "2-digit",
    });

    // Helper to parse "HHMM" -> minutes
    const toMinutes = (hhmm: string | undefined): number | null => {
      if (!hhmm || hhmm.length < 3) return null;
      const hh = parseInt(hhmm.slice(0, 2), 10);
      const mm = parseInt(hhmm.slice(2), 10) || 0;
      if (isNaN(hh) || isNaN(mm)) return null;
      return hh * 60 + mm;
    };

    // Gather today's periods
    const todays = periods.filter((per: any) => per?.open?.day === today);
    // Try to find an active period first
    for (const per of todays) {
      const openM = toMinutes(per?.open?.time);
      const closeM = toMinutes(per?.close?.time);
      if (openM === null || closeM === null) continue;
      // Handle overnight close (close day may roll over)
      const closesTomorrow =
        per?.close?.day !== undefined && per?.close?.day !== today;
      const effectiveClose = closesTomorrow ? 24 * 60 + closeM : closeM;
      const effectiveNow =
        closesTomorrow && nowMinutes < openM
          ? nowMinutes + 24 * 60
          : nowMinutes;
      if (effectiveNow >= openM && effectiveNow < effectiveClose) {
        // Open now
        const closeDate = new Date(now);
        closeDate.setHours(Math.floor(closeM / 60), closeM % 60, 0, 0);
        if (closesTomorrow) closeDate.setDate(closeDate.getDate() + 1);
        return `Open now until ${fmtTime.format(closeDate)}`;
      }
    }
    // Not open now; find the next opening today
    const upcoming = todays
      .map((per: any) => ({ time: toMinutes(per?.open?.time) }))
      .filter((x: any) => x.time !== null && x.time! > nowMinutes)
      .sort((a: any, b: any) => a.time! - b.time!);
    if (upcoming.length > 0) {
      const t = upcoming[0].time!;
      const openDate = new Date(now);
      openDate.setHours(Math.floor(t / 60), t % 60, 0, 0);
      return `Opens at ${fmtTime.format(openDate)}`;
    }
    return null;
  });

  ngOnChanges(): void {
    void this.loadDetails();
  }

  ngOnDestroy(): void {}

  private async loadDetails() {
    const id = this.placeId ?? undefined;
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
    }
    this.loading.set(true);
    this.error.set(null);
    try {
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
