import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { Posthog as CapacitorPostHog } from "@capawesome/capacitor-posthog";
import { NEVER } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "../../environments/environment.default";
import { ConsentService } from "./consent.service";
import { AnalyticsService, stripUtmParametersFromUrl, redactPlanningUrl } from "./analytics.service";

const capacitorPostHogMock = vi.hoisted(() => ({
  unregister: vi.fn(),
  captureException: vi.fn(),
  setup: vi.fn().mockResolvedValue(undefined),
  register: vi.fn().mockResolvedValue(undefined),
  screen: vi.fn().mockResolvedValue(undefined),
  capture: vi.fn().mockResolvedValue(undefined),
  optIn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@capawesome/capacitor-posthog", () => ({
  Posthog: capacitorPostHogMock,
}));

describe("AnalyticsService privacy and native startup", () => {
  const originalConfig = environment.keys.posthog;
  let service: AnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    environment.keys.posthog = { apiKey: "phc_test", host: "https://analytics.invalid" };
    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        { provide: ConsentService, useValue: { hasConsent: () => true } },
        { provide: Router, useValue: { events: NEVER, url: "/map" } },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });
    service = TestBed.inject(AnalyticsService);
    const internals = service as unknown as { isLocalhost: () => boolean; isNative: () => boolean };
    vi.spyOn(internals, "isLocalhost").mockReturnValue(false);
    vi.spyOn(internals, "isNative").mockReturnValue(true);
    vi.mocked(CapacitorPostHog.unregister).mockResolvedValue();
  });

  afterEach(() => {
    environment.keys.posthog = originalConfig;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("captures the initial native screen after initialization is ready", async () => {
    await service.init();

    expect(CapacitorPostHog.screen).toHaveBeenCalledWith(expect.objectContaining({
      screenTitle: "https://pkspot.app/map",
    }));
    expect(CapacitorPostHog.capture).toHaveBeenCalledWith(expect.objectContaining({
      event: "$pageview",
    }));
    service.trackScreen("/map");
    expect(CapacitorPostHog.screen).toHaveBeenCalledTimes(1);
    expect(CapacitorPostHog.capture).toHaveBeenCalledTimes(1);
  });

  it("does not treat a false GPC signal as an opt-out", async () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: false });
    await service.init();
    expect(service.isAvailable()).toBe(true);
    expect(CapacitorPostHog.capture).toHaveBeenCalled();
  });

  it("does not access browser privacy signals during SSR", () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        { provide: ConsentService, useValue: {} },
        { provide: Router, useValue: {} },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });
    const readGpc = vi.fn(() => { throw new Error("Browser-only API"); });
    vi.stubGlobal("navigator", { get globalPrivacyControl() { return readGpc(); } });
    const internals = TestBed.inject(AnalyticsService) as unknown as {
      hasGlobalPrivacyControl: () => boolean;
    };
    expect(internals.hasGlobalPrivacyControl()).toBe(false);
    expect(readGpc).not.toHaveBeenCalled();
  });

  it("drops web SDK events at the send hook when GPC is active", () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    const internals = service as unknown as {
      processEventBeforeSend: (event: unknown) => unknown;
    };
    expect(internals.processEventBeforeSend({ event: "$pageview", properties: {} })).toBeNull();
  });

  it.each([true, false])("does not initialize analytics with GPC enabled (native=%s)", async (native) => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    const internals = service as unknown as { isNative: () => boolean; initWeb: () => Promise<void> };
    vi.mocked(internals.isNative).mockReturnValue(native);
    const webInit = vi.spyOn(internals, "initWeb").mockResolvedValue();

    await service.init();
    service.optIn();

    expect(CapacitorPostHog.setup).not.toHaveBeenCalled();
    expect(CapacitorPostHog.optIn).not.toHaveBeenCalled();
    expect(webInit).not.toHaveBeenCalled();
    expect(service.hasOptedOut()).toBe(true);
  });

  it("blocks captures and opt-in if GPC becomes active after startup", async () => {
    await service.init();
    vi.mocked(CapacitorPostHog.capture).mockClear();
    vi.mocked(CapacitorPostHog.screen).mockClear();
    vi.stubGlobal("navigator", { globalPrivacyControl: true });

    service.trackScreen("/events");
    service.trackEvent("$pageview");
    service.optIn();

    expect(CapacitorPostHog.capture).not.toHaveBeenCalled();
    expect(CapacitorPostHog.screen).not.toHaveBeenCalled();
    expect(CapacitorPostHog.optIn).not.toHaveBeenCalled();
  });
});

