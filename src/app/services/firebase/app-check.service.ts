import { isPlatformBrowser } from "@angular/common";
import {
  Injectable,
  PLATFORM_ID,
  inject,
  signal,
} from "@angular/core";
import {
  FirebaseApp,
  FirebaseOptions,
  getApps,
  initializeApp as initializeFirebaseApp,
} from "firebase/app";
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
import { AnalyticsService } from "../analytics.service";
import { PlatformService } from "../platform.service";
import { FIREBASE_APP } from "./firebase-client.providers";

export interface FirebaseAppCheckSettings {
  enabled: boolean;
  recaptchaEnterpriseSiteKey?: string;
  debugToken?: boolean | string;
  attachToFirebaseSdk?: boolean;
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

const WEB_APPCHECK_PROBE_APP_NAME = "pkspot-app-check-probe";
const WEB_APPCHECK_THROTTLE_STORAGE_PREFIX = "pkspot:app-check:web-throttle";

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
  private readonly analyticsService = inject(AnalyticsService, {
    optional: true,
  });
  private readonly app = inject(FIREBASE_APP);
  private initializationPromise: Promise<void> | null = null;
  private webAppCheck: AppCheck | null = null;
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

  async getTokenForRequest(): Promise<string> {
    await this.initialize();

    if (this.platformService.getPlatform() !== "web") {
      return (await FirebaseAppCheck.getToken()).token;
    }

    const appCheck = this.webAppCheck;
    if (!appCheck) {
      throw new Error("Web App Check is not initialized.");
    }

    return (await getToken(appCheck)).token;
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
      await this.initializeWeb(settings);
      return;
    }

