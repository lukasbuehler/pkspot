import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { FirebaseApp } from "@angular/fire/app";
import {
  FirebaseAppCheck,
  InitializeOptions,
} from "@capacitor-firebase/app-check";
import {
  AppCheck,
  AppCheckOptions,
  ReCaptchaEnterpriseProvider,
  getToken,
  initializeAppCheck,
} from "firebase/app-check";
import { environment } from "../../../environments/environment.default";
import { PlatformService } from "../platform.service";

export interface FirebaseAppCheckSettings {
  enabled: boolean;
  recaptchaEnterpriseSiteKey?: string;
  debugToken?: boolean | string;
}

export function buildFirebaseAppCheckNativeInitializeOptions(
  settings: FirebaseAppCheckSettings | undefined,
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

  return options;
}

export function buildFirebaseAppCheckWebInitializeOptions(
  settings: FirebaseAppCheckSettings | undefined,
): AppCheckOptions | null {
  if (!settings?.enabled) {
    return null;
  }

  const siteKey = settings.recaptchaEnterpriseSiteKey?.trim();
  if (!siteKey) {
    return null;
  }

  return {
    isTokenAutoRefreshEnabled: true,
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

    const platform = this.platformService.getPlatform();

    if (platform === "web") {
      this.initializeWeb(settings);
      return;
    }

    await this.initializeNative(settings);
  }

  private initializeWeb(
    settings: FirebaseAppCheckSettings | undefined,
  ): void {
    const platform = this.platformService.getPlatform();
    const options = buildFirebaseAppCheckWebInitializeOptions(settings);
    if (!options) {
      this.warnAboutMissingWebConfiguration(settings);
      return;
    }

    this.configureWebDebugToken(settings);
    const appCheck = initializeAppCheck(this.app, options);
    this.verifyWebToken(appCheck, platform);
  }

  private async initializeNative(
    settings: FirebaseAppCheckSettings | undefined,
  ): Promise<void> {
    const platform = this.platformService.getPlatform();
    const options = buildFirebaseAppCheckNativeInitializeOptions(settings);
    if (!options) {
      this.logSkipped(platform, settings);
      return;
    }

    try {
      await FirebaseAppCheck.initialize(options);
      await this.verifyNativeToken(platform);
    } catch (error) {
      this.logFailure(platform, "initialize", error);
      throw error;
    }
  }

  private verifyWebToken(appCheck: AppCheck, platform: string): void {
    void getToken(appCheck)
      .then((result) => {
        this.logSuccess(platform, result.token);
      })
      .catch((error) => {
        this.logFailure(platform, "getToken", error);
      });
  }

  private async verifyNativeToken(platform: string): Promise<void> {
    try {
      const result = await FirebaseAppCheck.getToken();
      this.logSuccess(platform, result.token, result.expireTimeMillis);
    } catch (error) {
      this.logFailure(platform, "getToken", error);
    }
  }

  private logSuccess(
    platform: string,
    token: string,
    expireTimeMillis?: number,
  ): void {
    console.info("[AppCheck] Token check succeeded.", {
      platform,
      appId: this.getFirebaseAppId(),
      projectId: this.getFirebaseProjectId(),
      tokenLength: token.length,
      expireTimeMillis,
    });
  }

  private logFailure(
    platform: string,
    phase: "initialize" | "getToken",
    error: unknown,
  ): void {
    console.error("[AppCheck] Token check failed.", {
      platform,
      phase,
      appId: this.getFirebaseAppId(),
      projectId: this.getFirebaseProjectId(),
      error,
    });
  }

  private logSkipped(
    platform: string,
    settings: FirebaseAppCheckSettings | undefined,
  ): void {
    console.warn("[AppCheck] Initialization skipped.", {
      platform,
      appId: this.getFirebaseAppId(),
      projectId: this.getFirebaseProjectId(),
      enabled: settings?.enabled ?? false,
    });
  }

  private warnAboutMissingWebConfiguration(
    settings: FirebaseAppCheckSettings | undefined,
  ): void {
    if (settings?.enabled) {
      console.warn(
        "[AppCheck] Web App Check is enabled but no reCAPTCHA Enterprise site key is configured.",
      );
    }
  }

  private configureWebDebugToken(
    settings: FirebaseAppCheckSettings | undefined,
  ): void {
    if (!settings?.debugToken) {
      return;
    }

    const appCheckGlobal = globalThis as typeof globalThis & {
      FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
    };
    appCheckGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN = settings.debugToken;
  }

  private getFirebaseAppId(): string | undefined {
    return this.getFirebaseOption("appId");
  }

  private getFirebaseProjectId(): string | undefined {
    return this.getFirebaseOption("projectId");
  }

  private getFirebaseOption(key: "appId" | "projectId"): string | undefined {
    const value = (this.app as FirebaseApp & {
      options?: Record<string, unknown>;
    }).options?.[key];
    return typeof value === "string" ? value : undefined;
  }
}