describe("AnalyticsService URL helpers", () => {
  it("removes UTM parameters while preserving other query params and hash", () => {
    expect(
      stripUtmParametersFromUrl(
        "https://pkspot.app/map?filter=dry&utm_source=sticker&utm_medium=qr&utm_campaign=nice-spot-v1#spots"
      )
    ).toBe("/map?filter=dry#spots");
  });

  it("removes UTM parameters case-insensitively", () => {
    expect(
      stripUtmParametersFromUrl(
        "https://pkspot.app/map?UTM_Source=sticker&foo=bar"
      )
    ).toBe("/map?foo=bar");
  });

  it("returns a clean path when the URL only contains UTM parameters", () => {
    expect(
      stripUtmParametersFromUrl(
        "https://pkspot.app/map?utm_source=sticker&utm_medium=qr"
      )
    ).toBe("/map");
  });
});

describe("AnalyticsService queued identity", () => {
  let service: AnalyticsService;

  const createPosthogMock = () => ({
    identify: vi.fn(),
    register: vi.fn(),
    people: {
      set: vi.fn(),
    },
  });

  const makeAnalyticsAvailable = (
    posthog: ReturnType<typeof createPosthogMock>,
  ) => {
    const internals = service as unknown as {
      _initialized: boolean;
      _posthog: typeof posthog;
      flushPendingUserIdentity: () => void;
    };
    internals._posthog = posthog;
    internals._initialized = true;
    internals.flushPendingUserIdentity();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: ConsentService,
          useValue: {
            hasConsent: vi.fn(() => true),
          },
        },
        {
          provide: Router,
          useValue: {
            events: NEVER,
            url: "/",
          },
        },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });

    service = TestBed.inject(AnalyticsService);
  });

  it("identifies a user after analytics becomes available", () => {
    const posthog = createPosthogMock();

    service.identifyUser("user-1", { email: "user@example.test" });
    makeAnalyticsAvailable(posthog);

    expect(posthog.identify).toHaveBeenCalledWith("user-1", {
      email: "user@example.test",
    });
    expect(posthog.register).toHaveBeenCalledWith({ authenticated: true });
  });

  it("merges queued user properties into a queued identity", () => {
    const posthog = createPosthogMock();

    service.identifyUser("user-1", { email: "old@example.test" });
    service.setUserProperties({
      display_name: "Profile Name",
      email: "new@example.test",
    });
    makeAnalyticsAvailable(posthog);

    expect(posthog.identify).toHaveBeenCalledWith("user-1", {
      email: "new@example.test",
      display_name: "Profile Name",
    });
  });

  it("clears a queued identity when the user signs out before analytics loads", () => {
    const posthog = createPosthogMock();

    service.identifyUser("user-1", { email: "user@example.test" });
    service.resetUser();
    makeAnalyticsAvailable(posthog);

    expect(posthog.identify).not.toHaveBeenCalled();
  });
});

