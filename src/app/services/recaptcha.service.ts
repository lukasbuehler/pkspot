import { Injectable, inject } from "@angular/core";
import { RecaptchaVerifier, Auth } from "@angular/fire/auth";
import { ConsentAwareService } from "./consent-aware.service";

@Injectable({
  providedIn: "root",
})
export class RecaptchaService extends ConsentAwareService {
  constructor() {
    super();
  }

  /**
   * Create a Firebase RecaptchaVerifier with consent awareness
   * This matches the pattern used in your forgot-password and sign-up components
   */
  createRecaptchaVerifier(
    auth: Auth,
    containerId: string,
    parameters?: {
      size?: "normal" | "compact" | "invisible";
      callback?: (response: any) => void;
      "expired-callback"?: () => void;
    }
  ): Promise<RecaptchaVerifier> {
    console.log(
      "RecaptchaService: createRecaptchaVerifier called, checking consent...",
      {
        hasConsent: this.hasConsent(),
        containerId,
      }
    );

    // Check consent BEFORE creating RecaptchaVerifier to prevent API calls
    if (!this.hasConsent()) {
      console.warn(
        "RecaptchaService: Consent check failed, rejecting reCAPTCHA creation"
      );
      return Promise.reject(new Error("User consent required for reCAPTCHA"));
    }

    console.log(
      "RecaptchaService: Consent granted, creating RecaptchaVerifier"
    );

    return this.executeWithConsent(() => {
      return new RecaptchaVerifier(auth, containerId, parameters || {});
    });
  }

  /**
   * Setup invisible reCAPTCHA for password reset
   * This matches your forgot-password-page implementation
   */
  setupInvisibleRecaptcha(
    auth: Auth,
    containerId: string = "reCaptchaDiv",
    onSolved?: (response: any) => void,
    onExpired?: () => void
  ): Promise<RecaptchaVerifier> {
    return this.createRecaptchaVerifier(auth, containerId, {
      size: "invisible",
      callback: (response: any) => {
        console.log("reCAPTCHA solved");
        if (onSolved) onSolved(response);
      },
      "expired-callback": () => {
        console.error("reCAPTCHA expired");
        if (onExpired) onExpired();
      },
    });
  }

  /**
   * Setup visible reCAPTCHA for sign up
   * This matches your sign-up-page implementation
   */
  setupVisibleRecaptcha(
    auth: Auth,
    containerId: string = "reCaptchaDiv",
    onSolved?: (response: any) => void,
    onExpired?: () => void
  ): Promise<RecaptchaVerifier> {
    return this.createRecaptchaVerifier(auth, containerId, {
      size: "normal",
      callback: (response: any) => {
        console.log("reCAPTCHA solved", response);
        if (onSolved) onSolved(response);
      },
      "expired-callback": () => {
        console.error("reCAPTCHA expired");
        if (onExpired) onExpired();
      },
    });
  }

  /**
   * Check if reCAPTCHA API is available in the global scope
   */
  isRecaptchaAvailable(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof (window as any).grecaptcha !== "undefined"
    );
  }

  /**
   * Verify a reCAPTCHA with consent check
   */
  verifyRecaptcha(recaptcha: RecaptchaVerifier): Promise<string> {
    return this.executeWithConsent(() => {
      return recaptcha.verify();
    });
  }
}