    await this.initializeNative(settings);
  }

  private async initializeWeb(
    settings: FirebaseAppCheckSettings | undefined,
  ): Promise<void> {
    const platform = this.platformService.getPlatform();
    const options = buildFirebaseAppCheckWebInitializeOptions(settings);
    if (!options) {
      this.logSkipped(platform, settings);
      return;
    }

    this.clearLegacyWebThrottle(settings);
    this.configureWebDebugToken(settings);
    let appCheck: AppCheck;
    try {
      appCheck = initializeAppCheck(
        this.getWebAppCheckApp(settings),
        this.getWebAppCheckOptions(settings, options),
      );
    } catch (error) {
      this.logFailure(platform, "initialize", error);
      return;
    }
    this.webAppCheck = appCheck;

    await this.verifyWebToken(appCheck, platform);
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

  private async verifyWebToken(
    appCheck: AppCheck,
    platform: string,
  ): Promise<void> {
    try {
      const result = await getToken(appCheck);
      this.logSuccess(platform, result.token);
    } catch (error) {
      this.logFailure(platform, "getToken", error);
    }
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
    this.trackStatus("ready", platform, {
      expire_time_millis: expireTimeMillis,
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
    console.error(`[AppCheck] Token check failed. ${this.stringifyLogDetails({
      platform,
      phase,
      appId: this.getFirebaseAppId(),
      projectId: this.getFirebaseProjectId(),
      error: this.summarizeErrorForLog(error),
    })}`);
    this.trackStatus("failed", platform, {
      phase,
      ...this.getErrorAnalyticsProperties(error),
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
    this.trackStatus("skipped", platform, {
      enabled: settings?.enabled ?? false,
      has_recaptcha_enterprise_site_key:
        !!settings?.recaptchaEnterpriseSiteKey?.trim(),
      debug_token_enabled: !!settings?.debugToken,
      attach_to_firebase_sdk: settings?.attachToFirebaseSdk !== false,
      reason: settings?.enabled
        ? "configuration_incomplete"
        : "app_check_disabled",
    });
  }

  private trackStatus(
    state: FirebaseAppCheckStatus["state"],
    platform: string,
    properties: Record<string, unknown> = {},
  ): void {
    this.analyticsService?.trackEvent("app_check_status_changed", {
      app_check_state: state,
      app_check_platform: platform,
      app_check_app_id: this.getFirebaseAppId(),
      app_check_project_id: this.getFirebaseProjectId(),
      app_check_environment: environment.name,
      ...properties,
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

  private getWebAppCheckApp(
    settings: FirebaseAppCheckSettings | undefined,
  ): FirebaseApp {
    if (settings?.attachToFirebaseSdk !== false) {
      return this.app;
    }

    const existingProbeApp = getApps().find(
      (app) => app.name === WEB_APPCHECK_PROBE_APP_NAME,
    );
    if (existingProbeApp) {
      return existingProbeApp;
    }

    const options = this.getFirebaseOptions();
    if (!options) {
      throw new Error("Firebase app options are unavailable.");
    }

    return initializeFirebaseApp(options, WEB_APPCHECK_PROBE_APP_NAME);
  }

  private getWebAppCheckOptions(
    settings: FirebaseAppCheckSettings | undefined,
    options: AppCheckOptions,
  ): AppCheckOptions {
    if (settings?.attachToFirebaseSdk !== false) {
      return options;
    }

    return {
      ...options,
      isTokenAutoRefreshEnabled: false,
    };
  }

  private clearLegacyWebThrottle(
    settings: FirebaseAppCheckSettings | undefined,
  ): void {
    const key = this.getWebThrottleStorageKey(settings);
    if (!key) {
      return;
    }

    try {
      globalThis.localStorage?.removeItem(key);
    } catch (error) {
      console.warn("[AppCheck] Could not clear legacy throttle state.", error);
    }
  }

  private getWebThrottleStorageKey(
    settings: FirebaseAppCheckSettings | undefined,
  ): string | null {
    const appId = this.getFirebaseAppId();
    const siteKey = settings?.recaptchaEnterpriseSiteKey?.trim();
    if (!appId || !siteKey) {
      return null;
    }

    return `${WEB_APPCHECK_THROTTLE_STORAGE_PREFIX}:${appId}:${siteKey}`;
  }

  private getFirebaseAppId(): string | undefined {
    return this.getFirebaseOption("appId");
  }

  private getFirebaseProjectId(): string | undefined {
    return this.getFirebaseOption("projectId");
  }

  private getFirebaseOption(key: "appId" | "projectId"): string | undefined {
    const value = this.getFirebaseOptions()?.[key];
    return typeof value === "string" ? value : undefined;
  }

  private getFirebaseOptions(): FirebaseOptions | undefined {
    return (this.app as FirebaseApp & {
      options?: FirebaseOptions;
    }).options;
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

  private getErrorAnalyticsProperties(error: unknown): Record<string, string> {
    const summary = this.summarizeErrorForLog(error);
    if (typeof summary === "object" && summary !== null) {
      const record = summary as Record<string, unknown>;
      const properties: Record<string, string> = {};

      for (const [sourceKey, targetKey] of [
        ["name", "error_name"],
        ["message", "error_message"],
        ["errorMessage", "error_message"],
        ["code", "error_code"],
        ["status", "error_status"],
        ["details", "error_details"],
      ] as const) {
        const value = record[sourceKey];
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          properties[targetKey] = String(value);
        }
      }

      return properties;
    }

    return {
      error_message: String(summary ?? "Unknown App Check error"),
    };
  }

  private summarizeErrorForLog(error: unknown): unknown {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        code: this.getObjectString(error, "code"),
      };
    }

    if (typeof error !== "object" || error === null) {
      return error;
    }

    const summary: Record<string, unknown> = {};
    for (const key of [
      "name",
      "message",
      "errorMessage",
      "code",
      "status",
      "details",
    ]) {
      const value = (error as Record<string, unknown>)[key];
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        summary[key] = value;
      }
    }

    return Object.keys(summary).length > 0 ? summary : String(error);
  }

  private getObjectString(error: object, key: string): string | undefined {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }

  private stringifyLogDetails(details: unknown): string {
    try {
      return JSON.stringify(details);
    } catch {
      return String(details);
    }
  }
}
