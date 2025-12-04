/// <reference types="@angular/localize" />

import { enableProdMode } from "@angular/core";

import { appConfig } from "./app/app.config";
import { environment } from "./environments/environment";
import { AppComponent } from "./app/app.component";

import { bootstrapApplication } from "@angular/platform-browser";
import posthog from "posthog-js";

// Initialize PostHog analytics early (before Angular bootstrap)
const { apiKey, host } = environment.keys.posthog;
if (apiKey && host) {
  posthog.init(apiKey, {
    api_host: host,
    person_profiles: "identified_only",
    defaults: "2025-11-30",
    // Disable DNT respect for testing - you can re-enable later
    respect_dnt: true,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    persistence: "localStorage",
    // Enable debug mode in development
    debug: !environment.production,
    // Strip locale prefix from URLs for cleaner analytics grouping
    sanitize_properties: (properties, _event) => {
      // Remove locale prefix from pathname (e.g., /en/map → /map)
      if (properties["$pathname"]) {
        properties["$pathname"] = properties["$pathname"].replace(
          /^\/(en|de|de-CH|fr|it|es|nl)(\/|$)/,
          "/"
        );
      }
      // Also clean the current_url if present
      if (properties["$current_url"]) {
        properties["$current_url"] = properties["$current_url"].replace(
          /^(https?:\/\/[^/]+)\/(en|de|de-CH|fr|it|es|nl)(\/|$)/,
          "$1/"
        );
      }
      return properties;
    },
  });
}

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err)
);
