import { TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EDIT_SCHEMA_VERSION } from "../../../../db/schemas/EditSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import {
  CommunityEditsService,
  CommunityKnowledgeEditItem,
} from "./community-edits.service";

const createMockFirestoreAdapter = () => ({
  getCollection: vi.fn(),
  getCollectionGroupWithMetadata: vi.fn(),
  addDocument: vi.fn(),
});

const createMockFunctionsAdapter = () => ({
  call: vi.fn().mockResolvedValue({ ok: true, editId: "edit-1" }),
});

describe("CommunityEditsService", () => {
  let service: CommunityEditsService;
  let firestoreAdapter: ReturnType<typeof createMockFirestoreAdapter>;
  let functionsAdapter: ReturnType<typeof createMockFunctionsAdapter>;
  let authState$: BehaviorSubject<{
    uid: string;
    data?: { displayName: string };
  } | null>;

  beforeEach(() => {
    firestoreAdapter = createMockFirestoreAdapter();
    functionsAdapter = createMockFunctionsAdapter();
    authState$ = new BehaviorSubject({
      uid: "user-1",
      data: { displayName: "Editor" },
    });

    TestBed.configureTestingModule({
      providers: [
        CommunityEditsService,
        { provide: FirestoreAdapterService, useValue: firestoreAdapter },
        { provide: FunctionsAdapterService, useValue: functionsAdapter },
        { provide: AuthenticationService, useValue: { authState$ } },
      ],
    });

    service = TestBed.inject(CommunityEditsService);
  });

  it("loads pending community edits and prefers migrated edits over legacy suggestions", async () => {
    const migratedEdit = buildCommunityEdit("same", 3_000);
    firestoreAdapter.getCollectionGroupWithMetadata.mockResolvedValueOnce({
      data: [migratedEdit, buildCommunityEdit("new", 4_000)],
      lastDoc: null,
    });
    firestoreAdapter.getCollection.mockResolvedValueOnce([
      buildLegacySuggestion("same", 1_000),
      buildLegacySuggestion("old", 2_000),
    ]);

    const result = await service.getPendingKnowledgeEdits(10);

    expect(
      firestoreAdapter.getCollectionGroupWithMetadata,
    ).toHaveBeenCalledWith(
      "edits",
      [
        { fieldPath: "target_type", opStr: "==", value: "community" },
        { fieldPath: "status", opStr: "==", value: "pending" },
      ],
      [
        {
          type: "orderBy",
          fieldPath: "timestamp_raw_ms",
          direction: "desc",
        },
        { type: "limit", limit: 10 },
      ],
    );
    expect(result.map((edit) => edit.id)).toEqual(["new", "same", "old"]);
    expect(result.find((edit) => edit.id === "same")?.path).toBe(
      migratedEdit.path,
    );
  });

  it("submits a pending knowledge edit under the community", async () => {
    firestoreAdapter.addDocument.mockResolvedValueOnce("suggestion-1");

    await expect(
      service.submitKnowledgeSuggestion({
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

    expect(firestoreAdapter.addDocument).toHaveBeenCalledWith(
      "community_pages/locality:au:melbourne/edits",
      expect.objectContaining({
        target_type: "community",
        target_id: "locality:au:melbourne",
        schema_version: EDIT_SCHEMA_VERSION,
        type: "UPDATE",
        edit_kind: "knowledge",
        operation: "UPSERT_KNOWLEDGE_CARD",
        status: "pending",
        approved: false,
        visibility: "private",
        review_policy: "admin",
        user: { uid: "user-1", display_name: "Editor" },
        data: {
          card: {
            id: "jam",
            title: { en: "Friday jam" },
            category: "jams",
          },
        },
      }),
    );
  });

  it("reviews pending edits through the trusted callable", async () => {
    const edit = buildCommunityEdit("edit-1", 2_000);

    await service.approveEdit(edit, "Looks good");

    expect(functionsAdapter.call).toHaveBeenCalledWith(
      "reviewCommunityEdit",
      {
        communityKey: "locality:au:melbourne",
        editId: "edit-1",
        decision: "approve",
        reviewNote: "Looks good",
      },
    );
  });

  it("saves an admin knowledge replacement through the trusted callable", async () => {
    const cards = [{ id: "jam", title: { en: "Friday jam" } }];

    await expect(
      service.saveKnowledgeCards({
        communityKey: "locality:au:melbourne",
        communityDisplayName: "Melbourne",
        communityPath: "/map/communities/melbourne",
        cards,
      }),
    ).resolves.toBe("edit-1");

    expect(functionsAdapter.call).toHaveBeenCalledWith(
      "saveCommunityKnowledge",
      {
        communityKey: "locality:au:melbourne",
        communityDisplayName: "Melbourne",
        communityPath: "/map/communities/melbourne",
        cards,
      },
    );
  });
});

function buildCommunityEdit(
  id: string,
  timestampRawMs: number,
): CommunityKnowledgeEditItem {
  return {
    id,
    path: `community_pages/locality:au:melbourne/edits/${id}`,
    target_type: "community",
    target_id: "locality:au:melbourne",
    schema_version: EDIT_SCHEMA_VERSION,
    type: "UPDATE",
    edit_kind: "knowledge",
    operation: "UPSERT_KNOWLEDGE_CARD",
    data: {
      card: {
        id: `card-${id}`,
        title: { en: `Card ${id}` },
        category: "jams",
      },
    },
    status: "pending",
    approved: false,
    visibility: "private",
    review_policy: "admin",
    user: { uid: "user-1", display_name: "Editor" },
    timestamp: {
      seconds: Math.floor(timestampRawMs / 1_000),
      nanoseconds: 0,
    },
    timestamp_raw_ms: timestampRawMs,
    timestamp_millis: timestampRawMs,
  };
}

function buildLegacySuggestion(id: string, createdAtRawMs: number) {
  return {
    id,
    community_key: "locality:au:melbourne",
    community_display_name: "Melbourne",
    community_path: "/map/communities/melbourne",
    status: "pending" as const,
    created_by: { uid: "user-1", display_name: "Editor" },
    created_at: {
      seconds: Math.floor(createdAtRawMs / 1_000),
      nanoseconds: 0,
    },
    created_at_raw_ms: createdAtRawMs,
    card: {
      id: `card-${id}`,
      title: { en: `Card ${id}` },
      category: "jams" as const,
    },
  };
}
