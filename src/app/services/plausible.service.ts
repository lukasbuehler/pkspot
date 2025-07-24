import { Injectable } from '@angular/core';

declare global {
  interface Window {
    plausible?: (eventName: string, options?: { props: any }) => void;
  }
}

@Injectable({
  providedIn: 'root'
})
export class PlausibleService {
  
  constructor() {
    // Plausible is privacy-friendly and loads immediately
    // It's already loaded in index.html and available globally
  }

  /**
   * Track an event with Plausible analytics
   * @param eventName The name of the event to track
   * @param options Optional properties to include with the event
   */
  trackEvent(eventName: string, options?: { props: any }): void {
    if (typeof window !== 'undefined' && window.plausible) {
      window.plausible(eventName, options);
    }
  }

  /**
   * Track a page view with custom properties
   * @param properties Optional properties to include with the pageview
   */
  trackPageview(properties?: any): void {
    this.trackEvent('pageview', properties ? { props: properties } : undefined);
  }

  /**
   * Check if Plausible is available
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.plausible !== 'undefined';
  }
}
