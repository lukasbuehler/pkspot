import { Injectable, inject } from "@angular/core";
import { ConsentService } from "./consent.service";
import { PlausibleService } from "./plausible.service";

@Injectable()
export abstract class ConsentAwareService {
  protected _consentService = inject(ConsentService);
  protected _plausibleService = inject(PlausibleService);

  constructor() {}

  /**
   * Track an event only if consent has been granted
   * @param eventName The name of the event to track
   * @param options Optional properties to include with the event
   */
  protected trackEventWithConsent(eventName: string, options?: { props: any }): void {
    if (this._consentService.hasConsent()) {
      this._plausibleService.trackEvent(eventName, options);
    }
  }

  /**
   * Execute a function only if consent has been granted
   * Useful for operations that send data to external services
   * @param fn Function to execute
   * @returns Promise that resolves with the function result or rejects if no consent
   */
  protected executeWithConsent<T>(fn: () => T | Promise<T>): Promise<T> {
    return this._consentService.executeWithConsent(fn);
  }

  /**
   * Execute a function when consent is granted (waits if necessary)
   * @param fn Function to execute
   * @returns Promise that resolves with the function result
   */
  protected executeWhenConsent<T>(fn: () => T | Promise<T>): Promise<T> {
    return this._consentService.executeWhenConsent(fn);
  }

  /**
   * Check if consent has been granted
   */
  protected hasConsent(): boolean {
    return this._consentService.hasConsent();
  }
}
