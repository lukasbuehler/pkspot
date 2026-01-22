import { Injectable, inject } from "@angular/core";
import { Location } from "@angular/common";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export interface BackListener {
  priority: number;
  fn: () => boolean; // Return true if handled, false to propagate
}

@Injectable({
  providedIn: "root",
})
export class BackHandlingService {
  private listeners: BackListener[] = [];
  private _location = inject(Location);

  constructor() {}

  /**
   * Register a listener for the back button.
   * @param priority Higher priority listeners are called first.
   * @param fn Callback function. Return `true` if you handled the event and want to stop propagation. Return `false` to let the next listener handle it.
   */
  addListener(priority: number, fn: () => boolean) {
    this.listeners.push({ priority, fn });
    this.listeners.sort((a, b) => b.priority - a.priority);
  }

  removeListener(fn: () => boolean) {
    this.listeners = this.listeners.filter((l) => l.fn !== fn);
  }

  handleBack() {
    let handled = false;

    // Try all listeners
    for (const listener of this.listeners) {
      if (listener.fn()) {
        handled = true;
        break;
      }
    }

    if (!handled) {
      this.defaultBackHandler();
    }
  }

  private defaultBackHandler() {
    // If there is history to go back to, go back
    // (Location.path() check is a simplistic way to check if we are at root, better logic might be needed for specific apps)
    // For now, if listeners didn't handle it, we assume standard navigation back.
    // If we are at the root, we might want to exit the app.

    // Check if we are at a root path properties
    const path = this._location.path();
    const isRoot =
      path === "" ||
      path === "/" ||
      path === "/map" ||
      path.startsWith("/map?");

    if (isRoot) {
      if (Capacitor.isNativePlatform()) {
        App.exitApp();
      }
    } else {
      this._location.back();
    }
  }
}
