import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { FirebaseApp } from "@angular/fire/app";
import {
  FirebaseAppCheck,
  InitializeOptions,
} from "@capacitor-firebase/app-check";
import { ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { environment } from "../../../environments/environment.default";
import { PlatformService } from "../platform.service";

export interface FirebaseAppCheckSettings {
  enabled: boolean;
  recaptchaEnterpriseSiteKey?: string;
  debugToken?: boolean | string;
}

export function buildFirebaseAppCheckInitializeOptions(
  settings: FirebaseAppCheckSettings | undefined,
  platform: "web" | "ios" | "android",
): InitializeOptions | null {
  if (!settings?.enabled) {
    return null;
  }

  const options: InitializeOptions = {
    isTokenAutoRefreshEnabled: true,
  };

  if (settings.debugToken) {
    options.debugToken = settings.debugToken;
  }

  if (platform !== "web") {
    return options;
  }

  const siteKey = settings.recaptchaEnterpriseSiteKey?.trim();
  if (!siteKey) {
    return null;
  }

  return {
    ...options,
    provider: new ReCaptchaEnterpriseProvider(siteKey),
  };
}

@Injectable({
  providedIn: "root",
})
export class FirebaseAppCheckService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly platformService = inject(PlatformService);
  private readonly app = inject(FirebaseApp);
  private initializationPromise: Promise<void> | null = null;

  initialize(
    settings: FirebaseAppCheckSettings | undefined = environment.appCheck,
  ): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.initializeOnce(settings).catch(
      (error) => {
        this.initializationPromise = null;
        throw error;
      },
    );
    return this.initializationPromise;
  }

  private async initializeOnce(
    settings: FirebaseAppCheckSettings | undefined,
  ): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Force FirebaseApp injection before the Capacitor plugin's web wrapper calls getApp().
    void this.app;

    const options = buildFirebaseAppCheckInitializeOptions(
      settings,
      this.platformService.getPlatform(),
    );
    if (!options) {
      if (settings?.enabled && this.platformService.getPlatform() === "web") {
        console.warn(
          "[AppCheck] Web App Check is enabled but no reCAPTCHA Enterprise site key is configured.",
        );
      }
      return;
    }

    await FirebaseAppCheck.initialize(options);
  }
}
