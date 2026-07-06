import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { Router, NavigationEnd } from "@angular/router";
import type { CaptureResult, Properties } from "posthog-js";
import { ConsentService } from "./consent.service";
import { environment } from "../../environments/environment.default";
import { Capacitor } from "@capacitor/core";
import { Posthog as CapacitorPostHog } from "@capawesome/capacitor-posthog";
import { filter } from "rxjs/operators";
import { version } from "../../../package.json";

/**
 * Analytics service wrapping PostHog for event tracking.
 * PostHog is initialized in main.ts before Angular bootstrap.
 * This service provides a typed wrapper for PostHog calls.
 */

export type ErrorSeverity = "fatal" | "error" | "warning" | "info";

export interface ErrorReportOptions {
  context: string;
  feature?: string;
  action?: string;
  severity?: ErrorSeverity;
  handled?: boolean;
  userFacing?: boolean;
  properties?: Record<string, unknown>;
}

export interface AnalyticsContext {
  posthog_distinct_id?: string;
  posthog_session_id?: string;
  posthog_session_replay_url?: string;
}

export type ContactChannel = "contact_form" | "discord" | "instagram";

interface PendingUserIdentity {
  userId: string;
  properties?: Record<string, unknown>;
}

export function stripUtmParametersFromUrl(url: string): string {
  const parsedUrl = new URL(url, "https://pkspot.app");

  for (const key of [...parsedUrl.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) {
      parsedUrl.searchParams.delete(key);
    }
  }

  return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
}

