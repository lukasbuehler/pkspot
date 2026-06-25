import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { User } from "../../../../db/models/User";
import { AnalyticsService } from "../../analytics.service";
import { ConsentService } from "../../consent.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { UsersService } from "./users.service";

const createConsentService = () => ({
  executeWithConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
  executeWhenConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
  hasConsent: vi.fn(() => true),
  isSSR: vi.fn(() => false),
  isBrowser: vi.fn(() => true),
});

describe("UsersService", () => {
  let service: UsersService;
  let adapter: {
    getDocument: ReturnType<typeof vi.fn>;
    setDocument: ReturnType<typeof vi.fn>;
    updateDocument: ReturnType<typeof vi.fn>;
    deleteDocument: ReturnType<typeof vi.fn>;
    documentSnapshots: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    adapter = {
      getDocument: vi.fn(),
      setDocument: vi.fn(),
      updateDocument: vi.fn(),
      deleteDocument: vi.fn(),
      documentSnapshots: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        UsersService,
        { provide: FirestoreAdapterService, useValue: adapter },
        { provide: ConsentService, useValue: createConsentService() },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
      ],
    });

    service = TestBed.inject(UsersService);
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
});
