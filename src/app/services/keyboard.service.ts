import { Injectable, NgZone, inject, signal } from "@angular/core";
import { Capacitor } from "@capacitor/core";

/**
 * Tracks the visible keyboard height in pixels and exposes it as a signal.
 *
 * On native (iOS/Android) we listen to the Capacitor Keyboard plugin events.
 * On web we observe `visualViewport` size changes to detect the soft keyboard.
 *
 * The service also mirrors the height into a `--keyboard-offset` CSS custom
 * property on `<html>` so plain CSS can react (e.g. bottom-fixed UI).
 * It adds a `keyboard-open` class on `<html>` while the keyboard is visible.
 */
@Injectable({ providedIn: "root" })
export class KeyboardService {
  private _zone = inject(NgZone);

  readonly keyboardHeight = signal(0);

  private _initialized = false;

  init(): void {
    if (this._initialized) return;
    this._initialized = true;

    if (typeof window === "undefined") return;

    if (Capacitor.isNativePlatform()) {
      this.initNative();
    } else {
      this.initWeb();
    }
  }

  private async initNative() {
    const { Keyboard } = await import("@capacitor/keyboard");

    Keyboard.addListener("keyboardWillShow", (info) => {
      this._zone.run(() => this.setHeight(info.keyboardHeight));
    });
    Keyboard.addListener("keyboardDidShow", (info) => {
      this._zone.run(() => this.setHeight(info.keyboardHeight));
    });
    Keyboard.addListener("keyboardWillHide", () => {
      this._zone.run(() => this.setHeight(0));
    });
    Keyboard.addListener("keyboardDidHide", () => {
      this._zone.run(() => this.setHeight(0));
    });
  }

  private initWeb() {
    const vv = window.visualViewport;
    if (!vv) return;

    let baseHeight = window.innerHeight;
    let resizeRaf = 0;

    const update = () => {
      // Estimate keyboard height as the gap between layout viewport and visual viewport.
      // visualViewport.height shrinks when a soft keyboard appears on mobile browsers.
      const gap = Math.max(0, baseHeight - vv.height - vv.offsetTop);
      // Ignore tiny gaps (URL bar collapses, address bar transitions, etc.).
      const height = gap > 80 ? Math.round(gap) : 0;
      this.setHeight(height);
    };

    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(update);
    };

    // Recapture base height on orientation changes — innerHeight is the
    // stable reference for "viewport without keyboard".
    window.addEventListener("orientationchange", () => {
      // Wait a tick for the layout to settle before re-baselining.
      setTimeout(() => {
        baseHeight = window.innerHeight;
        update();
      }, 250);
    });

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
  }

  private setHeight(height: number) {
    const clamped = Math.max(0, Math.round(height));
    if (clamped === this.keyboardHeight()) return;

    // Apply the CSS var and class FIRST so that any effect/observer reacting
    // to keyboardHeight() sees a DOM that already reflects the new height.
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(
        "--keyboard-offset",
        `${clamped}px`
      );
      document.documentElement.classList.toggle("keyboard-open", clamped > 0);
    }

    this.keyboardHeight.set(clamped);

    // Nudge Angular CDK's ViewportRuler so anchored overlays (mat-select
    // dropdowns, mat-menus) re-measure and reposition above the keyboard.
    // The ruler listens to window resize events; a synthetic one is enough.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("resize"));
    }
  }
}
