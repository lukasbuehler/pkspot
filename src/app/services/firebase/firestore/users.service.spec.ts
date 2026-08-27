import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { User } from "../../../../db/models/User";
import { AnalyticsService } from "../../analytics.service";
import { ConsentService } from "../../consent.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { UsersService } from "./users.service";

const createConsentService = () => ({
  executeWithConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
  executeWhenConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
  hasConsent: vi.fn(() => true),
  isSSR: vi.fn(() => false),
  isBrowser: vi.fn(() => true),
});

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_USER_PROFILES__?: Record<string, unknown>;
}

describe("UsersService", () => {
  let service: UsersService;
  let adapter: {
    getDocument: ReturnType<typeof vi.fn>;
    setDocument: ReturnType<typeof vi.fn>;
    updateDocument: ReturnType<typeof vi.fn>;
    deleteDocument: ReturnType<typeof vi.fn>;
    documentSnapshots: ReturnType<typeof vi.fn>;
  };
  let functions: {
    callPublic: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    adapter = {
      getDocument: vi.fn(),
      setDocument: vi.fn(),
      updateDocument: vi.fn(),
      deleteDocument: vi.fn(),
      documentSnapshots: vi.fn(),
    };
    functions = {
      callPublic: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        UsersService,
        { provide: FirestoreAdapterService, useValue: adapter },
        { provide: FunctionsAdapterService, useValue: functions },
        { provide: ConsentService, useValue: createConsentService() },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
      ],
    });

    service = TestBed.inject(UsersService);
  });

  afterEach(() => {
    delete (globalThis as ScreenshotGlobal)
      .__PKSPOT_SCREENSHOT_USER_PROFILES__;
  });

  it("creates new accounts with one consistent private profile choice", async () => {
    await service.addUser("new-user", "New Traceur", {});

    expect(adapter.setDocument).toHaveBeenCalledWith(
      "users/new-user",
      expect.objectContaining({
        account_privacy: "private",
        profile_visibility: "followers",
        public_profile_enabled: false,
        public_search: false,
      }),
    );
  });

  it("reports which account setup documents already exist", async () => {
    adapter.getDocument
      .mockResolvedValueOnce({ display_name: "Existing" })
      .mockResolvedValueOnce(null);

    await expect(service.getAccountSetupState("existing-user")).resolves.toEqual({
      publicProfileExists: true,
      privateDataExists: false,
    });
    expect(adapter.getDocument).toHaveBeenNthCalledWith(
      1,
      "users/existing-user",
    );
    expect(adapter.getDocument).toHaveBeenNthCalledWith(
      2,
      "users/existing-user/private_data/main",
    );
  });

  it("uses the deterministic screenshot profile without reading Firestore", async () => {
    (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_USER_PROFILES__ = {
      "visual-user": {
        display_name: "Visual User",
        verified_email: true,
      },
    };

    const user = await new Promise<User | null>((resolve) => {
      service.getUserById("visual-user").subscribe(resolve);
    });

    expect(user?.displayName).toBe("Visual User");
    expect(adapter.documentSnapshots).not.toHaveBeenCalled();
  });

  it("loads a user once through the Firestore adapter", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    adapter.getDocument.mockResolvedValueOnce({
      id: "user-123",
      display_name: "Traceur",
      verified_email: false,
    });

    const user = await service.getUserByIdOnce("user-123");

    expect(user).toBeInstanceOf(User);
    expect(user?.uid).toBe("user-123");
    expect(adapter.getDocument).toHaveBeenCalledWith("users/user-123");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns null from one-shot lookup when the user id is empty", async () => {
    await expect(service.getUserByIdOnce("")).resolves.toBeNull();
    expect(adapter.getDocument).not.toHaveBeenCalled();
  });

  it("returns null from one-shot lookup when the adapter misses", async () => {
    adapter.getDocument.mockResolvedValueOnce(null);

    await expect(service.getUserByIdOnce("missing-user")).resolves.toBeNull();
    expect(adapter.getDocument).toHaveBeenCalledWith("users/missing-user");
  });

  it("loads a viewer-redacted profile through the callable boundary", async () => {
    functions.callPublic.mockResolvedValue({
      uid: "private-user",
      display_name: "Private Traceur",
      account_privacy: "private",
      profile_visibility: "followers",
      public_profile_enabled: false,
      public_search: false,
      profile_access: "limited",
    });

    const user = await service.getAccessibleUserProfile("private-user");

    expect(functions.callPublic).toHaveBeenCalledWith("getUserProfile", {
      user_id: "private-user",
    });
    expect(user?.displayName).toBe("Private Traceur");
    expect(user?.biography).toBe("");
    expect(user?.profilePicture).toBeNull();
  });

  it("reads SEO profiles only from the server-owned public collection", async () => {
    adapter.getDocument.mockResolvedValue({
      id: "public-user",
      display_name: "Public Traceur",
      public_profile_enabled: true,
      public_search: true,
      profile_access: "full",
      profile_projection_version: 1,
    });

    const user = await service.getPublicUserProfileByIdOnce("public-user");

    expect(adapter.getDocument).toHaveBeenCalledWith(
      "public_user_profiles/public-user"
    );
    expect(user?.displayName).toBe("Public Traceur");
  });

  it("moves an event between the private Going and Saved indexes", async () => {
    adapter.getDocument.mockResolvedValue({
      going_events: ["event-1", "event-2"],
      saved_events: ["event-3"],
    });

    await service.updateEventRelationship("user-1", "event-1", "saved");

    expect(adapter.setDocument).toHaveBeenCalledWith(
      "users/user-1/private_data/main",
      {
        going_events: ["event-2"],
        saved_events: ["event-3", "event-1"],
      },
      { merge: true },
    );
  });
});
