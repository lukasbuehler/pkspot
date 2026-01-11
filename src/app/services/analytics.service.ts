import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import posthog from "posthog-js";
import { ConsentService } from "./consent.service";

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
  private _consentService = inject(ConsentService);

  /**
   * Basic bot detection to avoid recording automated crawlers.
   * Keeps presumptive bot events out of analytics when possible.
   */
  private isLikelyBot(): boolean {
    try {
      if (!isPlatformBrowser(this._platformId)) {
        return false;
      }
      const ua = navigator.userAgent || "";
      return /bot|googlebot|crawler|spider|robot|crawling/i.test(ua);
    } catch (e) {
      return false;
    }
  }

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
    // Do not send events that are likely from crawlers/bots
    if (this.isLikelyBot()) {
      return;
    }

    // Allowlist of minimal events that may be collected before consent
    const allowlist = new Set([
      "$pageview",
      "User Authenticated",
      "Consent Granted",
      "Visitor Agreed to Terms",
    ]);

    // Respect consent for non-essential events
    try {
      const hasConsentSignal = this._consentService?.hasConsent;
      const hasConsent =
        typeof hasConsentSignal === "function" ? hasConsentSignal() : false;
      if (!hasConsent && !allowlist.has(eventName)) {
        return;
      }
    } catch (e) {
      // If consent check fails, default to safe behavior: do not send
      return;
    }

    posthog.capture(eventName, properties);
    // try {
    //   console.debug(
    //     "AnalyticsService.trackEvent -> sent",
    //     eventName,
    //     properties
    //   );
    // } catch (e) {
    //   // ignore console errors
    // }
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
    // try {
    //   console.debug("AnalyticsService.identifyUser ->", { userId, properties });
    // } catch (e) {}
    posthog.identify(userId, properties);

    // Mark subsequent events/pageviews as authenticated for PostHog
    try {
      // super-properties that are sent with autocaptured events
      // try {
      //   console.debug(
      //     "AnalyticsService.identifyUser -> register authenticated:true"
      //   );
      // } catch (e) {}
      posthog.register({ authenticated: true });
      // also set person properties if person profiles are enabled
      if (posthog.people && typeof posthog.people.set === "function") {
        // try {
        //   console.debug(
        //     "AnalyticsService.identifyUser -> people.set authenticated:true"
        //   );
        // } catch (e) {}
        posthog.people.set({ authenticated: true });
      }
    } catch (e) {
      // swallow errors to avoid breaking app behavior
      console.error(
        "AnalyticsService: failed to register authenticated flag",
        e
      );
    }
  }

  /**
   * Reset the user identity (call when user logs out)
   */
  resetUser(): void {
    if (!this.isAvailable()) {
      return;
    }
    // try {
    //   console.debug("AnalyticsService.resetUser -> reset");
    // } catch (e) {}
    posthog.reset();

    // Make sure future events are marked unauthenticated
    try {
      // try {
      //   console.debug(
      //     "AnalyticsService.resetUser -> register authenticated:false"
      //   );
      // } catch (e) {}
      posthog.register({ authenticated: false });
      if (posthog.people && typeof posthog.people.set === "function") {
        // try {
        //   console.debug(
        //     "AnalyticsService.resetUser -> people.set authenticated:false"
        //   );
        // } catch (e) {}
        posthog.people.set({ authenticated: false });
      }
    } catch (e) {
      console.error("AnalyticsService: failed to clear authenticated flag", e);
    }
  }

  /**
   * Set consent-related properties on the person and as super-properties
   * @param consentGranted whether the user granted consent
   * @param acceptedVersion optional accepted terms version
   */
  setConsentProperties(
    consentGranted: boolean,
    acceptedVersion?: string
  ): void {
    if (!this.isAvailable()) return;
    try {
      // try {
      //   console.debug("AnalyticsService.setConsentProperties ->", {
      //     consentGranted,
      //     acceptedVersion,
      //   });
      // } catch (e) {}
      posthog.register({
        consent_granted: consentGranted,
        accepted_version: acceptedVersion ?? null,
      });
      if (posthog.people && typeof posthog.people.set === "function") {
        const props: Record<string, unknown> = {
          consent_granted: consentGranted,
        };
        if (acceptedVersion) props["accepted_version"] = acceptedVersion;
        // try {
        //   console.debug(
        //     "AnalyticsService.setConsentProperties -> people.set",
        //     props
        //   );
        // } catch (e) {}
        posthog.people.set(props);
      }
    } catch (e) {
      console.error("AnalyticsService: failed to set consent properties", e);
    }
  }

  /**
   * Set properties on the current user
   * @param properties User properties to set
   */
  setUserProperties(properties: Record<string, unknown>): void {
    if (!this.isAvailable()) {
      return;
    }
    try {
      console.debug("AnalyticsService.setUserProperties ->", properties);
    } catch (e) {}
    posthog.people.set(properties);
  }

  /**
   * Opt out of tracking (for users who don't want to be tracked)
   */
  optOut(): void {
    if (!this.isAvailable()) {
      return;
    }
    // try {
    //   console.debug("AnalyticsService.optOut -> opt_out_capturing");
    // } catch (e) {}
    posthog.opt_out_capturing();
  }

  /**
   * Opt back into tracking
   */
  optIn(): void {
    if (!this.isAvailable()) {
      return;
    }
    // try {
    //   console.debug("AnalyticsService.optIn -> opt_in_capturing");
    // } catch (e) {}
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