describe("AnalyticsService native SDK metadata migration", () => {
  let service: AnalyticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: ConsentService,
          useValue: {
            hasConsent: vi.fn(() => true),
          },
        },
        {
          provide: Router,
          useValue: {
            events: NEVER,
            url: "/",
          },
        },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });

    service = TestBed.inject(AnalyticsService);
  });

  it("removes SDK metadata left behind by older native builds", async () => {
    const unregister = vi.mocked(CapacitorPostHog.unregister);
    unregister.mockResolvedValue();
    const internals = service as unknown as {
      clearLegacyNativeSdkProperties: () => Promise<void>;
    };

    await internals.clearLegacyNativeSdkProperties();

    expect(unregister).toHaveBeenCalledTimes(2);
    expect(unregister).toHaveBeenCalledWith({ key: "$lib" });
    expect(unregister).toHaveBeenCalledWith({ key: "$lib_version" });
  });

  it("does not forward caller-provided SDK metadata to the native SDK", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    const internals = service as unknown as {
      withRequiredNativeAnalyticsProperties: (
        properties?: Record<string, unknown>,
      ) => Record<string, unknown>;
    };

    const properties = internals.withRequiredNativeAnalyticsProperties({
      $lib: "capawesome-capacitor-posthog",
      $lib_version: "8.5.0",
      action: "open",
    });

    expect(properties).not.toHaveProperty("$lib");
    expect(properties).not.toHaveProperty("$lib_version");
    expect(properties["action"]).toBe("open");
  });
});

describe("AnalyticsService error reporting", () => {
  let service: AnalyticsService;
  let consentService: { hasConsent: ReturnType<typeof vi.fn> };

  const makeAvailable = (posthog: {
    captureException: ReturnType<typeof vi.fn>;
  }) => {
    const internals = service as unknown as {
      _initialized: boolean;
      _posthog: typeof posthog;
    };
    internals._initialized = true;
    internals._posthog = posthog;
  };

  beforeEach(() => {
    consentService = { hasConsent: vi.fn(() => true) };
    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        { provide: ConsentService, useValue: consentService },
        {
          provide: Router,
          useValue: {
            events: NEVER,
            url: "/sign-up",
          },
        },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });
    service = TestBed.inject(AnalyticsService);
  });

  it("captures a handled web exception with diagnostic properties", () => {
    const posthog = { captureException: vi.fn() };
    makeAvailable(posthog);
    const error = new Error("Safe failure summary");

    service.reportError(error, {
      context: "email_account_creation",
      feature: "authentication",
      handled: true,
      properties: { failure_stage: "firebase_auth" },
    });

    expect(posthog.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        error_context: "email_account_creation",
        error_feature: "authentication",
        error_handled: true,
        failure_stage: "firebase_auth",
      }),
    );
  });

  it("does not report exceptions without analytics consent", () => {
    consentService.hasConsent.mockReturnValue(false);
    const posthog = { captureException: vi.fn() };
    makeAvailable(posthog);

    service.reportError(new Error("Not sent"), {
      context: "email_account_creation",
    });

    expect(posthog.captureException).not.toHaveBeenCalled();
  });

  it("uses the native exception API instead of synthesizing an event", () => {
    vi.mocked(CapacitorPostHog.captureException).mockResolvedValue();
    const internals = service as unknown as {
      _initialized: boolean;
      isNative: () => boolean;
    };
    internals._initialized = true;
    internals.isNative = () => true;

    service.reportError(new Error("Safe native failure"), {
      context: "email_account_creation",
      properties: { failure_stage: "auth_profile" },
    });

    expect(CapacitorPostHog.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Error",
        message: "Safe native failure",
        properties: expect.objectContaining({
          error_context: "email_account_creation",
          failure_stage: "auth_profile",
        }),
      }),
    );
  });
});

describe("private session analytics URLs", () => {
  it.each(["https://pkspot.app/de/events/session/secret", "/events/session/secret", "/train/log/new?plannedSession=secret"])("redacts %s", url => {
    expect(redactPlanningUrl(url)).toBe("/events/sessions");
  });
  it("redacts private check-in record links", () => {
    expect(redactPlanningUrl("/train/log/new?sessionRecord=private-id")).toBe("/train/log/new");
  });
  it("preserves ordinary event and Spot URLs", () => {
    expect(redactPlanningUrl("/events/jam")).toBe("/events/jam");
    expect(redactPlanningUrl("/map/spots/abc")).toBe("/map/spots/abc");
  });
});
