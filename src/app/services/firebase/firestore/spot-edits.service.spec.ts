import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeoPoint } from "firebase/firestore";
import { SpotEditSchema } from "../../../../db/schemas/SpotEditSchema";
import { AnalyticsService } from "../../analytics.service";
import { ConsentService } from "../../consent.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { SpotEditsService } from "./spot-edits.service";
import { UsersService } from "./users.service";

const createMockFirestoreAdapter = () => ({
  createDocumentId: vi.fn().mockReturnValue("generated-spot-id"),
  addDocument: vi.fn(),
  setDocument: vi.fn().mockResolvedValue(undefined),
  getDocument: vi.fn().mockResolvedValue({}),
  getCollectionGroupWithMetadata: vi.fn(),
});

const createMockConsentService = () => ({
  hasConsent: vi.fn().mockReturnValue(true),
  executeWithConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
  executeWhenConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
  isSSR: vi.fn().mockReturnValue(false),
  isBrowser: vi.fn().mockReturnValue(true),
});

const createMockAnalyticsService = () => ({
  trackEvent: vi.fn(),
});

const createMockUsersService = () => ({
  getUserRefernceById: vi.fn().mockResolvedValue(null),
});

const buildEdit = (
  id: string,
  userId: string,
  timestampSeconds: number
): SpotEditSchema & { id: string; path: string } => ({
  id,
  path: `spots/spot-${id}/edits/${id}`,
  type: "UPDATE",
  timestamp: { seconds: timestampSeconds, nanoseconds: 0 } as SpotEditSchema["timestamp"],
  user: {
    uid: userId,
    display_name: "Test User",
  },
  data: {
    name: { en: `Edit ${id}` },
  },
});

