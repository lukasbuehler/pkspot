import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpotEditSchema } from "../../../../db/schemas/SpotEditSchema";
import { AnalyticsService } from "../../analytics.service";
import { ConsentService } from "../../consent.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { SpotEditsService } from "./spot-edits.service";

const createMockFirestoreAdapter = () => ({
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

  beforeEach(() => {
    mockFirestoreAdapter = createMockFirestoreAdapter();

    TestBed.configureTestingModule({
      providers: [
        SpotEditsService,
        { provide: FirestoreAdapterService, useValue: mockFirestoreAdapter },
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
        { type: "orderBy", fieldPath: "timestamp", direction: "desc" },
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
});
