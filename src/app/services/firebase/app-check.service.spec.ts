import { TestBed } from "@angular/core/testing";
import { PLATFORM_ID } from "@angular/core";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FirebaseApp,
  getApps,
  initializeApp as initializeFirebaseApp,
} from "@angular/fire/app";
import { FirebaseAppCheck } from "@capacitor-firebase/app-check";
import {
  ReCaptchaEnterpriseProvider,
  getToken,
  initializeAppCheck,
} from "@angular/fire/app-check";
import { PlatformService } from "../platform.service";
import {
  FirebaseAppCheckService,
  buildFirebaseAppCheckNativeInitializeOptions,
  buildFirebaseAppCheckWebInitializeOptions,
} from "./app-check.service";
import { environment as productionEnvironment } from "../../../environments/environment.production";
import { AnalyticsService } from "../analytics.service";

vi.mock("@capacitor-firebase/app-check", () => ({
  FirebaseAppCheck: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getToken: vi.fn().mockResolvedValue({
      token: "native-token",
      expireTimeMillis: 123,
    }),
  },
}));

vi.mock("@angular/fire/app-check", () => ({
  initializeAppCheck: vi.fn(() => ({ app: "app-check" })),
  getToken: vi.fn().mockResolvedValue({ token: "web-token" }),
  ReCaptchaEnterpriseProvider: class MockReCaptchaEnterpriseProvider {
    constructor(public siteKey: string) {}
  },
}));

vi.mock("@angular/fire/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@angular/fire/app")>();
  return {
    ...actual,
    getApps: vi.fn(() => []),
    initializeApp: vi.fn((options: unknown, name?: string) => ({
      name,
      options,
    })),
  };
});

const createPlatformService = (platform: "web" | "ios" | "android") => ({
  getPlatform: vi.fn().mockReturnValue(platform),
});

const createAnalyticsService = () => ({
  trackEvent: vi.fn(),
});

describe("buildFirebaseAppCheckInitializeOptions", () => {
  it("returns null when App Check is disabled", () => {
    expect(
      buildFirebaseAppCheckWebInitializeOptions({
        enabled: false,
        recaptchaEnterpriseSiteKey: "site-key",
      })
    ).toBeNull();
  });

  it("builds a reCAPTCHA Enterprise provider for web", () => {
    const options = buildFirebaseAppCheckWebInitializeOptions({
      enabled: true,
      recaptchaEnterpriseSiteKey: "site-key",
      debugToken: "debug-token",
    });

    expect(options).toEqual(
      expect.objectContaining({
        isTokenAutoRefreshEnabled: true,
      })
    );
    expect(options?.provider).toBeInstanceOf(ReCaptchaEnterpriseProvider);
    expect((options?.provider as { siteKey: string }).siteKey).toBe("site-key");
  });

  it("returns null for web when the site key is missing", () => {
    expect(
      buildFirebaseAppCheckWebInitializeOptions({ enabled: true })
    ).toBeNull();
  });

  it("builds native options without a web provider", () => {
    expect(
      buildFirebaseAppCheckNativeInitializeOptions({
        enabled: true,
        debugToken: true,
      })
    ).toEqual({
      isTokenAutoRefreshEnabled: true,
      debugToken: true,
    });
  });
});

