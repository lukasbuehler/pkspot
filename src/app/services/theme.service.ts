import { Injectable, computed, signal } from "@angular/core";

export type ThemeMode = "auto" | "dark" | "light";

@Injectable({ providedIn: "root" })
export class ThemeService {
  // Global theme mode for the app
  private _mode = signal<ThemeMode>("auto");

  // Public accessor
  mode = computed(() => this._mode());

  setMode(mode: ThemeMode) {
    this._mode.set(mode);
  }

  // Resolve dark/light given current map style and mode
  isDark(mapStyle: "roadmap" | "satellite" = "roadmap") {
    const mode = this._mode();
    if (mode === "auto") {
      // Default behavior: dark for roadmap, light for satellite
      return mapStyle !== "satellite";
    }
    return mode === "dark";
  }
}
