import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { NEVER } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentService } from "./consent.service";
import { AnalyticsService, stripUtmParametersFromUrl } from "./analytics.service";

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
