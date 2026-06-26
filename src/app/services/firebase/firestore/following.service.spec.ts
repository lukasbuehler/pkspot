import { TestBed } from "@angular/core/testing";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { AnalyticsService } from "../../analytics.service";
import { ConsentService } from "../../consent.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FollowingService } from "./following.service";

const createConsentService = () => ({
  executeWithConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
  executeWhenConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
  hasConsent: vi.fn(() => true),
  isSSR: vi.fn(() => false),
  isBrowser: vi.fn(() => true),
});

describe("FollowingService", () => {
  let service: FollowingService;
  let adapter: {
    setDocument: ReturnType<typeof vi.fn>;
    deleteDocument: ReturnType<typeof vi.fn>;
    getCollection: ReturnType<typeof vi.fn>;
    documentSnapshots: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    adapter = {
      setDocument: vi.fn().mockResolvedValue(undefined),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
      getCollection: vi.fn(),
      documentSnapshots: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        FollowingService,
        { provide: FirestoreAdapterService, useValue: adapter },
        { provide: ConsentService, useValue: createConsentService() },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
      ],
    });

    service = TestBed.inject(FollowingService);
  });

  it("creates a follow request under the target private profile", async () => {
    await service.requestToFollowUser(
      "requester",
      { display_name: "Requester" },
      "target",
    );

    expect(adapter.setDocument).toHaveBeenCalledWith(
      "users/target/follow_requests/requester",
      expect.objectContaining({
        display_name: "Requester",
        requested_at: expect.anything(),
        requested_at_raw_ms: expect.any(Number),
      }),
    );
  });

  it("cancels a pending follow request", async () => {
    await service.cancelFollowRequest("requester", "target");

    expect(adapter.deleteDocument).toHaveBeenCalledWith(
      "users/target/follow_requests/requester",
    );
  });

  it("approves a follow request by creating both follow edges and deleting the request", async () => {
    await service.approveFollowRequest(
      "target",
      { display_name: "Target" },
      { uid: "requester", display_name: "Requester" },
    );

    expect(adapter.setDocument).toHaveBeenNthCalledWith(
      1,
      "users/requester/following/target",
      expect.objectContaining({
        display_name: "Target",
        start_following: expect.anything(),
        start_following_raw_ms: expect.any(Number),
      }),
    );
    expect(adapter.setDocument).toHaveBeenNthCalledWith(
      2,
      "users/target/followers/requester",
      expect.objectContaining({
        display_name: "Requester",
        start_following: expect.anything(),
        start_following_raw_ms: expect.any(Number),
      }),
    );
    expect(adapter.deleteDocument).toHaveBeenCalledWith(
      "users/target/follow_requests/requester",
    );
  });

  it("sorts follow requests newest first and maps document ids to request uids", async () => {
    adapter.getCollection.mockResolvedValueOnce([
      {
        id: "old",
        display_name: "Old",
        requested_at_raw_ms: 1,
      },
      {
        id: "new",
        display_name: "New",
        requested_at_raw_ms: 2,
      },
    ]);

    const requests = await new Promise((resolve) => {
      service.getFollowRequestsForUser("target").subscribe(resolve);
    });

    expect(requests).toEqual([
      expect.objectContaining({ uid: "new", display_name: "New" }),
      expect.objectContaining({ uid: "old", display_name: "Old" }),
    ]);
  });
});
