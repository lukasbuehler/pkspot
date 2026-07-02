import { TestBed } from "@angular/core/testing";
import { PLATFORM_ID } from "@angular/core";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FirebaseApp } from "@angular/fire/app";
import { FirebaseAppCheck } from "@capacitor-firebase/app-check";
import {
  ReCaptchaEnterpriseProvider,
  getToken,
  initializeAppCheck,
} from "firebase/app-check";
import { PlatformService } from "../platform.service";
import {
  FirebaseAppCheckService,
  buildFirebaseAppCheckNativeInitializeOptions,
  buildFirebaseAppCheckWebInitializeOptions,
} from "./app-check.service";

vi.mock("@capacitor-firebase/app-check", () => ({
  FirebaseAppCheck: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getToken: vi.fn().mockResolvedValue({
      token: "native-token",
      expireTimeMillis: 123,
    }),
  },
}));

vi.mock("firebase/app-check", () => ({
  initializeAppCheck: vi.fn(() => ({ app: "app-check" })),
  getToken: vi.fn().mockResolvedValue({ token: "web-token" }),
  ReCaptchaEnterpriseProvider: class MockReCaptchaEnterpriseProvider {
    constructor(public siteKey: string) {}
  },
}));

const createPlatformService = (platform: "web" | "ios" | "android") => ({
  getPlatform: vi.fn().mockReturnValue(platform),
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
        { provide: PlatformService, useValue: createPlatformService("android") },
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
      "[AppCheck] Token check failed.",
      expect.objectContaining({
        platform: "ios",
        phase: "getToken",
        appId: "native-app-id",
        projectId: "parkour-base-project",
        error: expect.any(Error),
      })
    );
  });

  it("logs and rethrows a native App Check initialization failure", async () => {
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

    await expect(
      TestBed.inject(FirebaseAppCheckService).initialize({ enabled: true })
    ).rejects.toThrow("init failed");

    expect(console.error).toHaveBeenCalledWith(
      "[AppCheck] Token check failed.",
      expect.objectContaining({
        platform: "android",
        phase: "initialize",
        appId: "native-app-id",
        projectId: "parkour-base-project",
        error: expect.any(Error),
      })
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
