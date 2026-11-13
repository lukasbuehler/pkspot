import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { NEVER } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "../../environments/environment.default";
import { ConsentService } from "./consent.service";
import {
  AnalyticsService,
  PERSISTENT_ANALYTICS_STORAGE_KEY,
  stripUtmParametersFromUrl,
  redactPlanningUrl,
} from "./analytics.service";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  register: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  set_config: vi.fn(),
  get_distinct_id: vi.fn(() => "anon-1"),
  people: { set: vi.fn() },
}));

vi.mock("posthog-js", () => ({ default: posthogMock }));

function configure(platform = "browser") {
  TestBed.configureTestingModule({
    providers: [
      AnalyticsService,
      { provide: ConsentService, useValue: { hasConsent: () => true } },
      { provide: Router, useValue: { events: NEVER, url: "/map" } },
      { provide: PLATFORM_ID, useValue: platform },
    ],
  });
  const service = TestBed.inject(AnalyticsService);
  const internals = service as unknown as { isLocalhost: () => boolean; isNative: () => boolean };
  vi.spyOn(internals, "isLocalhost").mockReturnValue(false);
  vi.spyOn(internals, "isNative").mockReturnValue(false);
  return { service, internals };
}

describe("AnalyticsService privacy and startup", () => {
  const originalConfig = environment.keys.posthog;
  let service: AnalyticsService;
  let internals: { isNative: () => boolean };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    environment.keys.posthog = { apiKey: "phc_test", host: "https://analytics.invalid" };
    ({ service, internals } = configure());
  });

  afterEach(() => {
    environment.keys.posthog = originalConfig;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("keeps analytics in memory and deletes stored analytics data by default", async () => {
    localStorage.setItem("ph_distinct_id_v1", "old-id");
    localStorage.setItem("ph_phc_test_posthog", "{}");
    localStorage.setItem("ph_initial_referrer_v1", "https://example.test");
    sessionStorage.setItem("ph_sticker_scan_sent_v1:nice-spot-v1", "1");
    localStorage.setItem("acceptedVersion", "7");

    await service.init();

    const config = posthogMock.init.mock.calls[0][1];
    expect(config.persistence).toBe("memory");
    expect(config.bootstrap).toBeUndefined();
    config.loaded(posthogMock);
    expect(Object.keys(localStorage)).toEqual(["acceptedVersion"]);
    expect(sessionStorage.length).toBe(0);
    expect(service.persistentAnalytics()).toBe(false);
  });

  it("remembers the device after the visitor opts in", async () => {
    localStorage.setItem(PERSISTENT_ANALYTICS_STORAGE_KEY, "granted");
    localStorage.setItem("ph_distinct_id_v1", "known-id");

    await service.init();

    const config = posthogMock.init.mock.calls[0][1];
    expect(config.persistence).toBe("localStorage");
    expect(config.bootstrap).toEqual({ distinctID: "known-id", isIdentifiedID: false });
  });

  it("links a signed-in user to analytics only with persistent analytics", async () => {
    await service.init();
    service.identifyUser("user-1", { email: "user@example.test" });
    expect(posthogMock.identify).not.toHaveBeenCalled();
    expect(posthogMock.register).toHaveBeenCalledWith({ authenticated: true });

    service.setPersistentAnalytics(true);
    expect(localStorage.getItem(PERSISTENT_ANALYTICS_STORAGE_KEY)).toBe("granted");
    expect(posthogMock.set_config).toHaveBeenCalledWith({ persistence: "localStorage" });
    expect(localStorage.getItem("ph_distinct_id_v1")).toBe("anon-1");
    expect(posthogMock.identify).toHaveBeenCalledWith("user-1", { email: "user@example.test" });
  });

  it("forgets the identity and stored data when persistent analytics is turned off", async () => {
    localStorage.setItem(PERSISTENT_ANALYTICS_STORAGE_KEY, "granted");
    await service.init();
    localStorage.setItem("ph_distinct_id_v1", "known-id");

    service.setPersistentAnalytics(false);

    expect(posthogMock.reset).toHaveBeenCalled();
    expect(posthogMock.set_config).toHaveBeenCalledWith({ persistence: "memory" });
    expect(localStorage.getItem("ph_distinct_id_v1")).toBeNull();
    expect(localStorage.getItem(PERSISTENT_ANALYTICS_STORAGE_KEY)).toBeNull();
    expect(service.persistentAnalytics()).toBe(false);
  });

  it("captures the initial native screen with the web SDK after initialization", async () => {
    vi.mocked(internals.isNative).mockReturnValue(true);
    await service.init();

    expect(posthogMock.capture).toHaveBeenCalledWith("$screen", expect.objectContaining({
      $screen_name: "https://pkspot.app/map",
    }));
    expect(posthogMock.capture).toHaveBeenCalledWith("$pageview", expect.objectContaining({
      path: "/map",
    }));
    posthogMock.capture.mockClear();
    service.trackScreen("/map");
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("does not treat a false GPC signal as an opt-out", async () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: false });
    await service.init();
    expect(service.isAvailable()).toBe(true);
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
    const ssrInternals = TestBed.inject(AnalyticsService) as unknown as {
      hasGlobalPrivacyControl: () => boolean;
    };
    expect(ssrInternals.hasGlobalPrivacyControl()).toBe(false);
    expect(readGpc).not.toHaveBeenCalled();
  });

  it("drops web SDK events at the send hook when GPC is active", () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    const hooks = service as unknown as {
      processEventBeforeSend: (event: unknown) => unknown;
    };
    expect(hooks.processEventBeforeSend({ event: "$pageview", properties: {} })).toBeNull();
  });

  it.each([true, false])("does not initialize analytics with GPC enabled (native=%s)", async (native) => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    vi.mocked(internals.isNative).mockReturnValue(native);

    await service.init();

    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(service.isAvailable()).toBe(false);
  });

  it("blocks captures if GPC becomes active after startup", async () => {
    vi.mocked(internals.isNative).mockReturnValue(true);
    await service.init();
    posthogMock.capture.mockClear();
    vi.stubGlobal("navigator", { globalPrivacyControl: true });

    service.trackScreen("/events");
    service.trackEvent("$pageview");

    expect(posthogMock.capture).not.toHaveBeenCalled();
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
      _persistent: { set: (value: boolean) => void };
      flushPendingUserIdentity: () => void;
    };
    internals._persistent.set(true);
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
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
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
