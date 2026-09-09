import { TestBed } from "@angular/core/testing";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { RestoreCredentialsService } from "./restore-credentials.service";

const capacitor = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
}));
const nativeRestoreCredentials = vi.hoisted(() => ({
  createRestoreCredential: vi.fn(),
  getRestoreCredential: vi.fn(),
  clearRestoreCredential: vi.fn(),
}));
const firebaseAuthentication = vi.hoisted(() => ({
  signInWithCustomToken: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: capacitor,
  registerPlugin: vi.fn(() => nativeRestoreCredentials),
}));

vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: firebaseAuthentication,
}));

describe("RestoreCredentialsService", () => {
  const functions = {
    callUnauthenticated: vi.fn(),
    callAuthenticatedAppChecked: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    capacitor.isNativePlatform.mockReturnValue(true);
    capacitor.getPlatform.mockReturnValue("android");
    nativeRestoreCredentials.getRestoreCredential.mockResolvedValue({
      authenticationResponseJson: "authentication-json",
    });
    nativeRestoreCredentials.createRestoreCredential.mockResolvedValue({
      registrationResponseJson: "registration-json",
      cloudBackupEnabled: true,
    });
    firebaseAuthentication.signInWithCustomToken.mockResolvedValue({});
    functions.callUnauthenticated
      .mockResolvedValueOnce({
        challenge_id: "restore-auth-challenge",
        request_json: "authentication-request-json",
      })
      .mockResolvedValueOnce({
        firebase_custom_token: "custom-token",
      });
    functions.callAuthenticatedAppChecked
      .mockResolvedValueOnce({
        challenge_id: "restore-registration-challenge",
        request_json: "registration-request-json",
      })
      .mockResolvedValueOnce({ ok: true });

    TestBed.configureTestingModule({
      providers: [
        RestoreCredentialsService,
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });
  });

  it("restores a signed-out Android session without a picker or account chooser", async () => {
    const service = TestBed.inject(RestoreCredentialsService);

    await service.restoreSignedOutSession();

    expect(functions.callUnauthenticated).toHaveBeenNthCalledWith(
      1,
      "beginRestoreCredentialAuthentication",
      {},
    );
    expect(nativeRestoreCredentials.getRestoreCredential).toHaveBeenCalledWith({
      requestJson: "authentication-request-json",
    });
    expect(functions.callUnauthenticated).toHaveBeenNthCalledWith(
      2,
      "finishRestoreCredentialAuthentication",
      {
        challenge_id: "restore-auth-challenge",
        credential_response_json: "authentication-json",
      },
    );
    expect(FirebaseAuthentication.signInWithCustomToken).toHaveBeenCalledWith({
      token: "custom-token",
    });
  });

  it("does not surface a missing restore credential as a sign-in failure", async () => {
    nativeRestoreCredentials.getRestoreCredential.mockRejectedValueOnce({
      code: "RESTORE_CREDENTIAL_GET_FAILED",
    });
    const service = TestBed.inject(RestoreCredentialsService);

    await expect(service.restoreSignedOutSession()).resolves.toBeUndefined();

    expect(FirebaseAuthentication.signInWithCustomToken).not.toHaveBeenCalled();
  });

  it("provisions once after an explicit action and clears its marker on sign-out", async () => {
    const service = TestBed.inject(RestoreCredentialsService);

    await service.provisionAfterUserAction("user-1");
    await service.provisionAfterUserAction("user-1");

    expect(nativeRestoreCredentials.createRestoreCredential).toHaveBeenCalledOnce();
    expect(functions.callAuthenticatedAppChecked).toHaveBeenCalledTimes(2);
    await service.clearForSignedOutUser("user-1");
    expect(nativeRestoreCredentials.clearRestoreCredential).toHaveBeenCalledOnce();

    functions.callAuthenticatedAppChecked
      .mockResolvedValueOnce({
        challenge_id: "restore-registration-challenge-2",
        request_json: "registration-request-json-2",
      })
      .mockResolvedValueOnce({ ok: true });
    await service.provisionAfterUserAction("user-1");
    expect(nativeRestoreCredentials.createRestoreCredential).toHaveBeenCalledTimes(2);
  });

  it("leaves web and iOS sign-in flows untouched", async () => {
    capacitor.getPlatform.mockReturnValue("ios");
    const service = TestBed.inject(RestoreCredentialsService);

    await service.restoreSignedOutSession();
    await service.provisionAfterUserAction("user-1");

    expect(functions.callUnauthenticated).not.toHaveBeenCalled();
    expect(functions.callAuthenticatedAppChecked).not.toHaveBeenCalled();
  });
});
