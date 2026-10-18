import { Injectable, inject, Injector } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { Capacitor } from "@capacitor/core";
import { APP_LINKS } from "../shared/app-links";
import { AppStoreDialogComponent } from "../components/app-store-dialog/app-store-dialog.component";

/**
 * Service to detect the current platform and provide platform-specific behaviors.
 * Used to determine when to use alternative APIs (e.g., REST vs SDK) for mobile compatibility.
 */
@Injectable({
  providedIn: "root",
})
export class PlatformService {
  private readonly injector = inject(Injector);
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
    const platform = Capacitor.getPlatform();
    return platform === "ios" || platform === "android" ? platform : "web";
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

    // Android WebViews (including Instagram) also contain "Safari". Only use
    // OS identifiers; iPadOS can identify as a touch-capable Macintosh.
    const userAgent = navigator.userAgent;
    const isAndroidOS = /Android/i.test(userAgent);
    const isAppleOS = /iPad|iPhone|iPod/i.test(userAgent) ||
      (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);

    if (isAndroidOS) {
      window.open(APP_LINKS.googlePlayStoreUrl, "_blank", "noopener,noreferrer");
    } else if (isAppleOS) {
      window.open(APP_LINKS.appleAppStoreUrl, "_blank", "noopener,noreferrer");
    } else {
      // Resolve the overlay only when needed, keeping platform detection usable
      // by low-level services without initializing dialog dependencies.
      const dialog = this.injector.get(MatDialog);
      if (!dialog.getDialogById("app-store-choice")) {
        dialog.open(AppStoreDialogComponent, {
          id: "app-store-choice",
          width: "420px",
        });
      }
    }
  }
}
