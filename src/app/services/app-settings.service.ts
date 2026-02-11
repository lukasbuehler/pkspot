import { Injectable, signal, effect, PLATFORM_ID, Inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";

@Injectable({
  providedIn: "root",
})
export class AppSettingsService {
  private readonly STORAGE_KEY = "pkspot_app_settings";

  // Signals for settings
  debugMode = signal<boolean>(false);

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
        const parsed = JSON.parse(stored);
        if (typeof parsed.debugMode === "boolean") {
          this.debugMode.set(parsed.debugMode);
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
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn("Failed to save app settings", e);
    }
  }
}
