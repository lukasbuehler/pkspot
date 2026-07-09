import { TestBed } from "@angular/core/testing";
import { FirebaseApp } from "@angular/fire/app";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PlatformService } from "../platform.service";
import { FunctionsAdapterService } from "./functions-adapter.service";

vi.mock("@angular/fire/functions", () => ({
  Functions: class Functions {},
  httpsCallable: vi.fn(),
}));

vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    getIdToken: vi.fn(),
  },
}));

describe("FunctionsAdapterService", () => {
  let platformService: { isNative: ReturnType<typeof vi.fn> };
  let fetchMock: Mock;
  const functionsInstance = {};

  beforeEach(() => {
    vi.clearAllMocks();
    platformService = {
      isNative: vi.fn(() => false),
    };
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ result: { ok: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.removeItem("pkspot:e2e:firebaseEmulators");

    TestBed.configureTestingModule({
      providers: [
        FunctionsAdapterService,
        { provide: Functions, useValue: functionsInstance },
        {
          provide: FirebaseApp,
          useValue: {
            options: {
              projectId: "parkour-base-project",
            },
          } satisfies Partial<FirebaseApp>,
        },
        { provide: PlatformService, useValue: platformService },
      ],
    });
  });

  it("delegates web callable requests to AngularFire Functions", async () => {
    const callable = vi.fn().mockResolvedValue({ data: { ok: true } });
    vi.mocked(httpsCallable).mockReturnValue(callable);
    const service = TestBed.inject(FunctionsAdapterService);

    const result = await service.call<{ value: number }, { ok: boolean }>(
      "doThing",
      { value: 1 },
    );

    expect(httpsCallable).toHaveBeenCalledWith(functionsInstance, "doThing");
    expect(callable).toHaveBeenCalledWith({ value: 1 });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends native callable requests with the native Firebase auth token", async () => {
    platformService.isNative.mockReturnValue(true);
    vi.mocked(FirebaseAuthentication.getIdToken).mockResolvedValue({
      token: "native-id-token",
    });
    const service = TestBed.inject(FunctionsAdapterService);

    const result = await service.call<{ value: number }, { ok: boolean }>(
      "doThing",
      { value: 1 },
    );

    expect(FirebaseAuthentication.getIdToken).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://europe-west1-parkour-base-project.cloudfunctions.net/doThing",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer native-id-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: { value: 1 } }),
      },
    );
    expect(result).toEqual({ ok: true });
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it("surfaces native callable error messages", async () => {
    platformService.isNative.mockReturnValue(true);
    vi.mocked(FirebaseAuthentication.getIdToken).mockResolvedValue({
      token: "native-id-token",
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({
        error: {
          status: "UNAUTHENTICATED",
          message: "Authentication is required",
        },
      }),
    });
    const service = TestBed.inject(FunctionsAdapterService);

    await expect(service.call("doThing", {})).rejects.toThrow(
      "doThing failed: UNAUTHENTICATED - Authentication is required",
    );
  });
});
