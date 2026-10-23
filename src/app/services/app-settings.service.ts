import { Injectable, signal, effect, PLATFORM_ID, Inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";

export type TimeFormatPreference = "automatic" | "12-hour" | "24-hour";
/**
 * App used by "Open in Maps" and directions. "automatic" hands off to the
 * default navigation app in the iOS app and uses Google Maps elsewhere.
 */
export type MapsAppPreference = "automatic" | "google" | "apple" | "osm";
const MAPS_APP_PREFERENCES: readonly MapsAppPreference[] = ["automatic", "google", "apple", "osm"];

type StoredAppSettings = {
  debugMode?: unknown;
  mapProfileMode?: unknown;
  enableVectorMaps?: unknown;
  enableMapGlassBlur?: unknown;
  timeFormat?: unknown;
  mapsApp?: unknown;
};

@Injectable({
  providedIn: "root",
})
export class AppSettingsService {
  private readonly STORAGE_KEY = "pkspot_app_settings";

  // Signals for settings
  debugMode = signal<boolean>(false);
  enableVectorMaps = signal<boolean>(false);
  enableMapGlassBlur = signal<boolean>(false);
  timeFormat = signal<TimeFormatPreference>("automatic");
  mapsApp = signal<MapsAppPreference>("automatic");

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this._loadSettings();

    // Auto-save changes
    effect(() => {
      this._saveSettings();
    });
  }

  private _loadSettings() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredAppSettings;
        if (typeof parsed.debugMode === "boolean") {
          this.debugMode.set(parsed.debugMode);
        }
        if (
          typeof parsed.mapProfileMode === "boolean" &&
          parsed.mapProfileMode
        ) {
          this.debugMode.set(true);
        }
        if (typeof parsed.enableVectorMaps === "boolean") {
          this.enableVectorMaps.set(parsed.enableVectorMaps);
        }
        if (typeof parsed.enableMapGlassBlur === "boolean") {
          this.enableMapGlassBlur.set(parsed.enableMapGlassBlur);
        }
        if (
          parsed.timeFormat === "automatic" ||
          parsed.timeFormat === "12-hour" ||
          parsed.timeFormat === "24-hour"
        ) {
          this.timeFormat.set(parsed.timeFormat);
        }
        if (MAPS_APP_PREFERENCES.includes(parsed.mapsApp as MapsAppPreference)) {
          this.mapsApp.set(parsed.mapsApp as MapsAppPreference);
        }
      }
    } catch (e) {
      console.warn("Failed to load app settings", e);
    }
  }

  private _saveSettings() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      const settings = {
        debugMode: this.debugMode(),
        enableVectorMaps: this.enableVectorMaps(),
        enableMapGlassBlur: this.enableMapGlassBlur(),
        timeFormat: this.timeFormat(),
        mapsApp: this.mapsApp(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn("Failed to save app settings", e);
    }
  }
}
