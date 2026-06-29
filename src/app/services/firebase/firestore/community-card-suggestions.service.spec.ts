import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { CommunityCardSuggestionsService } from "./community-card-suggestions.service";

const createMockFirestoreAdapter = () => ({
  getCollection: vi.fn(),
});

describe("CommunityCardSuggestionsService", () => {
  let service: CommunityCardSuggestionsService;
  let adapter: ReturnType<typeof createMockFirestoreAdapter>;

  beforeEach(() => {
    adapter = createMockFirestoreAdapter();

    TestBed.configureTestingModule({
      providers: [
        CommunityCardSuggestionsService,
        { provide: FirestoreAdapterService, useValue: adapter },
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