@Injectable({
  providedIn: "root",
})
export class AnalyticsService {
  private _platformId = inject(PLATFORM_ID);
  private _consentService = inject(ConsentService);
  private router = inject(Router);
  private _initialized = false;
  private _posthog: typeof import("posthog-js").default | null = null;
  private readonly _nativeSuperProperties = new Map<string, unknown>();
  private _lastNativeScreenUrl: string | null = null;
  private readonly appVersion = version;
  private readonly distinctIdStorageKey = "ph_distinct_id_v1";
  private readonly initialReferrerStorageKey = "ph_initial_referrer_v1";
  private readonly initialReferringDomainStorageKey =
    "ph_initial_referring_domain_v1";
  private readonly stickerScanSessionPrefix = "ph_sticker_scan_sent_v1:";
  private _pendingUserIdentity: PendingUserIdentity | null = null;
  private _pendingUserProperties: Record<string, unknown> | null = null;
  private _identifiedUserId: string | null = null;
  readonly utmSource = "pkspot";

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
        "[AnalyticsDebug] Skipping initialization for localhost/dev environment (Safeguard Active)",
      );
      return;
    }

    const { apiKey, host } = environment.keys.posthog;
    console.log(
      `[AnalyticsDebug] Initializing with Host: ${host}, Key: ${
        apiKey ? apiKey.substring(0, 4) + "***" : "MISSING"
      }`,
    );

    if (!apiKey || !host) {
      console.warn("[AnalyticsDebug] PostHog configuration missing");
      return;
    }

    try {
      if (this.isNative()) {
        await this.initNative(apiKey, host);
      } else {
        await this.initWeb(apiKey, host);
      }
      this._initialized = true;
      await this.registerSuperProperties();
      this.flushPendingUserIdentity();
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
      const fullUrl = this.getFullUrlFromScreenName(screenName);
      if (this._lastNativeScreenUrl === fullUrl) {
        return;
      }
      this._lastNativeScreenUrl = fullUrl;
      const pathname = this.getPathnameFromScreenName(screenName);

      const normalizedProperties = {
        ...(properties ?? {}),
        ...this.getPlatformProperties(),
        ...this.getAppVersionProperties(),
        $current_url: fullUrl,
        $pathname: pathname,
        current_url: fullUrl,
        path: pathname,
        source: "native_router",
      };
      console.log("[AnalyticsDebug] Native route analytics queued", {
        screenTitle: fullUrl,
        path: pathname,
        events: ["$screen", "$pageview"],
        requiredProps: this.getNativeAnalyticsRequiredPropertySummary(
          normalizedProperties,
        ),
      });
      this.sendNativeScreen(fullUrl, normalizedProperties);
      this.sendNativeCapture("$pageview", normalizedProperties);

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
    console.log("[AnalyticsDebug] Native PostHog setup starting", {
      apiHost: host,
      platform: Capacitor.getPlatform(),
    });

    await CapacitorPostHog.setup({
      apiKey,
      apiHost: host,
      captureApplicationLifecycleEvents: false,
      enableSessionReplay: false,
    });

    console.log("[AnalyticsDebug] Native PostHog setup completed", {
      apiHost: host,
      platform: Capacitor.getPlatform(),
    });

    // Register native platform globals immediately after setup so they are present on all $screen events.
    await this.registerNativeSuperProperty({
      ...this.getPlatformProperties(),
      ...this.getAppVersionProperties(),
    });

    // Auto-track screen views for Native (router-driven)
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.trackScreen(event.urlAfterRedirects);
      });

    this.trackScreen(this.router.url);
  }

  /**
   * Initialize Web PostHog (posthog-js)
   */
  private async initWeb(apiKey: string, host: string): Promise<void> {
    if (!isPlatformBrowser(this._platformId)) {
      return;
    }

    const { default: posthog } = await import("posthog-js");
    this._posthog = posthog;

    // Check for Do Not Track
    const dnt =
      navigator.doNotTrack === "true" ||
      navigator.doNotTrack === "1" ||
      navigator.doNotTrack === "yes";

    // 1. Attempt to load persisted distinct_id
    let bootstrapConfig: {
      bootstrap?: { distinctID: string; isIdentifiedID: boolean };
    } = {};
    const persistedId = localStorage.getItem(this.distinctIdStorageKey);
    if (persistedId) {
      console.log(
        `[AnalyticsDebug] Bootstrapping with persisted ID: ${persistedId}`,
      );
      bootstrapConfig = {
        bootstrap: {
          distinctID: persistedId,
          isIdentifiedID: false,
        },
      };
    }

    const initialAttributionProps = this.getInitialAttributionProperties();

    posthog.init(apiKey, {
      api_host: host,
      person_profiles: "identified_only",
      defaults: "2025-11-30",
      respect_dnt: true, // PostHog handles this internally usually, but we can be explicit with opt_out below if needed
      opt_out_capturing_by_default: dnt, // Explicitly respect DNT for initial capture state
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_performance: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      error_tracking: {
        captureExtensionExceptions: false,
      },
      capture_exceptions: false,
      persistence: "localStorage",
      debug: false,
      ...bootstrapConfig,
      loaded: (ph) => {
        // 2. Persist the distinct_id for future sessions
        const currentId = ph.get_distinct_id();
        if (currentId) {
          localStorage.setItem(this.distinctIdStorageKey, currentId);
        }
        if (Object.keys(initialAttributionProps).length > 0) {
          ph.register(initialAttributionProps);
        }
      },
      before_send: (event) => this.processEventBeforeSend(event),
    });

    if (Object.keys(initialAttributionProps).length > 0) {
      posthog.register(initialAttributionProps);
    }
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
    return isPlatformBrowser(this._platformId) && this._posthog !== null;
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
      "sticker_scanned",
    ]);

    const hasConsent = this._consentService.hasConsent();

    // If no consent & not calling allowlisted event => skip
    if (!hasConsent && !allowlist.has(eventName)) {
      return;
    }

    const normalizedProperties = this.normalizeEventProperties(
      eventName,
      properties,
    );

    if (this.isNative()) {
      this.sendNativeCapture(eventName, normalizedProperties);
    } else {
      this._posthog?.capture(eventName, normalizedProperties);
    }
  }

  trackOutboundLinkClick(
    surface: string,
    linkType: string,
    url: string | null | undefined,
    ctaLabel?: string,
    properties?: Record<string, unknown>,
  ): void {
    this.trackEvent("outbound_link_clicked", {
      ...(properties ?? {}),
      surface,
      link_type: linkType,
      cta_label: ctaLabel ?? null,
      destination_domain: this.getDestinationDomain(url),
      url: this.safeAnalyticsUrl(url),
    });
  }

  trackContactChannelClick(
    channel: ContactChannel,
    surface: string,
    properties?: Record<string, unknown>,
  ): void {
    this.trackEvent("contact_channel_clicked", {
      ...(properties ?? {}),
      channel,
      surface,
    });
  }

  reportError(error: unknown, options: ErrorReportOptions): void {
    if (!this.isAvailable() || this.isLikelyBot()) {
      return;
    }

    const properties = this.normalizeErrorReportProperties(error, options);

    try {
      if (this.isNative()) {
        this.sendNativeCapture("$exception", properties);

        if (options.userFacing) {
          this.sendNativeCapture("User Encountered Error", properties);
        }
      } else {
        this._posthog?.captureException(error, properties);

        if (options.userFacing) {
          this._posthog?.capture("User Encountered Error", properties);
        }
      }
    } catch (reportingError) {
      console.warn("AnalyticsService: failed to report error", reportingError);
    }
  }

  /**
   * Identify a user (call when user logs in)
   * @param userId The unique user ID
   * @param properties Optional user properties
   */
  identifyUser(userId: string, properties?: Record<string, unknown>): void {
    if (!this.isAvailable()) {
      this.queueUserIdentity(userId, properties);
      return;
    }

    this.applyUserIdentity(userId, properties);
  }

  private applyUserIdentity(
    userId: string,
    properties?: Record<string, unknown>,
  ): void {
    this._identifiedUserId = userId;

    if (this.isNative()) {
      void CapacitorPostHog.identify({
        distinctId: userId,
        userProperties: properties,
      }).catch((error) => {
        console.warn("AnalyticsService: failed to identify native user", error);
      });
      // Register authenticated super property
      this.registerNativeSuperProperty({ authenticated: true });
    } else {
      const posthog = this._posthog;
      if (!posthog) return;
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
          e,
        );
      }
    }
  }

  /**
   * Reset the user identity (call when user logs out)
   */
  resetUser(): void {
    if (!this.isAvailable()) {
      this._pendingUserIdentity = null;
      this._pendingUserProperties = null;
      this._identifiedUserId = null;
      return;
    }

    this._pendingUserIdentity = null;
    this._pendingUserProperties = null;
    this._identifiedUserId = null;

    if (this.isNative()) {
      void CapacitorPostHog.reset().catch((error) => {
        console.warn("AnalyticsService: failed to reset native user", error);
      });
      this.registerNativeSuperProperty({
        authenticated: false,
        ...this.getAppVersionProperties(),
      });
    } else {
      const posthog = this._posthog;
      if (!posthog) return;
      posthog.reset();

      // Make sure future events are marked unauthenticated
      try {
        posthog.register({
          authenticated: false,
          ...this.getAppVersionProperties(),
          ...this.getInitialAttributionProperties(),
        });
        if (posthog.people && typeof posthog.people.set === "function") {
          posthog.people.set({ authenticated: false });
        }
      } catch (e) {
        console.error(
          "AnalyticsService: failed to clear authenticated flag",
          e,
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
    acceptedVersion?: string,
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
        const posthog = this._posthog;
        if (!posthog) return;
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
      this.queueUserProperties(properties);
      return;
    }
    if (this.isNative()) {
      if (!this._identifiedUserId) {
        this.queueUserProperties(properties);
        return;
      }

      void CapacitorPostHog.identify({
        distinctId: this._identifiedUserId,
        userProperties: properties,
      }).catch((error) => {
        console.warn(
          "AnalyticsService: failed to set native user properties",
          error,
        );
      });
    } else {
      this._posthog?.people.set(properties);
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
      void CapacitorPostHog.optOut().catch((error) => {
        console.warn("AnalyticsService: failed to opt out native analytics", error);
      });
    } else {
      this._posthog?.opt_out_capturing();
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
      void CapacitorPostHog.optIn().catch((error) => {
        console.warn("AnalyticsService: failed to opt in native analytics", error);
      });
    } else {
      this._posthog?.opt_in_capturing();
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
    return this._posthog?.has_opted_out_capturing() ?? true;
  }

  getCurrentAnalyticsContext(): AnalyticsContext {
    if (
      !this.isAvailable() ||
      this.isNative() ||
      !this._consentService.hasConsent() ||
      this.hasOptedOut()
    ) {
      return {};
    }

    try {
      const posthog = this._posthog;
      if (!posthog) {
        return {};
      }

      const context: AnalyticsContext = {};
      const distinctId = posthog.get_distinct_id();
      const sessionId = posthog.get_session_id();
      const sessionReplayUrl = posthog.get_session_replay_url({
        withTimestamp: true,
        timestampLookBack: 30,
      });

      if (distinctId) {
        context.posthog_distinct_id = distinctId;
      }
      if (sessionId) {
        context.posthog_session_id = sessionId;
      }
      if (sessionReplayUrl) {
        context.posthog_session_replay_url = sessionReplayUrl;
      }

      return context;
    } catch (e) {
      return {};
    }
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private queueUserIdentity(
    userId: string,
    properties?: Record<string, unknown>,
  ): void {
    this._pendingUserIdentity = {
      userId,
      properties: this.mergeUserProperties(
        this._pendingUserProperties,
        properties,
      ),
    };
    this._pendingUserProperties = null;
  }

  private queueUserProperties(properties: Record<string, unknown>): void {
    if (this._pendingUserIdentity) {
      this._pendingUserIdentity = {
        ...this._pendingUserIdentity,
        properties: this.mergeUserProperties(
          this._pendingUserIdentity.properties,
          properties,
        ),
      };
      return;
    }

    this._pendingUserProperties =
      this.mergeUserProperties(this._pendingUserProperties, properties) ?? null;
  }

  private mergeUserProperties(
    existing?: Record<string, unknown> | null,
    next?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const merged = {
      ...(existing ?? {}),
      ...(next ?? {}),
    };

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private flushPendingUserIdentity(): void {
    const pendingIdentity = this._pendingUserIdentity;
    if (pendingIdentity) {
      this._pendingUserIdentity = null;
      this.applyUserIdentity(pendingIdentity.userId, pendingIdentity.properties);
      return;
    }

    if (this._pendingUserProperties) {
      const pendingProperties = this._pendingUserProperties;
      this._pendingUserProperties = null;
      this.setUserProperties(pendingProperties);
    }
  }

  private isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  private getFullUrlFromScreenName(screenName: string): string {
    if (screenName.startsWith("http://") || screenName.startsWith("https://")) {
      return screenName;
    }

    const baseUrl = environment.baseUrl || "https://pkspot.app";
    return `${baseUrl}${screenName.startsWith("/") ? "" : "/"}${screenName}`;
  }

  private getPathnameFromScreenName(screenName: string): string {
    if (screenName.startsWith("http://") || screenName.startsWith("https://")) {
      try {
        return new URL(screenName).pathname;
      } catch {
        return "/";
      }
    }

    const normalizedPath = screenName.startsWith("/")
      ? screenName
      : `/${screenName}`;

    try {
      return new URL(normalizedPath, environment.baseUrl || "https://pkspot.app")
        .pathname;
    } catch {
      return normalizedPath.split("?")[0]?.split("#")[0] || "/";
    }
  }

  private sendNativeScreen(
    screenTitle: string,
    properties?: Record<string, unknown>,
  ): void {
    const nativeProperties = this.withRequiredNativeAnalyticsProperties(
      properties,
    );

    void CapacitorPostHog.screen({
      screenTitle,
      properties: nativeProperties,
    })
      .then(() => {
        console.log("[AnalyticsDebug] Native screen accepted by plugin", {
          screenTitle,
          requiredProps:
            this.getNativeAnalyticsRequiredPropertySummary(nativeProperties),
        });
      })
      .catch((error) => {
        console.warn("AnalyticsService: failed to send native screen", error);
      });
  }

  private sendNativeCapture(
    event: string,
    properties?: Record<string, unknown>,
  ): void {
    const nativeProperties = this.withRequiredNativeAnalyticsProperties(
      properties,
    );

    void CapacitorPostHog.capture({
      event,
      properties: nativeProperties,
    })
      .then(() => {
        console.log("[AnalyticsDebug] Native event accepted by plugin", {
          event,
          path:
            nativeProperties["path"] ??
            nativeProperties["$pathname"] ??
            nativeProperties["current_url"] ??
            null,
          requiredProps:
            this.getNativeAnalyticsRequiredPropertySummary(nativeProperties),
        });
      })
      .catch((error) => {
        console.warn("AnalyticsService: failed to send native event", {
          event,
          error,
        });
      });
  }

  private withRequiredNativeAnalyticsProperties(
    properties?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...(properties ?? {}),
      ...this.getPlatformProperties(),
      ...this.getAppVersionProperties(),
    };
  }

  private getNativeAnalyticsRequiredPropertySummary(
    properties?: Record<string, unknown>,
  ): Record<string, unknown> {
    const platform = properties?.["platform"];

    return {
      app_version: properties?.["app_version"] ?? null,
      $app_version: properties?.["$app_version"] ?? null,
      platform: platform ?? null,
      app_type: properties?.["app_type"] ?? null,
      is_native: properties?.["is_native"] ?? null,
      expected_sdk_$lib:
        platform === "android"
          ? "posthog-android"
          : platform === "ios"
            ? "posthog-ios"
            : null,
    };
  }

  private getPlatformProperties(): Record<string, string | boolean> {
    const platform = Capacitor.getPlatform();
    const isNative = this.isNative();

    let isPwa = false;
    if (!isNative && typeof window !== "undefined") {
      isPwa =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes("android-app://");
    }

    return {
      platform: platform,
      is_native: isNative,
      is_pwa: isPwa,
      app_type: isNative ? platform : isPwa ? "pwa" : "web",
    };
  }

  private async registerSuperProperties(): Promise<void> {
    try {
      const accepted =
        typeof window !== "undefined" &&
        !!localStorage.getItem("acceptedVersion");

      const props = {
        authenticated: false,
        consent_granted: accepted,
        ...this.getPlatformProperties(),
        ...this.getAppVersionProperties(),
      };

      if (this.isNative()) {
        await this.registerNativeSuperProperty(props);
      } else {
        this._posthog?.register({
          ...props,
          ...this.getInitialAttributionProperties(),
        });
      }
    } catch (e) {
      // ignore
    }
  }

  private normalizeEventProperties(
    eventName: string,
    properties?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const normalized = { ...(properties ?? {}) };

    if (eventName === "Engaged Ping") {
      if (normalized["is_user_action"] === undefined) {
        normalized["is_user_action"] = false;
      }
      if (normalized["event_type"] === undefined) {
        normalized["event_type"] = "heartbeat";
      }
    }

    Object.assign(normalized, this.getAppVersionProperties());

    if (this.isNative()) {
      Object.assign(normalized, this.getPlatformProperties());
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private getAppVersionProperties(): Record<string, string> {
    return {
      client_version: this.appVersion,
      app_version: this.appVersion,
      $app_version: this.appVersion,
    };
  }

  private getDestinationDomain(url: string | null | undefined): string | null {
    if (!url) {
      return null;
    }

    try {
      return new URL(url, "https://pkspot.app").hostname || null;
    } catch {
      return null;
    }
  }

  private safeAnalyticsUrl(url: string | null | undefined): string | null {
    if (!url) {
      return null;
    }

    try {
      const parsedUrl = new URL(url, "https://pkspot.app");
      if (parsedUrl.origin === "https://pkspot.app") {
        return `${parsedUrl.pathname}${parsedUrl.hash}`;
      }
      return `${parsedUrl.origin}${parsedUrl.pathname}`;
    } catch {
      return null;
    }
  }

  private getInitialAttributionProperties(): Record<string, string> {
    if (!isPlatformBrowser(this._platformId)) {
      return {};
    }

    try {
      let initialReferrer = localStorage.getItem(
        this.initialReferrerStorageKey,
      );
      let initialReferringDomain = localStorage.getItem(
        this.initialReferringDomainStorageKey,
      );

      if (!initialReferrer || !initialReferringDomain) {
        const rawReferrer = document.referrer?.trim() ?? "";
        initialReferrer = rawReferrer.length > 0 ? rawReferrer : "$direct";
        initialReferringDomain = "$direct";

        if (rawReferrer.length > 0) {
          try {
            const parsedReferrer = new URL(rawReferrer);
            initialReferringDomain =
              parsedReferrer.hostname || initialReferringDomain;
          } catch (e) {
            // keep "$direct" fallback when referrer parsing fails
          }
        }

        localStorage.setItem(this.initialReferrerStorageKey, initialReferrer);
        localStorage.setItem(
          this.initialReferringDomainStorageKey,
          initialReferringDomain,
        );
      }

      return {
        $initial_referrer: initialReferrer,
        $initial_referring_domain: initialReferringDomain,
        initial_referrer: initialReferrer,
        initial_referring_domain: initialReferringDomain,
      };
    } catch (e) {
      return {};
    }
  }

  getCurrentAttributionProperties(): Record<string, string> {
    if (!isPlatformBrowser(this._platformId)) {
      return {};
    }

    try {
      const props: Record<string, string> = {};
      const currentUrl = new URL(window.location.href);
      const referrer = document.referrer?.trim() ?? "";

      const utmKeys = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
      ];

      for (const key of utmKeys) {
        const value = currentUrl.searchParams.get(key);
        if (value) {
          props[key] = value;
          props[`$${key}`] = value;
        }
      }

      props["$current_url"] = currentUrl.toString();
      props["$pathname"] = currentUrl.pathname;

      if (referrer.length > 0) {
        props["$referrer"] = referrer;
        props["referrer"] = referrer;

        try {
          const referrerDomain = new URL(referrer).hostname;
          props["$referring_domain"] = referrerDomain;
          props["referring_domain"] = referrerDomain;
        } catch (e) {
          // Keep the raw referrer without a parsed domain.
        }
      } else {
        props["$referrer"] = "$direct";
        props["$referring_domain"] = "$direct";
        props["referrer"] = "$direct";
        props["referring_domain"] = "$direct";
      }

      return props;
    } catch (e) {
      return {};
    }
  }

  trackStickerScanFromCurrentUrl(): void {
    const attribution = this.getCurrentAttributionProperties();

    if (
      attribution["utm_source"] !== "sticker" ||
      attribution["utm_medium"] !== "qr" ||
      attribution["utm_campaign"] !== "nice-spot-v1"
    ) {
      return;
    }

    const key = `${this.stickerScanSessionPrefix}${attribution["utm_campaign"]}`;
    try {
      if (sessionStorage.getItem(key)) {
        return;
      }
      sessionStorage.setItem(key, "1");
    } catch (e) {
      // If storage is unavailable, still capture with the pageview.
    }

    this.trackEvent("sticker_scanned", {
      ...attribution,
      source: "client",
    });
  }

  cleanCurrentUtmParametersFromUrl(): void {
    if (!isPlatformBrowser(this._platformId)) {
      return;
    }

    try {
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const cleanPath = stripUtmParametersFromUrl(window.location.href);

      if (cleanPath !== currentPath) {
        window.history.replaceState(
          window.history.state,
          document.title,
          cleanPath,
        );
      }
    } catch (e) {
      // URL cleanup is best-effort only; attribution has already been captured.
    }
  }

  private async registerNativeSuperProperty(
    props: Record<string, unknown>,
  ): Promise<void> {
    try {
      const changedProps = Object.entries(props).filter(([key, value]) => {
        if (this._nativeSuperProperties.get(key) === value) {
          return false;
        }

        return true;
      });

      const promises = changedProps.map(([key, value]) =>
        CapacitorPostHog.register({ key, value }),
      );
      await Promise.all(promises);
      for (const [key, value] of changedProps) {
        this._nativeSuperProperties.set(key, value);
      }
    } catch (error) {
      console.warn("Failed to register native super properties", error);
    }
  }

  private normalizeErrorReportProperties(
    error: unknown,
    options: ErrorReportOptions,
  ): Properties {
    const summary = this.getErrorSummary(error);
    const normalized: Properties = {
      ...this.getAppVersionProperties(),
      ...this.getPlatformProperties(),
      error_context: options.context,
      error_feature: options.feature ?? "unknown",
      error_action: options.action ?? options.context,
      error_severity: options.severity ?? "error",
      error_handled: options.handled ?? true,
      error_user_facing: options.userFacing ?? false,
      $exception_type: summary.name,
      $exception_message: summary.message,
    };

    if (summary.code) {
      normalized["error_code"] = summary.code;
    }

    for (const [key, value] of Object.entries(options.properties ?? {})) {
      const safeValue = this.toPostHogProperty(value);
      if (safeValue !== undefined) {
        normalized[key] = safeValue;
      }
    }

    return normalized;
  }

  private getErrorSummary(error: unknown): {
    name: string;
    message: string;
    code?: string;
  } {
    if (error instanceof Error) {
      return {
        name: error.name || "Error",
        message: error.message || "Unknown error",
        code: this.getErrorCode(error),
      };
    }

    if (typeof error === "object" && error !== null) {
      return {
        name: this.getObjectString(error, "name") ?? "Error",
        message:
          this.getObjectString(error, "message") ??
          this.getObjectString(error, "reason") ??
          "Unknown object error",
        code: this.getErrorCode(error),
      };
    }

    return {
      name: typeof error,
      message: String(error ?? "Unknown error"),
    };
  }

  private getErrorCode(error: object): string | undefined {
    const record = error as Record<string, unknown>;
    const code = record["code"];
    if (typeof code === "string" || typeof code === "number") {
      return String(code);
    }
    return undefined;
  }

  private getObjectString(object: object, key: string): string | undefined {
    const value = (object as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim().length > 0
      ? value
      : undefined;
  }

  private toPostHogProperty(
    value: unknown,
  ):
    | string
    | number
    | boolean
    | null
    | string[]
    | number[]
    | boolean[]
    | undefined {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      return value;
    }

    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    ) {
      return value;
    }

    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "number")
    ) {
      return value;
    }

    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "boolean")
    ) {
      return value;
    }

    return undefined;
  }

  private processEventBeforeSend(
    event: CaptureResult | null,
  ): CaptureResult | null {
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
        "/",
      );
    }
    if (event.properties && event.properties["$current_url"]) {
      event.properties["$current_url"] = event.properties[
        "$current_url"
      ].replace(/^(https?:\/\/[^/]+)\/(en|de|de-CH|fr|it|es|nl)(\/|$)/, "$1/");
    }
    return event;
  }

  /**
   * Add UTM parameters to a URL
   * @param url The URL to append parameters to
   * @param campaign Optional campaign name (default: 'referral')
   * @param medium Optional medium (default: 'referral')
   */
  public addUtmToUrl(
    url: string | null | undefined,
    campaign: string = "referral",
    medium: string = "referral",
  ): string | null {
    if (!url) return null;

    try {
      // Handle simple URLs that might not have protocol (though they should)
      let urlObj: URL;
      try {
        urlObj = new URL(url);
      } catch (e) {
        // If relative or invalid, simplify or retry with fallback base
        // But for external links, they should be absolute.
        // If it fails, just return original.
        return url;
      }

      urlObj.searchParams.set("utm_source", this.utmSource);
      if (!urlObj.searchParams.has("utm_medium")) {
        urlObj.searchParams.set("utm_medium", medium);
      }
      if (!urlObj.searchParams.has("utm_campaign")) {
        urlObj.searchParams.set("utm_campaign", campaign);
      }

      return urlObj.toString();
    } catch (e) {
      console.warn("Failed to add UTM params to URL", url, e);
      return url;
    }
  }
}
