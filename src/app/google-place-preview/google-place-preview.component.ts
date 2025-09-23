import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  computed,
  inject,
  signal,
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
})
export class GooglePlacePreviewComponent implements OnChanges, OnDestroy {
  private _maps = inject(MapsApiService);

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
    const oh = this.place()?.opening_hours as any;
    const weekdayText: string[] | undefined = oh?.weekday_text as any;
    if (!weekdayText || weekdayText.length === 0) return null;
    // Find entry matching today's day name to avoid locale ordering ambiguity
    const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const match = weekdayText.find((line) =>
      line.toLowerCase().startsWith(dayName.toLowerCase())
    );
    return match ?? weekdayText[0] ?? null;
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
        const ch = Math.floor(closeM / 60)
          .toString()
          .padStart(2, "0");
        const cm = (closeM % 60).toString().padStart(2, "0");
        return `Open now until ${ch}:${cm}`;
      }
    }
    // Not open now; find the next opening today
    const upcoming = todays
      .map((per: any) => ({ time: toMinutes(per?.open?.time) }))
      .filter((x: any) => x.time !== null && x.time! > nowMinutes)
      .sort((a: any, b: any) => a.time! - b.time!);
    if (upcoming.length > 0) {
      const t = upcoming[0].time!;
      const h = Math.floor(t / 60)
        .toString()
        .padStart(2, "0");
      const m = (t % 60).toString().padStart(2, "0");
      return `Opens at ${h}:${m}`;
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
