import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Capacitor } from "@capacitor/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "./firebase/authentication.service";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { AgeAssuranceService } from "./age-assurance.service";
import type { PlatformAgeSignal } from "./age-policy";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const nativeState = vi.hoisted(() => ({
  isNative: true,
  platform: "android" as "android" | "ios" | "web",
  ageSignal: {
    platform: "android" as const,
    source: "android_play_age_signals" as const,
    available: true,
    ageLower: 13,
    ageUpper: 17,
    response: "shared" as const,
  } as PlatformAgeSignal,
  getAgeSignal: vi.fn(),
  getBoundAgeSignal: vi.fn(),
  openPlayStoreListing: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => nativeState.isNative),
    getPlatform: vi.fn(() => nativeState.platform),
  },
  registerPlugin: vi.fn(() => ({
    getAgeSignal: nativeState.getAgeSignal,
    getBoundAgeSignal: nativeState.getBoundAgeSignal,
    openPlayStoreListing: nativeState.openPlayStoreListing,
  })),
}));

describe("AgeAssuranceService", () => {
  let functionsAdapter: {
    callAuthenticatedAppChecked: ReturnType<typeof vi.fn>;
  };
  let authUser: { uid: string | null };

  beforeEach(() => {
    vi.clearAllMocks();
    nativeState.isNative = true;
    nativeState.platform = "android";
    nativeState.ageSignal = {
      platform: "android",
      source: "android_play_age_signals",
      available: true,
      ageLower: 13,
      ageUpper: 17,
      response: "shared",
    };
    nativeState.getAgeSignal.mockResolvedValue(nativeState.ageSignal);
    nativeState.getBoundAgeSignal.mockResolvedValue({
      signal: nativeState.ageSignal,
      integrityToken: "integrity-token",
    });
    nativeState.openPlayStoreListing.mockResolvedValue(undefined);
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
    authUser = { uid: "user-1" };

    TestBed.configureTestingModule({
      providers: [
        AgeAssuranceService,
        {
          provide: AuthenticationService,
          useValue: {
            user: authUser,
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
    expect(service.checkState().status).toBe("not_verified");
  });

  it("keeps automatic sync one-shot but allows a manual recheck", async () => {
    const service = TestBed.inject(AgeAssuranceService);

    await service.syncNativeAgePolicyForCurrentUser();
    await service.syncNativeAgePolicyForCurrentUser();
    expect(nativeState.getBoundAgeSignal).toHaveBeenCalledTimes(1);

    await service.recheckNativeAgePolicyForCurrentUser();
    expect(nativeState.getBoundAgeSignal).toHaveBeenCalledTimes(2);
  });

  it("syncs again when the same user signs back in", async () => {
    const service = TestBed.inject(AgeAssuranceService);

    await service.syncNativeAgePolicyForCurrentUser();
    authUser.uid = null;
    await service.syncNativeAgePolicyForCurrentUser();
    authUser.uid = "user-1";
    await service.syncNativeAgePolicyForCurrentUser();

    expect(nativeState.getBoundAgeSignal).toHaveBeenCalledTimes(2);
    expect(service.checkState()).toMatchObject({ uid: "user-1" });
  });

  it("does not request the iOS age range during automatic startup sync", async () => {
    nativeState.platform = "ios";
    nativeState.ageSignal = {
      platform: "ios",
      source: "ios_declared_age_range",
      available: true,
      ageLower: 18,
      response: "shared",
    };
    nativeState.getAgeSignal.mockResolvedValue(nativeState.ageSignal);
    const service = TestBed.inject(AgeAssuranceService);

    await service.syncNativeAgePolicyForCurrentUser();

    expect(nativeState.getAgeSignal).not.toHaveBeenCalled();
    expect(functionsAdapter.callAuthenticatedAppChecked).not.toHaveBeenCalled();
    expect(service.checkState().status).toBe("idle");

    await service.recheckNativeAgePolicyForCurrentUser();

    expect(nativeState.getAgeSignal).toHaveBeenCalledOnce();
    expect(functionsAdapter.callAuthenticatedAppChecked).toHaveBeenCalledWith(
      "updateAgePolicyV2",
      expect.objectContaining({
        signal: expect.objectContaining({
          platform: "ios",
          source: "ios_declared_age_range",
        }),
      }),
    );
  });

  it("clears iOS check state across sign-out and account switches", async () => {
    nativeState.platform = "ios";
    nativeState.ageSignal = {
      platform: "ios",
      source: "ios_declared_age_range",
      available: true,
      ageLower: 18,
      response: "shared",
    };
    nativeState.getAgeSignal.mockResolvedValue(nativeState.ageSignal);
    const service = TestBed.inject(AgeAssuranceService);

    await service.recheckNativeAgePolicyForCurrentUser();
    expect(service.checkState().uid).toBe("user-1");

    authUser.uid = null;
    await service.syncNativeAgePolicyForCurrentUser();
    expect(service.checkState()).toEqual({ status: "idle" });

    authUser.uid = "user-2";
    await service.syncNativeAgePolicyForCurrentUser();
    expect(service.checkState()).toEqual({
      status: "idle",
      uid: "user-2",
      platform: "ios",
    });
    expect(nativeState.getAgeSignal).toHaveBeenCalledOnce();
  });

  it("does not reuse or apply an iOS sync after its user signs out", async () => {
    nativeState.platform = "ios";
    const userOneSignal = {
      platform: "ios",
      source: "ios_declared_age_range",
      available: true,
      ageLower: 18,
      response: "shared",
    } satisfies PlatformAgeSignal;
    const userTwoSignal = {
      ...userOneSignal,
      ageLower: 13,
      ageUpper: 17,
    } satisfies PlatformAgeSignal;
    const pendingUserOneSignal = deferred<PlatformAgeSignal>();
    nativeState.getAgeSignal
      .mockReturnValueOnce(pendingUserOneSignal.promise)
      .mockResolvedValueOnce(userTwoSignal);
    const service = TestBed.inject(AgeAssuranceService);

    const userOneSync = service.recheckNativeAgePolicyForCurrentUser();
    await vi.waitFor(() => expect(nativeState.getAgeSignal).toHaveBeenCalledOnce());

    authUser.uid = null;
    await service.syncNativeAgePolicyForCurrentUser();
    authUser.uid = "user-2";
    await service.recheckNativeAgePolicyForCurrentUser();

    pendingUserOneSignal.resolve(userOneSignal);
    await userOneSync;

    expect(nativeState.getAgeSignal).toHaveBeenCalledTimes(2);
    expect(service.checkState()).toMatchObject({
      uid: "user-2",
      status: "not_verified",
    });
  });

  it("keeps automatic iOS state scoped across A to B to A switches", async () => {
    nativeState.platform = "ios";
    nativeState.ageSignal = {
      platform: "ios",
      source: "ios_declared_age_range",
      available: true,
      ageLower: 18,
      response: "shared",
    };
    nativeState.getAgeSignal.mockResolvedValue(nativeState.ageSignal);
    const service = TestBed.inject(AgeAssuranceService);

    await service.recheckNativeAgePolicyForCurrentUser();
    authUser.uid = "user-2";
    await service.syncNativeAgePolicyForCurrentUser();
    expect(service.checkState()).toEqual({
      status: "idle",
      uid: "user-2",
      platform: "ios",
    });

    authUser.uid = "user-1";
    await service.syncNativeAgePolicyForCurrentUser();

    expect(service.checkState()).toEqual({
      status: "idle",
      uid: "user-1",
      platform: "ios",
    });
    expect(nativeState.getAgeSignal).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "self_declared",
      {
        ageSignalsStatus: "shared",
        response: "shared",
        ageRangeSource: "tier_a",
        ageLower: 18,
      },
    ],
    [
      "not_shared",
      { ageSignalsStatus: "not_shared", response: "declined" },
    ],
    [
      "verification_required",
      {
        ageSignalsStatus: "verification_required",
        response: "unavailable",
      },
    ],
  ] as const)("reports the %s Google Play outcome", async (status, changes) => {
    nativeState.ageSignal = {
      platform: "android",
      source: "android_play_age_signals",
      available: true,
      ...changes,
    } as PlatformAgeSignal;
    nativeState.getBoundAgeSignal.mockResolvedValue({
      signal: nativeState.ageSignal,
      integrityToken: "integrity-token",
    });
    const service = TestBed.inject(AgeAssuranceService);

    await service.syncNativeAgePolicyForCurrentUser();

    expect(service.checkState().status).toBe(status);
  });

  it("uses the server-confirmed result for immediate adult eligibility", async () => {
    functionsAdapter.callAuthenticatedAppChecked.mockImplementation(
      (name: string) =>
        name === "beginAgeAssuranceV3"
          ? Promise.resolve({
              challenge_id: "challenge-1",
              challenge_nonce: "nonce-1",
              platform: "android",
            })
          : Promise.resolve({
              ok: true,
              participation_state: "allowed",
              adult_eligibility: "verified",
              evaluated_at: "2026-08-01T10:00:00.000Z",
            }),
    );
    const service = TestBed.inject(AgeAssuranceService);

    await service.syncNativeAgePolicyForCurrentUser();

    expect(service.checkState()).toMatchObject({
      status: "verified",
      checkedAt: "2026-08-01T10:00:00.000Z",
    });
    expect(service.hasVerifiedAdultEligibility()).toBe(true);
  });

  it("exposes native failures as a retryable error", async () => {
    nativeState.getBoundAgeSignal.mockRejectedValue(new Error("unavailable"));
    const service = TestBed.inject(AgeAssuranceService);

    await service.syncNativeAgePolicyForCurrentUser();

    expect(service.checkState().status).toBe("error");
  });

  it("opens the native Google Play listing on Android", async () => {
    const service = TestBed.inject(AgeAssuranceService);

    await service.openPlayStoreListing();

    expect(nativeState.openPlayStoreListing).toHaveBeenCalledOnce();
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
