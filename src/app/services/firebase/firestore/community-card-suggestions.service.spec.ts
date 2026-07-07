import { BehaviorSubject } from "rxjs";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { CommunityCardSuggestionsService } from "./community-card-suggestions.service";
import { AuthenticationService } from "../authentication.service";
import { LandingPagesService } from "./landing-pages.service";

const createMockFirestoreAdapter = () => ({
  getCollection: vi.fn(),
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
  addDocument: vi.fn(),
});

describe("CommunityCardSuggestionsService", () => {
  let service: CommunityCardSuggestionsService;
  let adapter: ReturnType<typeof createMockFirestoreAdapter>;
  let landingPagesService: {
    getCommunityPrivateInfoCards: ReturnType<typeof vi.fn>;
    updateCommunityInfoCards: ReturnType<typeof vi.fn>;
  };
  let authState$: BehaviorSubject<{
    uid: string;
    data?: { displayName: string };
  } | null>;

  beforeEach(() => {
    adapter = createMockFirestoreAdapter();
    landingPagesService = {
      getCommunityPrivateInfoCards: vi.fn().mockResolvedValue([]),
      updateCommunityInfoCards: vi.fn().mockResolvedValue(undefined),
    };
    authState$ = new BehaviorSubject<{
      uid: string;
      data?: { displayName: string };
    } | null>({
      uid: "user-1",
      data: { displayName: "Editor" },
    });

    TestBed.configureTestingModule({
      providers: [
        CommunityCardSuggestionsService,
        { provide: FirestoreAdapterService, useValue: adapter },
        { provide: AuthenticationService, useValue: { authState$ } },
        { provide: LandingPagesService, useValue: landingPagesService },
      ],
    });

    service = TestBed.inject(CommunityCardSuggestionsService);
  });

  it("loads pending suggestions newest first", async () => {
    adapter.getCollection.mockResolvedValueOnce([
      buildSuggestion("old", 1_000, "pending"),
      buildSuggestion("approved", 3_000, "approved"),
      buildSuggestion("new", 2_000, "pending"),
    ]);

    const result = await service.getPendingSuggestions(10);

    expect(adapter.getCollection).toHaveBeenCalledWith(
      "community_card_suggestions",
      [{ fieldPath: "status", opStr: "==", value: "pending" }],
      [{ type: "limit", limit: 10 }]
    );
    expect(result.map((suggestion) => suggestion.id)).toEqual(["new", "old"]);
    expect(result.map((suggestion) => suggestion.created_at_millis)).toEqual([
      2_000,
      1_000,
    ]);
  });

  it("submits a pending suggestion for the signed-in user", async () => {
    adapter.addDocument.mockResolvedValueOnce("suggestion-1");

    await expect(
      service.submitSuggestion({
        communityKey: "locality:au:melbourne",
        communityDisplayName: "Melbourne",
        communityPath: "/map/communities/melbourne",
        card: {
          id: "jam",
          title: { en: "Friday jam" },
          category: "jams",
        },
      }),
    ).resolves.toBe("suggestion-1");

    expect(adapter.addDocument).toHaveBeenCalledWith(
      "community_card_suggestions",
      expect.objectContaining({
        community_key: "locality:au:melbourne",
        community_display_name: "Melbourne",
        community_path: "/map/communities/melbourne",
        status: "pending",
        created_by: { uid: "user-1", display_name: "Editor" },
        card: {
          id: "jam",
          title: { en: "Friday jam" },
          category: "jams",
        },
      }),
    );
  });

  it("approves suggestions by appending the card to community info cards", async () => {
    adapter.getDocument.mockResolvedValueOnce({
      id: "locality:au:melbourne",
      communityKey: "locality:au:melbourne",
      infoCards: [
        {
          id: "existing",
          title: { en: "Existing" },
          category: "other",
        },
      ],
    });
    adapter.updateDocument.mockResolvedValueOnce(undefined);
    const suggestion = {
      ...buildSuggestion("new", 2_000, "pending"),
      card: {
        id: "new-card",
        title: { en: "New card" },
        category: "jams",
      },
    };

    await service.approveSuggestion(suggestion);

    expect(landingPagesService.updateCommunityInfoCards).toHaveBeenCalledWith(
      "locality:au:melbourne",
      [
        {
          id: "existing",
          title: { en: "Existing" },
          category: "other",
        },
        {
          id: "new-card",
          title: { en: "New card" },
          category: "jams",
        },
      ],
    );
    expect(adapter.updateDocument).toHaveBeenCalledWith(
      "community_card_suggestions/new",
      expect.objectContaining({
        status: "approved",
        reviewed_by: { uid: "user-1", display_name: "Editor" },
      }),
    );
  });
});

function buildSuggestion(
  id: string,
  createdAtRawMs: number,
  status: "pending" | "approved",
) {
  return {
    id,
    community_key: "locality:au:melbourne",
    community_display_name: "Melbourne",
    community_path: "/map/communities/melbourne",
    status,
    created_by: { uid: "user-1", display_name: "Editor" },
    created_at: { seconds: Math.floor(createdAtRawMs / 1000), nanoseconds: 0 },
    created_at_raw_ms: createdAtRawMs,
    card: {
      id: `card-${id}`,
      title: { en: `Card ${id}` },
      category: "jams",
    },
  };
}