describe("SpotEditsService", () => {
  let service: SpotEditsService;
  let mockFirestoreAdapter: ReturnType<typeof createMockFirestoreAdapter>;
  let mockUsersService: ReturnType<typeof createMockUsersService>;

  beforeEach(() => {
    mockFirestoreAdapter = createMockFirestoreAdapter();
    mockUsersService = createMockUsersService();

    TestBed.configureTestingModule({
      providers: [
        SpotEditsService,
        { provide: FirestoreAdapterService, useValue: mockFirestoreAdapter },
        { provide: UsersService, useValue: mockUsersService },
        { provide: ConsentService, useValue: createMockConsentService() },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    });

    service = TestBed.inject(SpotEditsService);
  });

  it("queries a paginated collection group for edits from a single user", async () => {
    const cursor = { id: "cursor" };
    const edits = [buildEdit("a", "user-1", 2), buildEdit("b", "user-1", 1)];
    mockFirestoreAdapter.getCollectionGroupWithMetadata.mockResolvedValueOnce({
      data: edits,
      lastDoc: cursor,
    });

    const result = await service.getSpotEditsPageByUserId("user-1", 5, cursor);

    expect(mockFirestoreAdapter.getCollectionGroupWithMetadata).toHaveBeenCalledWith(
      "edits",
      [{ fieldPath: "user.uid", opStr: "==", value: "user-1" }],
      [
        { type: "orderBy", fieldPath: "timestamp_raw_ms", direction: "desc" },
        { type: "limit", limit: 5 },
      ],
      cursor
    );
    expect(result.lastDoc).toBe(cursor);
    expect(result.edits).toEqual([
      { edit: edits[0], spotId: "spot-a" },
      { edit: edits[1], spotId: "spot-b" },
    ]);
  });

  it("returns an empty page when the user has no public edits", async () => {
    mockFirestoreAdapter.getCollectionGroupWithMetadata.mockResolvedValueOnce({
      data: [],
      lastDoc: null,
    });

    const result = await service.getSpotEditsPageByUserId("user-without-edits");

    expect(result).toEqual({ edits: [], lastDoc: null });
  });

  it("splits pending moderation spot edits into vote and organization queues", async () => {
    const voteEdit = {
      ...buildEdit("vote", "user-1", 10),
      approved: false,
      visibility: "public",
      vote_summary: {
        yes_count: 1,
        no_count: 0,
        total_count: 1,
        ratio_yes_to_no: null,
        submitter_vote: "yes",
        eligible_for_auto_approval: false,
      },
    };
    const orgReviewEdit = {
      ...buildEdit("org", "user-2", 20),
      approved: false,
      visibility: "private",
      review_status: "pending",
      review_organization_ids: ["org-1"],
    };
    const createEdit = {
      ...buildEdit("create", "user-3", 30),
      type: "CREATE" as const,
      approved: false,
    };
    const approvedEdit = {
      ...buildEdit("approved", "user-4", 40),
      approved: true,
    };
    mockFirestoreAdapter.getCollectionGroupWithMetadata.mockResolvedValueOnce({
      data: [createEdit, voteEdit, approvedEdit, orgReviewEdit],
      lastDoc: null,
    });

    const result = await service.getPendingModerationSpotEditQueues(20);

    expect(mockFirestoreAdapter.getCollectionGroupWithMetadata).toHaveBeenCalledWith(
      "edits",
      [{ fieldPath: "approved", opStr: "==", value: false }],
      [{ type: "limit", limit: 20 }]
    );
    expect(result.voting).toEqual([{ edit: voteEdit, spotId: "spot-vote" }]);
    expect(result.organizationReview).toEqual([
      { edit: orgReviewEdit, spotId: "spot-org" },
    ]);
  });

  it("creates new spots through a setDocument placeholder before the CREATE edit", async () => {
    mockFirestoreAdapter.addDocument.mockResolvedValueOnce("create-edit-id");

    const spotId = await service.createSpotWithEdit(
      {
        name: { en: "New Spot" },
        location_raw: { lat: 47.3769, lng: 8.5417 },
        rating: 5,
      },
      { uid: "user-1", display_name: "Test User" }
    );

    expect(spotId).toBe("generated-spot-id");
    expect(mockFirestoreAdapter.createDocumentId).toHaveBeenCalledWith("spots");
    expect(mockFirestoreAdapter.setDocument).toHaveBeenCalledWith(
      "spots/generated-spot-id",
      {}
    );
    expect(mockFirestoreAdapter.addDocument).toHaveBeenCalledWith(
      "spots/generated-spot-id/edits",
      expect.objectContaining({
        type: "CREATE",
        user: { uid: "user-1", display_name: "Test User" },
        data: expect.objectContaining({
          name: { en: "New Spot" },
          location_raw: { lat: 47.3769, lng: 8.5417 },
        }),
      })
    );
    expect(mockFirestoreAdapter.addDocument).not.toHaveBeenCalledWith(
      "spots",
      expect.anything()
    );
  });

  it("sends CREATE edits with clean location-only payloads", async () => {
    mockFirestoreAdapter.addDocument.mockResolvedValueOnce("create-edit-id");

    await service.createSpotWithEdit(
      {
        name: { en: "Location Only Park" },
        location: new GeoPoint(47.5596, 7.5886),
        media: [],
        type: "park",
        access: "public",
        amenities: {
          covered: undefined,
          lit: true,
        },
      },
      { uid: "user-1", display_name: "Test User" }
    );

    expect(mockFirestoreAdapter.addDocument).toHaveBeenCalledWith(
      "spots/generated-spot-id/edits",
      expect.objectContaining({
        type: "CREATE",
        user: { uid: "user-1", display_name: "Test User" },
        data: {
          name: { en: "Location Only Park" },
          location: { latitude: 47.5596, longitude: 7.5886 },
          media: [],
          type: "park",
          access: "public",
          amenities: {
            lit: true,
          },
        },
      })
    );
  });

  it("does not send spot organization relationship metadata through normal update edits", async () => {
    mockFirestoreAdapter.addDocument.mockResolvedValueOnce("edit-id");

    await service.createSpotUpdateEdit(
      "spot-1" as never,
      {
        name: { en: "Verified Spot" },
        stewardship: {
          organization_ids: ["pkspot", "wpf"],
          organizations: {},
        },
        management: {
          status: "managed",
          organization_id: "pkspot",
          organization: {
            id: "pkspot",
            name: "PK Spot",
            slug: "pkspot",
          },
          managed_by_user_id: "admin-user",
          managed_at: {} as never,
          lock_edits: true,
        },
        verification: {
          status: "verified",
          organization_id: "pkspot",
          organization: {
            id: "pkspot",
            name: "PK Spot",
            slug: "pkspot",
          },
          verified_by_user_id: "admin-user",
          verified_at: {} as never,
          lock_edits: true,
        },
      },
      { uid: "user-1", display_name: "Test User" }
    );

    expect(mockFirestoreAdapter.addDocument).toHaveBeenCalledWith(
      "spots/spot-1/edits",
      expect.objectContaining({
        type: "UPDATE",
        data: {
          name: { en: "Verified Spot" },
        },
      })
    );
  });

  it("keeps slug in normal update edits so preferred URL changes are submitted", async () => {
    mockFirestoreAdapter.addDocument.mockResolvedValueOnce("edit-id");

    await service.createSpotUpdateEdit(
      "spot-1" as never,
      {
        slug: "new-preferred-url",
      },
      { uid: "user-1", display_name: "Test User" },
      {
        slug: "old-preferred-url",
      }
    );

    expect(mockFirestoreAdapter.addDocument).toHaveBeenCalledWith(
      "spots/spot-1/edits",
      expect.objectContaining({
        type: "UPDATE",
        data: {
          slug: "new-preferred-url",
        },
        prevData: {
          slug: "old-preferred-url",
        },
      })
    );
  });

  it("does not route legacy-only verified spots into private organization review", async () => {
    mockFirestoreAdapter.getDocument.mockResolvedValueOnce({
      verification: {
        status: "verified",
        organization_id: "pkspot",
        organization: {
          id: "pkspot",
          name: "PK Spot",
          slug: "pkspot",
        },
        verified_by_user_id: "admin-user",
        verified_at: {} as never,
        lock_edits: true,
      },
    });
    mockFirestoreAdapter.addDocument.mockResolvedValueOnce("edit-id");

    await service.addSpotEdit("spot-1", {
      type: "UPDATE",
      timestamp: {} as SpotEditSchema["timestamp"],
      timestamp_raw_ms: 1,
      user: { uid: "user-1", display_name: "Test User" },
      data: {
        name: { en: "Legacy Verified Spot Edit" },
      },
    });

    expect(mockFirestoreAdapter.addDocument).toHaveBeenCalledWith(
      "spots/spot-1/edits",
      expect.objectContaining({
        visibility: "public",
      })
    );
  });

  it("treats empty update edits as a no-op", async () => {
    const editId = await service.addSpotEdit("spot-1", {
      type: "UPDATE",
      timestamp: {} as SpotEditSchema["timestamp"],
      timestamp_raw_ms: 1,
      user: { uid: "user-1", display_name: "Test User" },
      data: {},
    });

    expect(editId).toBe("");
    expect(mockFirestoreAdapter.addDocument).not.toHaveBeenCalled();
  });

  it("recursively removes undefined values from edit documents", async () => {
    mockFirestoreAdapter.addDocument.mockResolvedValueOnce("edit-id");

    await service.addSpotEdit("spot-1", {
      type: "CREATE",
      timestamp: {} as SpotEditSchema["timestamp"],
      timestamp_raw_ms: 1,
      user: {
        uid: "user-1",
        display_name: undefined,
      },
      data: {
        name: {
          en: "Undefined Cleanup Park",
          de: undefined,
        },
        amenities: {
          covered: undefined,
          lit: false,
        },
        media: [],
      },
      prevData: undefined,
    } as unknown as SpotEditSchema);

    expect(mockFirestoreAdapter.addDocument).toHaveBeenCalledWith(
      "spots/spot-1/edits",
      {
        visibility: "public",
        type: "CREATE",
        timestamp: {},
        timestamp_raw_ms: 1,
        user: {
          uid: "user-1",
        },
        data: {
          name: {
            en: "Undefined Cleanup Park",
          },
          amenities: {
            lit: false,
          },
          media: [],
        },
      }
    );
  });

  it("hydrates email-like edit user display names from the current profile before writing", async () => {
    mockUsersService.getUserRefernceById.mockResolvedValueOnce({
      uid: "user-1",
      display_name: "Profile Name",
      profile_picture: "profile.jpg",
    });
    mockFirestoreAdapter.addDocument.mockResolvedValueOnce("edit-id");

    await service.addSpotEdit("spot-1", {
      type: "UPDATE",
      timestamp: {} as SpotEditSchema["timestamp"],
      timestamp_raw_ms: 1,
      user: {
        uid: "user-1",
        display_name: "person@example.test",
      },
      data: {
        name: {
          en: "Updated Park",
        },
      },
    });

    expect(mockUsersService.getUserRefernceById).toHaveBeenCalledWith("user-1");
    expect(mockFirestoreAdapter.addDocument).toHaveBeenCalledWith(
      "spots/spot-1/edits",
      expect.objectContaining({
        user: {
          uid: "user-1",
          display_name: "Profile Name",
          profile_picture: "profile.jpg",
        },
      })
    );
  });

  it("strips email-like edit user display names when no profile name can be loaded", async () => {
    mockUsersService.getUserRefernceById.mockResolvedValueOnce(null);
    mockFirestoreAdapter.addDocument.mockResolvedValueOnce("edit-id");

    await service.addSpotEdit("spot-1", {
      type: "UPDATE",
      timestamp: {} as SpotEditSchema["timestamp"],
      timestamp_raw_ms: 1,
      user: {
        uid: "user-1",
        display_name: "person@example.test",
      },
      data: {
        name: {
          en: "Updated Park",
        },
      },
    });

    expect(mockFirestoreAdapter.addDocument).toHaveBeenCalledWith(
      "spots/spot-1/edits",
      expect.objectContaining({
        user: {
          uid: "user-1",
        },
      })
    );
  });
});
