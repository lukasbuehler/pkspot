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
  getBoundAgeSignal: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => nativeState.isNative),
    getPlatform: vi.fn(() => "android"),
  },
  registerPlugin: vi.fn(() => ({
    getAgeSignal: nativeState.getAgeSignal,
    getBoundAgeSignal: nativeState.getBoundAgeSignal,
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
    nativeState.getBoundAgeSignal.mockResolvedValue({
      signal: nativeState.ageSignal,
      integrityToken: "integrity-token",
    });
    functionsAdapter = {
      callAuthenticatedAppChecked: vi
        .fn()
        .mockImplementation((name: string) =>
          name === "beginAgeAssuranceV3"
            ? Promise.resolve({
                challenge_id: "challenge-1",
                challenge_nonce: "nonce-1",
                platform: "android",
              })
            : Promise.resolve({
                ok: true,
                participation_state: "allowed",
                adult_eligibility: "not_verified",
                confidence: "corroborated",
              }),
        ),
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
    expect(nativeState.getBoundAgeSignal).toHaveBeenCalledWith({
      uid: "user-1",
      challengeId: "challenge-1",
      challengeNonce: "nonce-1",
    });
    expect(functionsAdapter.callAuthenticatedAppChecked).toHaveBeenNthCalledWith(
      2,
      "updateAgePolicyV3",
      expect.objectContaining({
        challenge_id: "challenge-1",
        challenge_nonce: "nonce-1",
        integrity_token: "integrity-token",
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
              assurance?: {
                status?: string;
                client_integrity?: string;
              };
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
      data: {
        age_policy: {
          adult_eligibility: "verified",
          assurance: {
            status: "active",
            client_integrity: "play_integrity_request_bound",
          },
        },
      },
    };
    expect(service.hasVerifiedAdultEligibility()).toBe(true);

    auth.user.data.data!.age_policy!.assurance!.status = "invalidated";
    expect(service.hasVerifiedAdultEligibility()).toBe(false);
  });
});
