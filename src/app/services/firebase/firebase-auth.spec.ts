import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseApp } from "firebase/app";
import {
  type Auth,
  browserPopupRedirectResolver,
  getAuth,
  initializeAuth,
} from "firebase/auth";
import { _getInstance } from "@firebase/auth/internal";
import { getFirebaseAuth, preloadPopupSignIn } from "./firebase-auth";

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: { type: "local" },
  browserPopupRedirectResolver: class {},
  browserSessionPersistence: { type: "session" },
  getAuth: vi.fn(),
  indexedDBLocalPersistence: { type: "indexedDB" },
  initializeAuth: vi.fn(),
}));

vi.mock("@firebase/auth/internal", () => ({ _getInstance: vi.fn() }));

describe("firebase auth setup", () => {
  const app = {} as FirebaseApp;
  const auth = {} as Auth;

  beforeEach(() => vi.clearAllMocks());

  it("keeps getAuth's persistence but leaves the popup helper out of startup", () => {
    vi.mocked(initializeAuth).mockReturnValue(auth);

    expect(getFirebaseAuth(app)).toBe(auth);

    const options = vi.mocked(initializeAuth).mock.calls[0][1]!;
    expect(options.popupRedirectResolver).toBeUndefined();
    expect(options.persistence).toEqual([
      { type: "indexedDB" },
      { type: "local" },
      { type: "session" },
    ]);
  });

  it("reuses an instance that was initialized with other options", () => {
    vi.mocked(initializeAuth).mockImplementation(() => {
      throw Object.assign(new Error(), { code: "auth/already-initialized" });
    });
    vi.mocked(getAuth).mockReturnValue(auth);

    expect(getFirebaseAuth(app)).toBe(auth);
  });

  it("rethrows other initialization errors", () => {
    const failure = Object.assign(new Error(), { code: "auth/invalid-api-key" });
    vi.mocked(initializeAuth).mockImplementation(() => {
      throw failure;
    });

    expect(() => getFirebaseAuth(app)).toThrow(failure);
  });

  it("preloads the same resolver instance that popup sign-in uses", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined);
    vi.mocked(_getInstance).mockReturnValue({ _initialize: initialize });

    await preloadPopupSignIn(auth);

    expect(_getInstance).toHaveBeenCalledWith(browserPopupRedirectResolver);
    expect(initialize).toHaveBeenCalledWith(auth);
  });
});
