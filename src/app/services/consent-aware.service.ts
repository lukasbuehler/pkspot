import {
  Injectable,
  Injector,
  inject,
  runInInjectionContext,
} from "@angular/core";
import { ConsentService } from "./consent.service";
import { AnalyticsService } from "./analytics.service";

@Injectable()
export abstract class ConsentAwareService {
  protected _consentService = inject(ConsentService);
  protected _analyticsService = inject(AnalyticsService);
  protected injector = inject(Injector);

  constructor() {}

  /**
   * Track an event only if consent has been granted
   * @param eventName The name of the event to track
   * @param properties Optional properties to include with the event
   */
  protected trackEventWithConsent(
    eventName: string,
    properties?: Record<string, unknown>
  ): void {
    if (this._consentService.hasConsent()) {
      this._analyticsService.trackEvent(eventName, properties);
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

  /**
   * Check if we're running in SSR (Server-Side Rendering)
   */
  protected isSSR(): boolean {
    return this._consentService.isSSR();
  }

  /**
   * Check if we're running in the browser
   */
  protected isBrowser(): boolean {
    return this._consentService.isBrowser();
  }
}
