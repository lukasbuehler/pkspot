import { TestBed } from "@angular/core/testing";
import { PLATFORM_ID } from "@angular/core";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FirebaseApp } from "@angular/fire/app";
import { FirebaseAppCheck } from "@capacitor-firebase/app-check";
import { ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { PlatformService } from "../platform.service";
import {
  FirebaseAppCheckService,
  buildFirebaseAppCheckInitializeOptions,
} from "./app-check.service";

vi.mock("@capacitor-firebase/app-check", () => ({
  FirebaseAppCheck: {
    initialize: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("firebase/app-check", () => ({
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
      buildFirebaseAppCheckInitializeOptions(
        { enabled: false, recaptchaEnterpriseSiteKey: "site-key" },
        "web"
      )
    ).toBeNull();
  });

  it("builds a reCAPTCHA Enterprise provider for web", () => {
    const options = buildFirebaseAppCheckInitializeOptions(
      {
        enabled: true,
        recaptchaEnterpriseSiteKey: "site-key",
        debugToken: "debug-token",
      },
      "web"
    );

    expect(options).toEqual(
      expect.objectContaining({
        isTokenAutoRefreshEnabled: true,
        debugToken: "debug-token",
      })
    );
    expect(options?.provider).toBeInstanceOf(ReCaptchaEnterpriseProvider);
    expect((options?.provider as { siteKey: string }).siteKey).toBe("site-key");
  });

  it("returns null for web when the site key is missing", () => {
    expect(
      buildFirebaseAppCheckInitializeOptions({ enabled: true }, "web")
    ).toBeNull();
  });

  it("builds native options without a web provider", () => {
    expect(
      buildFirebaseAppCheckInitializeOptions(
        { enabled: true, debugToken: true },
        "ios"
      )
    ).toEqual({
      isTokenAutoRefreshEnabled: true,
      debugToken: true,
    });
  });
});

describe("FirebaseAppCheckService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it("initializes web App Check when configured", async () => {
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
    });

    expect(FirebaseAppCheck.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        isTokenAutoRefreshEnabled: true,
        provider: expect.any(ReCaptchaEnterpriseProvider),
      })
    );
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
