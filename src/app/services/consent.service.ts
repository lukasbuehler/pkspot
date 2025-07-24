import { Injectable, signal, WritableSignal } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class ConsentService {
  private _hasConsent: WritableSignal<boolean> = signal(false);
  private _consentGranted$ = new BehaviorSubject<boolean>(false);

  constructor() {
    // Check consent status on initialization
    this.checkConsentStatus();
  }

  /**
   * Signal indicating whether user has granted consent
   */
  get hasConsent() {
    return this._hasConsent.asReadonly();
  }

  /**
   * Observable for consent status changes
   */
  get consentGranted$(): Observable<boolean> {
    return this._consentGranted$.asObservable();
  }

  /**
   * Check current consent status from localStorage
   */
  private checkConsentStatus(): void {
    if (typeof window !== "undefined") {
      const currentTermsVersion = "3";
      const acceptedVersion = localStorage.getItem("acceptedVersion");
      const hasConsent = acceptedVersion === currentTermsVersion;

      console.log("ConsentService: Checking consent status", {
        acceptedVersion,
        currentTermsVersion,
        hasConsent,
        localStorage: typeof localStorage !== "undefined",
      });

      this._hasConsent.set(hasConsent);
      this._consentGranted$.next(hasConsent);
    } else {
      console.log("ConsentService: Window not available (SSR)");
    }
  }

  /**
   * Grant consent (called when user accepts terms)
   */
  grantConsent(): void {
    this._hasConsent.set(true);
    this._consentGranted$.next(true);
  }

  /**
   * Revoke consent
   */
  revokeConsent(): void {
    this._hasConsent.set(false);
    this._consentGranted$.next(false);
  }

  /**
   * Wait for consent to be granted
   * @returns Promise that resolves when consent is granted
   */
  waitForConsent(): Promise<void> {
    return new Promise((resolve) => {
      if (this._hasConsent()) {
        resolve();
        return;
      }

      const subscription = this.consentGranted$.subscribe((hasConsent) => {
        if (hasConsent) {
          subscription.unsubscribe();
          resolve();
        }
      });
    });
  }

  /**
   * Execute a function only if consent has been granted
   * @param fn Function to execute
   * @returns Promise that resolves with the function result or rejects if no consent
   */
  executeWithConsent<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this._hasConsent()) {
      return Promise.resolve(fn());
    }

    return Promise.reject(new Error("User consent required"));
  }

  /**
   * Execute a function when consent is granted (waits if necessary)
   * @param fn Function to execute
   * @returns Promise that resolves with the function result
   */
  executeWhenConsent<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.waitForConsent().then(() => fn());
  }
}
