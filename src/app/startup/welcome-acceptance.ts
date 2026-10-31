import { InjectionToken } from "@angular/core";

/** The early view owns the dialog while the hydrated app owns consent/analytics. */
export interface EarlyWelcomeContext {
  ready(accept: () => void): void;
}
export const EARLY_WELCOME_CONTEXT = new InjectionToken<EarlyWelcomeContext>("Early welcome context");
