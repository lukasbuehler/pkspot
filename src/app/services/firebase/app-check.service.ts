import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, inject, signal } from "@angular/core";
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

export interface FirebaseAppCheckStatus {
  state: "idle" | "initializing" | "ready" | "skipped" | "failed";
  platform?: string;
  phase?: "initialize" | "getToken";
  appId?: string;
  projectId?: string;
  message?: string;
  error?: unknown;
}

type ScreenshotGlobal = typeof globalThis & {
  __PKSPOT_STORE_SCREENSHOT__?: unknown;
};

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
  private readonly _status = signal<FirebaseAppCheckStatus>({
    state: "idle",
  });

  readonly status = this._status.asReadonly();

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
      this._status.set({ state: "skipped", platform: "server" });
      return;
    }

    if (this.isStoreScreenshotRun()) {
      this._status.set({
        state: "skipped",
        platform: "store-screenshot",
        message: "App Check is skipped for local store screenshot rendering.",
      });
      return;
    }

    const platform = this.platformService.getPlatform();
    this._status.set({
      state: "initializing",
      platform,
      appId: this.getFirebaseAppId(),
      projectId: this.getFirebaseProjectId(),
    });

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
    try {
      const appCheck = initializeAppCheck(this.app, options);
      this.verifyWebToken(appCheck, platform);
    } catch (error) {
      this.logFailure(platform, "initialize", error);
    }
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
    this._status.set({
      state: "ready",
      platform,
      appId: this.getFirebaseAppId(),
      projectId: this.getFirebaseProjectId(),
    });
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
    this._status.set({
      state: "failed",
      platform,
      phase,
      appId: this.getFirebaseAppId(),
      projectId: this.getFirebaseProjectId(),
      message: this.formatErrorMessage(error),
      error,
    });
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
    this._status.set({
      state: "skipped",
      platform,
      appId: this.getFirebaseAppId(),
      projectId: this.getFirebaseProjectId(),
      message: settings?.enabled
        ? "App Check configuration is incomplete."
        : "App Check is disabled.",
    });
    console.warn("[AppCheck] Initialization skipped.", {
      platform,
      appId: this.getFirebaseAppId(),
      projectId: this.getFirebaseProjectId(),
      enabled: settings?.enabled ?? false,
    });
  }

  private isStoreScreenshotRun(): boolean {
    if ((globalThis as ScreenshotGlobal).__PKSPOT_STORE_SCREENSHOT__ !== true) {
      return false;
    }

    if (typeof window === "undefined") {
      return false;
    }

    return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
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

  private formatErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      return (error as { message: string }).message;
    }

    return String(error ?? "Unknown App Check error");
  }
}
