import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import posthog from "posthog-js";

/**
 * Analytics service wrapping PostHog for event tracking.
 * PostHog is initialized in main.ts before Angular bootstrap.
 * This service provides a typed wrapper for PostHog calls.
 */
@Injectable({
  providedIn: "root",
})
export class AnalyticsService {
  private _platformId = inject(PLATFORM_ID);

  /**
   * Check if PostHog is available (only in browser, not SSR)
   */
  isAvailable(): boolean {
    return (
      isPlatformBrowser(this._platformId) && typeof posthog !== "undefined"
    );
  }

  /**
   * Track a custom event
   * @param eventName The name of the event to track
   * @param properties Optional properties to include with the event
   */
  trackEvent(eventName: string, properties?: Record<string, unknown>): void {
    if (!this.isAvailable()) {
      return;
    }
    posthog.capture(eventName, properties);
  }

  /**
   * Identify a user (call when user logs in)
   * @param userId The unique user ID
   * @param properties Optional user properties
   */
  identifyUser(userId: string, properties?: Record<string, unknown>): void {
    if (!this.isAvailable()) {
      return;
    }
    posthog.identify(userId, properties);
  }

  /**
   * Reset the user identity (call when user logs out)
   */
  resetUser(): void {
    if (!this.isAvailable()) {
      return;
    }
    posthog.reset();
  }

  /**
   * Set properties on the current user
   * @param properties User properties to set
   */
  setUserProperties(properties: Record<string, unknown>): void {
    if (!this.isAvailable()) {
      return;
    }
    posthog.people.set(properties);
  }

  /**
   * Opt out of tracking (for users who don't want to be tracked)
   */
  optOut(): void {
    if (!this.isAvailable()) {
      return;
    }
    posthog.opt_out_capturing();
  }

  /**
   * Opt back into tracking
   */
  optIn(): void {
    if (!this.isAvailable()) {
      return;
    }
    posthog.opt_in_capturing();
  }

  /**
   * Check if user has opted out
   */
  hasOptedOut(): boolean {
    if (!this.isAvailable()) {
      return true;
    }
    return posthog.has_opted_out_capturing();
  }
}
