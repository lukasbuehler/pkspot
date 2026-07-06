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
import {
  FirebaseApp as FirebaseJsApp,
  FirebaseOptions,
  getApps,
  initializeApp as initializeFirebaseApp,
} from "firebase/app";
import { environment } from "../../../environments/environment.default";
import { PlatformService } from "../platform.service";

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
const WEB_APPCHECK_DEFAULT_THROTTLE_MS = 24 * 60 * 60 * 1000;

interface WebAppCheckThrottle {
  retryAt: number;
  message: string;
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

    const activeThrottle = this.getActiveWebThrottle(settings);
    if (activeThrottle) {
      this.logWebThrottle(platform, activeThrottle);
      return;
    }

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

    await this.verifyWebToken(appCheck, platform, settings);
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
    settings: FirebaseAppCheckSettings | undefined,
  ): Promise<void> {
    try {
      const result = await getToken(appCheck);
      this.clearWebThrottle(settings);
      this.logSuccess(platform, result.token);
    } catch (error) {
      this.rememberWebThrottle(settings, error);
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

  private logWebThrottle(
    platform: string,
    throttle: WebAppCheckThrottle,
  ): void {
    const retryAt = new Date(throttle.retryAt);
    const message = `App Check verification is throttled locally until ${retryAt.toISOString()}.`;

    this._status.set({
      state: "failed",
      platform,
      phase: "getToken",
      appId: this.getFirebaseAppId(),
      projectId: this.getFirebaseProjectId(),
      message,
    });
    console.warn("[AppCheck] Token check skipped due to local throttle.", {
      platform,
      appId: this.getFirebaseAppId(),
      projectId: this.getFirebaseProjectId(),
      retryAt: retryAt.toISOString(),
      previousMessage: throttle.message,
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
  ): FirebaseJsApp {
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

  private getActiveWebThrottle(
    settings: FirebaseAppCheckSettings | undefined,
  ): WebAppCheckThrottle | null {
    if (settings?.debugToken) {
      return null;
    }

    const key = this.getWebThrottleStorageKey(settings);
    if (!key) {
      return null;
    }

    try {
      const rawThrottle = globalThis.localStorage?.getItem(key);
      if (!rawThrottle) {
        return null;
      }

      const parsedThrottle = JSON.parse(
        rawThrottle,
      ) as Partial<WebAppCheckThrottle>;
      const retryAt = parsedThrottle.retryAt;
      if (typeof retryAt !== "number" || retryAt <= Date.now()) {
        globalThis.localStorage?.removeItem(key);
        return null;
      }

      return {
        retryAt,
        message:
          typeof parsedThrottle.message === "string"
            ? parsedThrottle.message
            : "Previous App Check request was throttled.",
      };
    } catch (error) {
      console.warn("[AppCheck] Could not read local throttle state.", error);
      return null;
    }
  }

  private rememberWebThrottle(
    settings: FirebaseAppCheckSettings | undefined,
    error: unknown,
  ): void {
    if (!this.isInitialThrottleError(error)) {
      return;
    }

    const key = this.getWebThrottleStorageKey(settings);
    if (!key) {
      return;
    }

    const message = this.formatErrorMessage(error);
    const retryAt =
      Date.now() +
      (this.extractThrottleDurationMs(message) ??
        WEB_APPCHECK_DEFAULT_THROTTLE_MS);

    try {
      globalThis.localStorage?.setItem(
        key,
        JSON.stringify({
          retryAt,
          message,
        } satisfies WebAppCheckThrottle),
      );
    } catch (storageError) {
      console.warn("[AppCheck] Could not persist local throttle state.", {
        error: storageError,
      });
    }
  }

  private clearWebThrottle(
    settings: FirebaseAppCheckSettings | undefined,
  ): void {
    const key = this.getWebThrottleStorageKey(settings);
    if (!key) {
      return;
    }

    try {
      globalThis.localStorage?.removeItem(key);
    } catch (error) {
      console.warn("[AppCheck] Could not clear local throttle state.", error);
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

  private isInitialThrottleError(error: unknown): boolean {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "";
    const message = this.formatErrorMessage(error);

    return (
      code === "appCheck/initial-throttle" ||
      message.includes("appCheck/initial-throttle")
    );
  }

  private extractThrottleDurationMs(message: string): number | null {
    const match = message.match(
      /Attempts allowed again after\s+(?:(\d+)d:)?(?:(\d+)h:)?(?:(\d+)m:)?(?:(\d+)s)?/,
    );
    if (!match) {
      return null;
    }

    const [, days, hours, minutes, seconds] = match;
    return (
      Number(days ?? 0) * 24 * 60 * 60 * 1000 +
      Number(hours ?? 0) * 60 * 60 * 1000 +
      Number(minutes ?? 0) * 60 * 1000 +
      Number(seconds ?? 0) * 1000
    );
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
}
