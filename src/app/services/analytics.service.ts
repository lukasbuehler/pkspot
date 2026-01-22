import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { Router, NavigationEnd } from "@angular/router";
import posthog from "posthog-js";
import { ConsentService } from "./consent.service";
import { environment } from "../../environments/environment";
import { Capacitor } from "@capacitor/core";
import { Posthog as CapacitorPostHog } from "@capawesome/capacitor-posthog";
import { filter } from "rxjs/operators";

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
  private router = inject(Router);
  private _initialized = false;

  constructor() {
    // no-op
  }

  /**
   * Initialize PostHog analytics
   */
  async init(): Promise<void> {
    if (this._initialized) {
      console.log("[AnalyticsDebug] Already initialized");
      return;
    }

    // Check for localhost/dev environment safeguard
    if (this.isLocalhost() && !environment.production) {
      console.log(
        "[AnalyticsDebug] Skipping initialization for localhost/dev environment (Safeguard Active)"
      );
      return;
    }

    const { apiKey, host } = environment.keys.posthog;
    console.log(
      `[AnalyticsDebug] Initializing with Host: ${host}, Key: ${
        apiKey ? apiKey.substring(0, 4) + "***" : "MISSING"
      }`
    );

    if (!apiKey || !host) {
      console.warn("[AnalyticsDebug] PostHog configuration missing");
      return;
    }

    try {
      if (this.isNative()) {
        await this.initNative(apiKey, host);
      } else {
        this.initWeb(apiKey, host);
      }
      this._initialized = true;
      this.registerSuperProperties();
    } catch (e) {
      console.error("[Analytics] Initialization failed", e);
    }
  }

  /**
   * Track a screen view (Native only essentially, as Web tracks pageviews automatically)
   */
  trackScreen(screenName: string, properties?: Record<string, unknown>): void {
    if (!this.isAvailable()) return;

    if (this.isNative()) {
      // Prepend base URL for consistent reporting in PostHog
      const baseUrl = environment.baseUrl || "https://pkspot.app";
      const fullUrl = `${baseUrl}${
        screenName.startsWith("/") ? "" : "/"
      }${screenName}`;
      CapacitorPostHog.screen({
        screenTitle: fullUrl,
        properties: properties,
      });

      // Register current URL/Screen as super properties so they are attached to all subsequent events (like trackEvent)
      this.registerNativeSuperProperty({
        $current_url: fullUrl,
        $screen_name: fullUrl,
      });
    } else {
      // Web usually handles this via $pageview, but we could force a capture if needed.
      // For now, rely on default $pageview from posthog-js which is usually automatic or manual.
      // If automatic capture is disabled, we might want to manually capture $pageview here.
    }
  }

  /**
   * Check if running on localhost
   */
  private isLocalhost(): boolean {
    if (!isPlatformBrowser(this._platformId)) {
      return false;
    }
    return (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "[::1]" ||
      window.location.hostname.includes("192.168.") // common local ip
    );
  }

  /**
   * Initialize Native PostHog (Capacitor)
   */
  private async initNative(apiKey: string, host: string): Promise<void> {
    await CapacitorPostHog.setup({
      apiKey,
      host,
    });

    // Auto-track screen views for Native
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.trackScreen(event.urlAfterRedirects);
      });
  }

  /**
   * Initialize Web PostHog (posthog-js)
   */
  private initWeb(apiKey: string, host: string): void {
    if (!isPlatformBrowser(this._platformId)) {
      return;
    }

    posthog.init(apiKey, {
      api_host: host,
      person_profiles: "identified_only",
      defaults: "2025-11-30",
      respect_dnt: true,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      persistence: "localStorage",
      debug: false,
      before_send: (event) => {
        // filter out likely boits
        if (this.isLikelyBot()) {
          if (event && event.event) {
            console.log(
              "AnalyticsService: filtering out likely bot event",
              event.event
            );
          }
          return null;
        }
        return event;
      },
    });
  }

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
   * Check if PostHog is available (only in browser/native, not SSR)
   */
  isAvailable(): boolean {
    if (!this._initialized) return false;
    if (this.isNative()) return true;
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
      "$autocapture",
      "Consent Granted",
      "Consent Denied",
      "Alain Mode Changed",
    ]);

    const hasConsent = this._consentService.hasConsent();

    // If no consent & not calling allowlisted event => skip
    if (!hasConsent && !allowlist.has(eventName)) {
      return;
    }

    if (this.isNative()) {
      CapacitorPostHog.capture({
        event: eventName,
        properties: properties,
      });
    } else {
      posthog.capture(eventName, properties);
    }
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

    if (this.isNative()) {
      CapacitorPostHog.identify({
        distinctId: userId,
        userProperties: properties,
      });
      // Register authenticated super property
      this.registerNativeSuperProperty({ authenticated: true });
    } else {
      posthog.identify(userId, properties);
      // Mark subsequent events/pageviews as authenticated for PostHog
      try {
        posthog.register({ authenticated: true });
        // also set person properties if person profiles are enabled
        if (posthog.people && typeof posthog.people.set === "function") {
          posthog.people.set({ authenticated: true });
        }
      } catch (e) {
        console.error(
          "AnalyticsService: failed to register authenticated flag",
          e
        );
      }
    }
  }

  /**
   * Reset the user identity (call when user logs out)
   */
  resetUser(): void {
    if (!this.isAvailable()) {
      return;
    }

    if (this.isNative()) {
      CapacitorPostHog.reset();
      this.registerNativeSuperProperty({ authenticated: false });
    } else {
      posthog.reset();

      // Make sure future events are marked unauthenticated
      try {
        posthog.register({ authenticated: false });
        if (posthog.people && typeof posthog.people.set === "function") {
          posthog.people.set({ authenticated: false });
        }
      } catch (e) {
        console.error(
          "AnalyticsService: failed to clear authenticated flag",
          e
        );
      }
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

    const props: Record<string, unknown> = {
      consent_granted: consentGranted,
      accepted_version: acceptedVersion ?? null,
    };

    if (this.isNative()) {
      this.registerNativeSuperProperty({
        consent_granted: consentGranted,
        accepted_version: acceptedVersion ?? null,
      });
      // Note: @capawesome/capacitor-posthog doesn't have a direct people.set currently exposed easily
      // but we can assume identify or alias might be sufficient or we rely on super properties.
      // Actually `set` is available in latest versions, let's check or stick to capture.
      // We will skip people.set for native unless strictly required, focusing on super props.
    } else {
      try {
        posthog.register(props);
        if (posthog.people && typeof posthog.people.set === "function") {
          const personProps: Record<string, unknown> = {
            consent_granted: consentGranted,
          };
          if (acceptedVersion)
            personProps["accepted_version"] = acceptedVersion;
          posthog.people.set(personProps);
        }
      } catch (e) {
        console.error("AnalyticsService: failed to set consent properties", e);
      }
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
    if (this.isNative()) {
      // NOTE: Wrapper might not expose people.set directly
      // fallback to capture $set if needed, but for now just logging as not fully supported without identify
      console.warn("setUserProperties not fully implemented for Native");
    } else {
      posthog.people.set(properties);
    }
  }

  /**
   * Opt out of tracking (for users who don't want to be tracked)
   */
  optOut(): void {
    if (!this.isAvailable()) {
      return;
    }
    // Only web supports synchronous opt-out easily via posthog-js
    // For native, we can just stop sending events if we check this flag manually or rely on proper init
    if (this.isNative()) {
      CapacitorPostHog.optOut();
    } else {
      posthog.opt_out_capturing();
    }
  }

  /**
   * Opt back into tracking
   */
  optIn(): void {
    if (!this.isAvailable()) {
      return;
    }
    if (this.isNative()) {
      CapacitorPostHog.optIn();
    } else {
      posthog.opt_in_capturing();
    }
  }

  /**
   * Check if user has opted out
   */
  hasOptedOut(): boolean {
    if (!this.isAvailable()) {
      return true;
    }
    if (this.isNative()) {
      return false; // Native SDK manages this internally usually, assuming opted in if initialized
    }
    return posthog.has_opted_out_capturing();
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  private async registerSuperProperties(): Promise<void> {
    try {
      const accepted =
        typeof window !== "undefined" &&
        !!localStorage.getItem("acceptedVersion");

      const platform = Capacitor.getPlatform();
      const isNative = Capacitor.isNativePlatform();

      let isPwa = false;
      if (!isNative && typeof window !== "undefined") {
        isPwa =
          window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as any).standalone === true ||
          document.referrer.includes("android-app://");
      }

      const appType = isNative ? platform : isPwa ? "pwa" : "web";

      const props = {
        authenticated: false,
        consent_granted: accepted,
        platform: platform,
        is_native: isNative,
        is_pwa: isPwa,
        app_type: appType,
      };

      if (this.isNative()) {
        await this.registerNativeSuperProperty(props);
      } else {
        posthog.register(props);
      }
    } catch (e) {
      // ignore
    }
  }

  private async registerNativeSuperProperty(
    props: Record<string, unknown>
  ): Promise<void> {
    try {
      const promises = Object.entries(props).map(([key, value]) =>
        CapacitorPostHog.register({
          key: key,
          value: value,
        })
      );
      await Promise.all(promises);
    } catch (error) {
      console.warn("Failed to register native super properties", error);
    }
  }

  private processEventBeforeSend(event: any): any {
    if (!event) return event;

    // Drop events from obvious bots/crawlers
    try {
      if (typeof navigator !== "undefined") {
        const ua = navigator.userAgent || "";
        if (/bot|googlebot|crawler|spider|robot|crawling/i.test(ua)) {
          return null;
        }
      }
    } catch (e) {
      // ignore
    }

    // Remove locale prefix from pathname
    if (event.properties && event.properties["$pathname"]) {
      event.properties["$pathname"] = event.properties["$pathname"].replace(
        /^\/(en|de|de-CH|fr|it|es|nl)(\/|$)/,
        "/"
      );
    }
    if (event.properties && event.properties["$current_url"]) {
      event.properties["$current_url"] = event.properties[
        "$current_url"
      ].replace(/^(https?:\/\/[^/]+)\/(en|de|de-CH|fr|it|es|nl)(\/|$)/, "$1/");
    }
    return event;
  }
}
