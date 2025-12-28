import { Injectable } from "@angular/core";
import { Capacitor } from "@capacitor/core";

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
}
