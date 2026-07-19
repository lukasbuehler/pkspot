import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { Posthog as CapacitorPostHog } from "@capawesome/capacitor-posthog";
import { NEVER } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentService } from "./consent.service";
import { AnalyticsService, stripUtmParametersFromUrl } from "./analytics.service";

const capacitorPostHogMock = vi.hoisted(() => ({
  unregister: vi.fn(),
}));

vi.mock("@capawesome/capacitor-posthog", () => ({
  Posthog: capacitorPostHogMock,
}));

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
