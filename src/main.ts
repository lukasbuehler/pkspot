/// <reference types="@angular/localize" />

import { enableProdMode } from "@angular/core";

import { appConfig } from "./app/app.config";
import { environment } from "./environments/environment";
import { AppComponent } from "./app/app.component";

import { bootstrapApplication } from "@angular/platform-browser";
import posthog from "posthog-js";
import { Capacitor } from "@capacitor/core";

// Initialize PostHog analytics early (before Angular bootstrap)
const { apiKey, host } = environment.keys.posthog;
if (apiKey && host) {
  posthog.init(apiKey, {
    api_host: host,
    person_profiles: "identified_only",
    defaults: "2025-11-30",
    // Disable DNT respect for testing - you can re-enable later
    respect_dnt: true,
    // Disable PostHog automatic pageview capture — we'll send manual pageviews
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: "localStorage",
    // Disable debug mode to suppress PostHog console logs
    debug: false,
    // Strip locale prefix from URLs for cleaner analytics grouping
    before_send: (event) => {
      // Handle null event case
      if (!event) {
        return event;
      }
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
      // Remove locale prefix from pathname (e.g., /en/map → /map)
      if (event.properties && event.properties["$pathname"]) {
        event.properties["$pathname"] = event.properties["$pathname"].replace(
          /^\/(en|de|de-CH|fr|it|es|nl)(\/|$)/,
          "/"
        );
      }
      // Also clean the current_url if present
      if (event.properties && event.properties["$current_url"]) {
        event.properties["$current_url"] = event.properties[
          "$current_url"
        ].replace(
          /^(https?:\/\/[^/]+)\/(en|de|de-CH|fr|it|es|nl)(\/|$)/,
          "$1/"
        );
      }
      return event;
    },
  });

  // Register initial super-properties so all events include them
  try {
    const accepted =
      typeof window !== "undefined" &&
      !!localStorage.getItem("acceptedVersion");

    // Detect platform for analytics segmentation (iOS, Android, PWA, web)
    const platform = Capacitor.getPlatform(); // 'ios', 'android', or 'web'
    const isNative = Capacitor.isNativePlatform();

    // Detect PWA for web platform
    let isPwa = false;
    if (!isNative && typeof window !== "undefined") {
      isPwa =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes("android-app://");
    }

    // Determine app_type: 'ios', 'android', 'pwa', or 'web'
    const appType = isNative ? platform : isPwa ? "pwa" : "web";

    posthog.register({
      authenticated: false,
      consent_granted: accepted,
      platform: platform,
      is_native: isNative,
      is_pwa: isPwa,
      app_type: appType,
    });
  } catch (e) {
    // ignore
  }
}

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err)
);
