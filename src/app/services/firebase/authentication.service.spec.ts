import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FirebaseApp } from "@angular/fire/app";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "@angular/fire/auth";
import { BehaviorSubject, Observable, of } from "rxjs";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { AnalyticsService } from "../analytics.service";
import { ConsentService } from "../consent.service";
import { UsersService } from "./firestore/users.service";
import { AuthenticationService } from "./authentication.service";

const authMock = vi.hoisted(() => ({
  currentUser: null as unknown,
  onAuthStateChanged: vi.fn(),
  setPersistence: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@angular/fire/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@angular/fire/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => authMock),
    signInWithEmailAndPassword: vi.fn(),
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
    sendEmailVerification: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    updateProfile: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  };
});

type FirebaseAuthStateCallback = (user: {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
  providerData?: Array<{ providerId: string }>;
  displayName?: string | null;
} | null) => void;

type ScreenshotGlobal = typeof globalThis & {
  __PKSPOT_SCREENSHOT_AUTH_USER__?: unknown;
};

const firebaseUser = {
  uid: "auth-user-1",
  email: "auth-user@example.test",
  emailVerified: true,
  displayName: "Auth User",
  providerData: [{ providerId: "password" }],
};

describe("AuthenticationService", () => {
  let service: AuthenticationService;
  let usersServiceSpy: {
    getUserById: Mock;
    addUser: Mock;
    initializePrivateData: Mock;
    deleteUser: Mock;
  };
  let consentServiceSpy: {
    hasConsent: Mock;
    executeWithConsent: Mock;
    executeWhenConsent: Mock;
    consentGranted$: Observable<boolean>;
  };
  let analyticsServiceSpy: {
    identifyUser: Mock;
    resetUser: Mock;
    trackEvent: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_AUTH_USER__;
    authMock.currentUser = null;
    authMock.setPersistence.mockResolvedValue(undefined);

    usersServiceSpy = {
      getUserById: vi.fn().mockReturnValue(of(null)),
      addUser: vi.fn().mockResolvedValue(undefined),
      initializePrivateData: vi.fn().mockResolvedValue(undefined),
      deleteUser: vi.fn().mockResolvedValue(undefined),
    };
    consentServiceSpy = {
      hasConsent: vi.fn(() => true),
      executeWithConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
      executeWhenConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
      consentGranted$: new BehaviorSubject<boolean>(true).asObservable(),
    };
    analyticsServiceSpy = {
      identifyUser: vi.fn(),
      resetUser: vi.fn(),
      trackEvent: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthenticationService,
        { provide: UsersService, useValue: usersServiceSpy },
        {
          provide: FirebaseApp,
          useValue: {
            name: "test-app",
            options: {},
            automaticDataCollectionEnabled: false,
          } satisfies Partial<FirebaseApp>,
        },
        { provide: ConsentService, useValue: consentServiceSpy },
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });

    service = TestBed.inject(AuthenticationService);
  });

  it("starts signed out until Firebase reports an auth state", () => {
    expect(service.isSignedIn).toBe(false);
    expect(service.isAdmin()).toBe(false);
    expect(service.user).toEqual({});
    expect(service.authState$.getValue()).toBeNull();
    expect(authMock.onAuthStateChanged).toHaveBeenCalled();
  });

  it("uses an injected store screenshot auth user without initializing Firebase auth", () => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_AUTH_USER__ = {
      uid: "store-screenshot-user",
      email: "screenshot@pkspot.app",
      emailVerified: true,
      providerId: "store-screenshot",
    };

    TestBed.configureTestingModule({
      providers: [
        AuthenticationService,
        { provide: UsersService, useValue: usersServiceSpy },
        {
          provide: FirebaseApp,
          useValue: {
            name: "test-app",
            options: {},
            automaticDataCollectionEnabled: false,
          } satisfies Partial<FirebaseApp>,
        },
        { provide: ConsentService, useValue: consentServiceSpy },
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });

    const screenshotService = TestBed.inject(AuthenticationService);

    expect(screenshotService.isSignedIn).toBe(true);
    expect(screenshotService.initialAuthStateResolved()).toBe(true);
    expect(screenshotService.authState$.getValue()).toEqual({
      uid: "store-screenshot-user",
      email: "screenshot@pkspot.app",
      emailVerified: true,
      providerId: "store-screenshot",
    });
    expect(authMock.onAuthStateChanged).not.toHaveBeenCalled();
  });

  it("signs in with email and password through Firebase Auth", async () => {
    (signInWithEmailAndPassword as Mock).mockResolvedValueOnce({
      user: firebaseUser,
    });

    await service.signInEmailPassword("auth-user@example.test", "secret");

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      service.auth,
      "auth-user@example.test",
      "secret",
    );
  });

  it("signs out through Firebase Auth", async () => {
    (signOut as Mock).mockResolvedValueOnce(undefined);

    await service.logUserOut();

    expect(signOut).toHaveBeenCalledWith(service.auth);
  });

  it("updates local auth state, analytics identity, profile data, and admin signal from auth listener", () => {
    const profile = { displayName: "Hydrated User", isAdmin: true };
    usersServiceSpy.getUserById.mockReturnValueOnce(of(profile));
    const authStateListener = authMock.onAuthStateChanged.mock
      .calls[0][0] as FirebaseAuthStateCallback;

    authStateListener(firebaseUser);

    expect(service.isSignedIn).toBe(true);
    expect(service.user.uid).toBe("auth-user-1");
    expect(service.user.email).toBe("auth-user@example.test");
    expect(service.user.emailVerified).toBe(true);
    expect(service.user.providerId).toBe("password");
    expect(service.user.data).toBe(profile);
    expect(service.isAdmin()).toBe(true);
    expect(service.authState$.getValue()).toBe(service.user);
    expect(usersServiceSpy.getUserById).toHaveBeenCalledWith("auth-user-1");
    expect(analyticsServiceSpy.identifyUser).toHaveBeenCalledWith(
      "auth-user-1",
      {
        email: "auth-user@example.test",
        display_name: "Auth User",
      },
    );
  });

  it("resets local auth state and analytics identity when Firebase signs out", () => {
    const profile = { displayName: "Admin User", isAdmin: true };
    usersServiceSpy.getUserById.mockReturnValueOnce(of(profile));
    const authStateListener = authMock.onAuthStateChanged.mock
      .calls[0][0] as FirebaseAuthStateCallback;

    authStateListener(firebaseUser);
    expect(service.isAdmin()).toBe(true);
    authStateListener(null);

    expect(service.isSignedIn).toBe(false);
    expect(service.user.uid).toBe("");
    expect(service.user.data).toBeUndefined();
    expect(service.isAdmin()).toBe(false);
    expect(service.authState$.getValue()).toBeNull();
    expect(analyticsServiceSpy.resetUser).toHaveBeenCalled();
  });

  it("creates an email account, profile document, private data, and verification email", async () => {
    const createdUser = {
      ...firebaseUser,
      uid: "created-user",
      email: "created@example.test",
      emailVerified: false,
    };
    (createUserWithEmailAndPassword as Mock).mockResolvedValueOnce({
      user: createdUser,
    });
    (updateProfile as Mock).mockResolvedValueOnce(undefined);
    (sendEmailVerification as Mock).mockResolvedValueOnce(undefined);

    await service.createAccount("created@example.test", "secret", "Created User");

    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      service.auth,
      "created@example.test",
      "secret",
    );
    expect(updateProfile).toHaveBeenCalledWith(createdUser, {
      displayName: "Created User",
    });
    expect(usersServiceSpy.addUser).toHaveBeenCalledWith(
      "created-user",
      "Created User",
      { verified_email: false },
    );
    expect(usersServiceSpy.initializePrivateData).toHaveBeenCalledWith(
      "created-user",
      { settings: { maps: "googlemaps" } },
    );
    expect(sendEmailVerification).toHaveBeenCalledWith(createdUser);
  });

  it("rejects duplicate account creation attempts while one is in progress", async () => {
    (createUserWithEmailAndPassword as Mock).mockReturnValueOnce(
      new Promise(() => undefined),
    );

    void service.createAccount("created@example.test", "secret", "Created User");

    await expect(
      service.createAccount("created@example.test", "secret", "Created User"),
    ).rejects.toThrow("Account creation is already in progress");
    expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
  });

  it("creates a profile for a new Google sign-in user", async () => {
    const googleUser = {
      ...firebaseUser,
      uid: "google-user",
      displayName: "Google User",
      providerData: [{ providerId: "google.com" }],
    };
    (signInWithPopup as Mock).mockResolvedValueOnce({ user: googleUser });
    usersServiceSpy.getUserById.mockReturnValueOnce(of(null));

    await service.signInGoogle();

    expect(signInWithPopup).toHaveBeenCalled();
    expect(usersServiceSpy.addUser).toHaveBeenCalledWith(
      "google-user",
      "Google User",
      { verified_email: true },
    );
    expect(usersServiceSpy.initializePrivateData).toHaveBeenCalledWith(
      "google-user",
      { settings: { maps: "googlemaps" } },
    );
  });

  it("does not overwrite an existing Google sign-in profile", async () => {
    const googleUser = {
      ...firebaseUser,
      uid: "google-user",
      displayName: "Google User",
      providerData: [{ providerId: "google.com" }],
    };
    (signInWithPopup as Mock).mockResolvedValueOnce({ user: googleUser });
    usersServiceSpy.getUserById.mockReturnValueOnce(
      of({ displayName: "Existing User" }),
    );

    await service.signInGoogle();

    expect(usersServiceSpy.addUser).not.toHaveBeenCalled();
    expect(usersServiceSpy.initializePrivateData).not.toHaveBeenCalled();
  });

  it("rejects duplicate Google sign-in attempts while one is in progress", async () => {
    (signInWithPopup as Mock).mockReturnValueOnce(
      new Promise(() => undefined),
    );

    void service.signInGoogle();

    await expect(service.signInGoogle()).rejects.toThrow(
      "Google sign-in is already in progress",
    );
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
  });

  it("sends verification email to the current Firebase user", async () => {
    (sendEmailVerification as Mock).mockResolvedValueOnce(undefined);
    const authStateListener = authMock.onAuthStateChanged.mock
      .calls[0][0] as FirebaseAuthStateCallback;
    authStateListener(firebaseUser);

    await service.resendVerificationEmail();

    expect(sendEmailVerification).toHaveBeenCalledWith(firebaseUser);
  });

  it("sends password reset emails through Firebase Auth", async () => {
    (sendPasswordResetEmail as Mock).mockResolvedValueOnce(undefined);

    await service.sendPasswordReset("reset@example.test");

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      service.auth,
      "reset@example.test",
    );
  });
});
