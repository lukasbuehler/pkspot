import { Injectable } from "@angular/core";
import { Capacitor } from "@capacitor/core";
import { APP_LINKS } from "../shared/app-links";

/**
 * Service to detect the current platform and provide platform-specific behaviors.
 * Used to determine when to use alternative APIs (e.g., REST vs SDK) for mobile compatibility.
 */
@Injectable({
  providedIn: "root",
})
export class PlatformService {
  /**
   * Returns true if running on a native iOS or Android platform via Capacitor.
   * Returns false for web browser.
   */
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Returns true if running in a browser (not native).
   */
  isWeb(): boolean {
    return !this.isNative();
  }

  /**
   * Returns the current platform: 'ios', 'android', or 'web'.
   */
  getPlatform(): "ios" | "android" | "web" {
    return Capacitor.getPlatform() as "ios" | "android" | "web";
  }

  /**
   * Returns true if running as a Progressive Web App (installed/standalone mode).
   */
  isPwa(): boolean {
    if (typeof window === "undefined") return false;

    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true || // Safari iOS
      document.referrer.includes("android-app://") // TWA on Android
    );
  }

  /**
   * Returns the app type: 'ios', 'android', 'pwa', or 'web'.
   * This is a more granular classification than getPlatform().
   */
  getAppType(): "ios" | "android" | "pwa" | "web" {
    const platform = this.getPlatform();
    if (platform === "ios" || platform === "android") {
      return platform;
    }
    return this.isPwa() ? "pwa" : "web";
  }

  /**
   * Returns true if the user agent indicates a mobile device that can access an app store,
   * but the app is currently running in a mobile web browser rather than as a native app.
   */
  isMobileAppStoreBrowser(): boolean {
    if (this.isNative() || typeof navigator === "undefined") {
      return false;
    }

    return /android|iphone|ipod|ipad/i.test(navigator.userAgent);
  }

  /**
   * Opens the PK Spot app page in the appropriate mobile app store (Apple App Store or Google Play)
   * based on the user's operating system.
   */
  openPKSpotinAppStore(): void {
    if (this.isNative()) {
      console.debug(
        "This is already native - no need to open the App Store. (this button should not appear here and be clickable)",
      );
      return;
    }

    if (typeof navigator === "undefined" || typeof window === "undefined") {
      return;
    }

    const userAgent = navigator.userAgent;
    const isAppleOS = /iPad|iPhone|iPod|Safari/.test(userAgent);
    const isAndroidOS = /Android/.test(userAgent);

    if (isAppleOS) {
      window.open(APP_LINKS.appleAppStoreUrl, "_blank");
    } else if (isAndroidOS) {
      window.open(APP_LINKS.googlePlayStoreUrl, "_blank");
    }
  }
}