describe("FirebaseAppCheckService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    delete (
      globalThis as typeof globalThis & {
        FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
      }
    ).FIREBASE_APPCHECK_DEBUG_TOKEN;
    delete (
      globalThis as typeof globalThis & {
        __PKSPOT_STORE_SCREENSHOT__?: boolean;
      }
    ).__PKSPOT_STORE_SCREENSHOT__;
    globalThis.localStorage?.clear();
  });

  it("skips initialization during SSR", async () => {
    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: {} },
        { provide: PLATFORM_ID, useValue: "server" },
        { provide: PlatformService, useValue: createPlatformService("web") },
      ],
    });

    await TestBed.inject(FirebaseAppCheckService).initialize({
      enabled: true,
      recaptchaEnterpriseSiteKey: "site-key",
    });

    expect(FirebaseAppCheck.initialize).not.toHaveBeenCalled();
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it("tracks skipped App Check initialization when web config is incomplete", async () => {
    const analytics = createAnalyticsService();

    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        {
          provide: FirebaseApp,
          useValue: {
            options: {
              appId: "web-app-id",
              projectId: "parkour-base-project",
            },
          },
        },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("web") },
        { provide: AnalyticsService, useValue: analytics },
      ],
    });

    await TestBed.inject(FirebaseAppCheckService).initialize({
      enabled: true,
      recaptchaEnterpriseSiteKey: "",
    });

    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "app_check_status_changed",
      expect.objectContaining({
        app_check_state: "skipped",
        app_check_platform: "web",
        app_check_app_id: "web-app-id",
        app_check_project_id: "parkour-base-project",
        reason: "configuration_incomplete",
        enabled: true,
        has_recaptcha_enterprise_site_key: false,
      })
    );
  });

  it("initializes web App Check when configured", async () => {
    const firebaseApp = { options: { appId: "expected-app-id" } };
    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: firebaseApp },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("web") },
      ],
    });

    await TestBed.inject(FirebaseAppCheckService).initialize({
      enabled: true,
      recaptchaEnterpriseSiteKey: "site-key",
    });

    expect(initializeAppCheck).toHaveBeenCalledWith(
      firebaseApp,
      expect.objectContaining({
        isTokenAutoRefreshEnabled: true,
        provider: expect.any(ReCaptchaEnterpriseProvider),
      })
    );
    expect(getToken).toHaveBeenCalledWith({ app: "app-check" });
    expect(FirebaseAppCheck.initialize).not.toHaveBeenCalled();
  });

  it("returns a web token for Google Maps requests", async () => {
    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: {} },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("web") },
      ],
    });

    const service = TestBed.inject(FirebaseAppCheckService);
    await service.initialize({
      enabled: true,
      recaptchaEnterpriseSiteKey: "site-key",
    });

    await expect(service.getTokenForRequest()).resolves.toBe("web-token");
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("does not resolve web initialization before token verification settles", async () => {
    let resolveToken!: (value: { token: string }) => void;
    vi.mocked(getToken).mockReturnValueOnce(
      new Promise<{ token: string }>((resolve) => {
        resolveToken = resolve;
      })
    );

    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: {} },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("web") },
      ],
    });

    const service = TestBed.inject(FirebaseAppCheckService);
    let initialized = false;
    const initializePromise = service
      .initialize({
        enabled: true,
        recaptchaEnterpriseSiteKey: "site-key",
      })
      .then(() => {
        initialized = true;
      });

    await Promise.resolve();

    expect(initialized).toBe(false);
    expect(service.status()).toEqual(
      expect.objectContaining({ state: "initializing" })
    );

    resolveToken({ token: "web-token" });
    await initializePromise;

    expect(initialized).toBe(true);
    expect(service.status()).toEqual(expect.objectContaining({ state: "ready" }));
  });

  it("keeps production web App Check enabled without binding it to the Firestore app while enforcement is off", async () => {
    expect(productionEnvironment.appCheck.enabled).toBe(true);
    expect(productionEnvironment.appCheck.attachToFirebaseSdk).toBe(false);

    const firebaseApp = {
      name: "[DEFAULT]",
      options: {
        appId: "production-app-id",
        projectId: "parkour-base-project",
      },
    };

    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: firebaseApp },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("web") },
      ],
    });

    const service = TestBed.inject(FirebaseAppCheckService);
    await service.initialize(productionEnvironment.appCheck);

    expect(initializeFirebaseApp).toHaveBeenCalledWith(
      firebaseApp.options,
      "pkspot-app-check-probe"
    );
    expect(initializeAppCheck).toHaveBeenCalledWith(
      expect.objectContaining({ name: "pkspot-app-check-probe" }),
      expect.objectContaining({ isTokenAutoRefreshEnabled: false })
    );
    expect(initializeAppCheck).not.toHaveBeenCalledWith(
      firebaseApp,
      expect.anything()
    );
    expect(getApps).toHaveBeenCalled();
    expect(getToken).toHaveBeenCalledWith({ app: "app-check" });
    expect(service.status()).toEqual(
      expect.objectContaining({
        state: "ready",
        platform: "web",
      })
    );
  });

  it("stores the web App Check throttle after Firebase rejects token exchange", async () => {
    const throttleError = Object.assign(
      new Error(
        "AppCheck: 403 error. Attempts allowed again after 01d:00m:00s (appCheck/initial-throttle)."
      ),
      { code: "appCheck/initial-throttle" }
    );
    vi.mocked(getToken).mockRejectedValueOnce(throttleError);

    const firebaseApp = {
      options: {
        appId: "web-app-id",
        projectId: "parkour-base-project",
      },
    };

    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: firebaseApp },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("web") },
      ],
    });

    const service = TestBed.inject(FirebaseAppCheckService);
    await service.initialize({
      enabled: true,
      recaptchaEnterpriseSiteKey: "site-key",
      attachToFirebaseSdk: false,
    });

    const rawThrottle = globalThis.localStorage?.getItem(
      "pkspot:app-check:web-throttle:web-app-id:site-key"
    );

    expect(rawThrottle).toBeTruthy();
    expect(JSON.parse(rawThrottle ?? "{}")).toEqual(
      expect.objectContaining({
        message: throttleError.message,
      })
    );
    expect(service.status()).toEqual(
      expect.objectContaining({
        state: "failed",
        platform: "web",
        phase: "getToken",
        message: throttleError.message,
      })
    );
  });

  it("skips the web App Check probe while a local throttle is active", async () => {
    const firebaseApp = {
      options: {
        appId: "web-app-id",
        projectId: "parkour-base-project",
      },
    };

    globalThis.localStorage?.setItem(
      "pkspot:app-check:web-throttle:web-app-id:site-key",
      JSON.stringify({
        retryAt: Date.now() + 60_000,
        message: "Previous App Check request was throttled.",
      })
    );

    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: firebaseApp },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("web") },
      ],
    });

    const service = TestBed.inject(FirebaseAppCheckService);
    await service.initialize({
      enabled: true,
      recaptchaEnterpriseSiteKey: "site-key",
      attachToFirebaseSdk: false,
    });

    expect(initializeAppCheck).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[AppCheck] Token check skipped due to local throttle.",
      expect.objectContaining({
        platform: "web",
        appId: "web-app-id",
        projectId: "parkour-base-project",
      })
    );
    expect(service.status()).toEqual(
      expect.objectContaining({
        state: "failed",
        platform: "web",
        phase: "getToken",
      })
    );
  });

  it("skips initialization during store screenshot rendering", async () => {
    (
      globalThis as typeof globalThis & {
        __PKSPOT_STORE_SCREENSHOT__?: boolean;
      }
    ).__PKSPOT_STORE_SCREENSHOT__ = true;

    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: {} },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("web") },
      ],
    });

    const service = TestBed.inject(FirebaseAppCheckService);
    await service.initialize({
      enabled: true,
      recaptchaEnterpriseSiteKey: "site-key",
    });

    expect(FirebaseAppCheck.initialize).not.toHaveBeenCalled();
    expect(initializeAppCheck).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(service.status()).toEqual(
      expect.objectContaining({
        state: "skipped",
        platform: "store-screenshot",
      })
    );
  });

  it("sets the web debug token before direct web initialization", async () => {
    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: {} },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("web") },
      ],
    });

    await TestBed.inject(FirebaseAppCheckService).initialize({
      enabled: true,
      recaptchaEnterpriseSiteKey: "site-key",
      debugToken: "debug-token",
    });

    expect(
      (
        globalThis as typeof globalThis & {
          FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
        }
      ).FIREBASE_APPCHECK_DEBUG_TOKEN
    ).toBe("debug-token");
  });

  it("initializes native App Check without requiring a web site key", async () => {
    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: {} },
        { provide: PLATFORM_ID, useValue: "browser" },
        {
          provide: PlatformService,
          useValue: createPlatformService("android"),
        },
      ],
    });

    await TestBed.inject(FirebaseAppCheckService).initialize({
      enabled: true,
    });

    expect(FirebaseAppCheck.initialize).toHaveBeenCalledWith({
      isTokenAutoRefreshEnabled: true,
    });
    expect(FirebaseAppCheck.getToken).toHaveBeenCalledWith();
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it("returns a native token for Google Maps requests", async () => {
    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: {} },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("android") },
      ],
    });

    const service = TestBed.inject(FirebaseAppCheckService);
    await service.initialize({ enabled: true });

    await expect(service.getTokenForRequest()).resolves.toBe("native-token");
    expect(FirebaseAppCheck.getToken).toHaveBeenCalledTimes(2);
  });

  it("logs a native App Check token failure without failing initialization", async () => {
    vi.mocked(FirebaseAppCheck.getToken).mockRejectedValueOnce(
      new Error("token failed")
    );

    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        {
          provide: FirebaseApp,
          useValue: {
            options: {
              appId: "native-app-id",
              projectId: "parkour-base-project",
            },
          },
        },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("ios") },
      ],
    });

    await expect(
      TestBed.inject(FirebaseAppCheckService).initialize({ enabled: true })
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        '[AppCheck] Token check failed. {"platform":"ios","phase":"getToken","appId":"native-app-id","projectId":"parkour-base-project","error":{"name":"Error","message":"token failed"}}'
      )
    );
  });

  it("logs and exposes a native App Check initialization failure", async () => {
    vi.mocked(FirebaseAppCheck.initialize).mockRejectedValueOnce(
      new Error("init failed")
    );

    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        {
          provide: FirebaseApp,
          useValue: {
            options: {
              appId: "native-app-id",
              projectId: "parkour-base-project",
            },
          },
        },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("android") },
      ],
    });

    const service = TestBed.inject(FirebaseAppCheckService);

    await expect(service.initialize({ enabled: true })).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        '[AppCheck] Token check failed. {"platform":"android","phase":"initialize","appId":"native-app-id","projectId":"parkour-base-project","error":{"name":"Error","message":"init failed"}}'
      )
    );
    expect(service.status()).toEqual(
      expect.objectContaining({
        state: "failed",
        platform: "android",
        phase: "initialize",
        appId: "native-app-id",
        projectId: "parkour-base-project",
        message: "init failed",
        error: expect.any(Error),
      })
    );
  });

  it("serializes native plugin error objects in App Check failure logs", async () => {
    vi.mocked(FirebaseAppCheck.getToken).mockRejectedValueOnce({
      errorMessage: "Error returned from API. code: 403 body: App attestation failed.",
      code: "app-check/attestation-failed",
    });

    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        {
          provide: FirebaseApp,
          useValue: {
            options: {
              appId: "native-app-id",
              projectId: "parkour-base-project",
            },
          },
        },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("android") },
      ],
    });

    await TestBed.inject(FirebaseAppCheckService).initialize({ enabled: true });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        '"errorMessage":"Error returned from API. code: 403 body: App attestation failed."'
      )
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.not.stringContaining("[object Object]")
    );
  });

  it("does not initialize twice", async () => {
    TestBed.configureTestingModule({
      providers: [
        FirebaseAppCheckService,
        { provide: FirebaseApp, useValue: {} },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: PlatformService, useValue: createPlatformService("ios") },
      ],
    });

    const service = TestBed.inject(FirebaseAppCheckService);

    await service.initialize({ enabled: true });
    await service.initialize({ enabled: true });

    expect(FirebaseAppCheck.initialize).toHaveBeenCalledTimes(1);
  });
});
