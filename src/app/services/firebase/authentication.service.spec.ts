import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestBed } from "@angular/core/testing";
import { AuthenticationService } from "./authentication.service";
import { UsersService } from "./firestore/users.service";
import { FirebaseApp } from "@angular/fire/app";
import { of } from "rxjs";

// Define AuthServiceUser locally since it's not exported from the service
interface AuthServiceUser {
  uid?: string;
  email?: string;
  emailVerified?: boolean;
  data?: unknown;
}

// Mock Firebase Auth with partial mock
vi.mock("@angular/fire/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@angular/fire/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => ({
      onAuthStateChanged: vi.fn(),
      setPersistence: vi.fn().mockResolvedValue(undefined),
    })),
    signInWithEmailAndPassword: vi.fn(),
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
    sendEmailVerification: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    updateProfile: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  };
});

describe("AuthenticationService", () => {
  let service: AuthenticationService;
  let usersServiceSpy: {
    getUser: ReturnType<typeof vi.fn>;
    getUserById: ReturnType<typeof vi.fn>;
  };
  let firebaseAppMock: Partial<FirebaseApp>;

  beforeEach(() => {
    usersServiceSpy = {
      getUser: vi.fn().mockResolvedValue(null),
      getUserById: vi.fn().mockReturnValue(of(null)),
    };

    firebaseAppMock = {
      name: "test-app",
      options: {},
      automaticDataCollectionEnabled: false,
    };

    TestBed.configureTestingModule({
      providers: [
        AuthenticationService,
        { provide: UsersService, useValue: usersServiceSpy },
        { provide: FirebaseApp, useValue: firebaseAppMock },
      ],
    });

    service = TestBed.inject(AuthenticationService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  describe("Initial state", () => {
    it("should not be signed in initially", () => {
      expect(service.isSignedIn).toBe(false);
    });

    it("should have empty user initially", () => {
      expect(service.user).toEqual({});
    });

    it("should have null authState$ initially", () => {
      expect(service.authState$.getValue()).toBeNull();
    });
  });

  describe("AuthServiceUser type", () => {
    it("should have correct type structure", () => {
      const user: AuthServiceUser = {
        uid: "test-uid",
        email: "test@example.com",
        emailVerified: true,
        data: undefined,
      };

      expect(user.uid).toBe("test-uid");
      expect(user.email).toBe("test@example.com");
      expect(user.emailVerified).toBe(true);
    });

    it("should allow partial user object", () => {
      const user: AuthServiceUser = {};
      expect(user).toBeDefined();
    });
  });
});
