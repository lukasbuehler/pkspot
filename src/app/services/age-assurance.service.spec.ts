import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Capacitor } from "@capacitor/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "./firebase/authentication.service";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { AgeAssuranceService } from "./age-assurance.service";

const nativeState = vi.hoisted(() => ({
  isNative: true,
  ageSignal: {
    platform: "android" as const,
    source: "android_play_age_signals" as const,
    available: true,
    ageLower: 13,
    ageUpper: 17,
    response: "shared" as const,
  },
  getAgeSignal: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => nativeState.isNative),
  },
  registerPlugin: vi.fn(() => ({
    getAgeSignal: nativeState.getAgeSignal,
  })),
}));

describe("AgeAssuranceService", () => {
  let functionsAdapter: {
    callAuthenticatedAppChecked: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    nativeState.isNative = true;
    nativeState.getAgeSignal.mockResolvedValue(nativeState.ageSignal);
    functionsAdapter = {
      callAuthenticatedAppChecked: vi.fn().mockResolvedValue({
        ok: true,
        participation_state: "allowed",
        adult_eligibility: "not_verified",
        evidence_strength: "guardian_managed",
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        AgeAssuranceService,
        {
          provide: AuthenticationService,
          useValue: {
            user: { uid: "user-1" },
          },
        },
        { provide: FunctionsAdapterService, useValue: functionsAdapter },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });
  });

  it("syncs native age policy through the Functions adapter", async () => {
    const service = TestBed.inject(AgeAssuranceService);

    await service.syncNativeAgePolicyForCurrentUser();

    expect(Capacitor.isNativePlatform).toHaveBeenCalled();
    expect(nativeState.getAgeSignal).toHaveBeenCalled();
    expect(functionsAdapter.callAuthenticatedAppChecked).toHaveBeenCalledWith(
      "updateAgePolicyV2",
      expect.objectContaining({
        signal: expect.objectContaining({
          platform: "android",
          source: "android_play_age_signals",
          available: true,
          ageLower: 13,
          ageUpper: 17,
          response: "shared",
        }),
      }),
    );
  });

  it("only treats a server-verified adult eligibility result as verified", () => {
    const service = TestBed.inject(AgeAssuranceService);
    const auth = TestBed.inject(AuthenticationService) as unknown as {
      user: {
        data?: {
          data?: {
            age_policy?: {
              adult_eligibility?: "verified" | "not_verified";
            };
          };
        };
      };
    };

    auth.user.data = {
      data: { age_policy: { adult_eligibility: "not_verified" } },
    };
    expect(service.hasVerifiedAdultEligibility()).toBe(false);

    auth.user.data = {
      data: { age_policy: { adult_eligibility: "verified" } },
    };
    expect(service.hasVerifiedAdultEligibility()).toBe(true);
  });
});
