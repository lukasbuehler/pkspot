import { Injectable, PLATFORM_ID, computed, inject, signal } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { GeolocationService } from "./geolocation.service";

export type LocationAccessMode = "off" | "on" | "temporary";

type StoredLocationAccess = {
  mode?: unknown;
  temporaryUntilMs?: unknown;
};

@Injectable({ providedIn: "root" })
export class LocationAccessService {
  private static readonly STORAGE_KEY = "pkspot_location_access";
  private static readonly TEMPORARY_DURATION_MS = 5 * 60 * 1_000;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly geolocation = inject(GeolocationService);
  private readonly modeState = signal<LocationAccessMode>("off");
  private readonly temporaryUntilState = signal<number | null>(null);
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  readonly mode = this.modeState.asReadonly();
  readonly enabled = computed(() => {
    if (this.modeState() === "on") return true;
    const temporaryUntil = this.temporaryUntilState();
    return this.modeState() === "temporary" &&
      temporaryUntil !== null && temporaryUntil > Date.now();
  });

  constructor() {
    this.restore();
  }

  async enablePersistent(): Promise<void> {
    this.modeState.set("on");
    this.temporaryUntilState.set(null);
    this.persist();
    await this.geolocation.startWatching();
  }

  async enableTemporarily(): Promise<void> {
    const temporaryUntil = Date.now() + LocationAccessService.TEMPORARY_DURATION_MS;
    this.modeState.set("temporary");
    this.temporaryUntilState.set(temporaryUntil);
    this.scheduleExpiry(temporaryUntil);
    this.persist();
    await this.geolocation.startWatching();
  }

  async disable(): Promise<void> {
    this.modeState.set("off");
    this.temporaryUntilState.set(null);
    this.clearExpiryTimer();
    this.persist();
    await this.geolocation.stopWatching();
  }

  async startWatchingIfEnabled(): Promise<boolean> {
    if (!this.enabled()) return false;
    await this.geolocation.startWatching();
    return true;
  }

  private restore(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const stored = localStorage.getItem(LocationAccessService.STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as StoredLocationAccess;
      if (parsed.mode === "on") {
        this.modeState.set("on");
        return;
      }
      if (
        parsed.mode === "temporary" &&
        typeof parsed.temporaryUntilMs === "number" &&
        parsed.temporaryUntilMs > Date.now()
      ) {
        this.modeState.set("temporary");
        this.temporaryUntilState.set(parsed.temporaryUntilMs);
        this.scheduleExpiry(parsed.temporaryUntilMs);
      }
    } catch {
      localStorage.removeItem(LocationAccessService.STORAGE_KEY);
    }
  }

  private persist(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(
        LocationAccessService.STORAGE_KEY,
        JSON.stringify({
          mode: this.modeState(),
          ...(this.temporaryUntilState() !== null
            ? { temporaryUntilMs: this.temporaryUntilState() }
            : {}),
        }),
      );
    } catch {
      // The preference is optional; location remains off after a storage failure.
    }
  }

  private scheduleExpiry(temporaryUntil: number): void {
    this.clearExpiryTimer();
    this.expiryTimer = setTimeout(() => {
      void this.disable();
    }, Math.max(0, temporaryUntil - Date.now()));
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer !== undefined) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = undefined;
    }
  }
}
