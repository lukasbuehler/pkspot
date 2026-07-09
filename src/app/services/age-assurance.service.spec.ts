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
  let functionsAdapter: { call: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    nativeState.isNative = true;
    nativeState.getAgeSignal.mockResolvedValue(nativeState.ageSignal);
    functionsAdapter = {
      call: vi.fn().mockResolvedValue({ ok: true }),
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
    expect(functionsAdapter.call).toHaveBeenCalledWith(
      "updateAgePolicy",
      expect.objectContaining({
        policy: expect.objectContaining({
          participation_state: "allowed",
          source: "android_play_age_signals",
          platform: "android",
          age_range: {
            lower: 13,
            upper: 17,
          },
        }),
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
});
