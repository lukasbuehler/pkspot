import { inject, Injectable } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import { firstValueFrom } from "rxjs";
import type { CommunityCardSuggestionSchema } from "../../../../db/schemas/CommunityCardSuggestionSchema";
import type {
  CommunityEditSchema,
  CommunityEditStatus,
} from "../../../../db/schemas/CommunityEditSchema";
import type { CommunityInfoCardSchema } from "../../../../db/schemas/CommunityPageSchema";
import { EDIT_SCHEMA_VERSION } from "../../../../db/schemas/EditSchema";
import { AuthenticationService } from "../authentication.service";
import {
  FirestoreAdapterService,
  QueryConstraintOptions,
  QueryFilter,
} from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";

export type CommunityKnowledgeEditItem = CommunityEditSchema & {
  id: string;
  path: string;
  timestamp_millis: number;
};

type ReviewCommunityEditRequest = {
  communityKey: string;
  editId: string;
  decision: "approve" | "reject";
  reviewNote?: string;
};

type ReviewCommunityEditResponse = { ok: true };

type SaveCommunityKnowledgeRequest = {
  communityKey: string;
  communityDisplayName?: string;
  communityPath?: string;
  cards: CommunityInfoCardSchema[];
};

type SaveCommunityKnowledgeResponse = { ok: true; editId: string };

@Injectable({
  providedIn: "root",
})
export class CommunityEditsService {
  private readonly _firestoreAdapter = inject(FirestoreAdapterService);
  private readonly _authService = inject(AuthenticationService);
  private readonly _functionsAdapter = inject(FunctionsAdapterService);

  async submitKnowledgeSuggestion(input: {
    communityKey: string;
    communityDisplayName?: string;
    communityPath?: string;
    card: CommunityInfoCardSchema;
  }): Promise<string> {
    const authUser = await firstValueFrom(this._authService.authState$);
    if (!authUser?.uid) {
      throw new Error("You must be signed in to suggest community knowledge.");
    }

    const timestamp = Timestamp.now();
    const edit: CommunityEditSchema = {
      target_type: "community",
      target_id: input.communityKey,
      schema_version: EDIT_SCHEMA_VERSION,
      type: "UPDATE",
      edit_kind: "knowledge",
      operation: "UPSERT_KNOWLEDGE_CARD",
      data: { card: input.card },
      status: "pending",
      approved: false,
      visibility: "private",
      review_policy: "admin",
      user: {
        uid: authUser.uid,
        ...(authUser.data?.displayName
          ? { display_name: authUser.data.displayName }
          : {}),
      },
      timestamp,
      timestamp_raw_ms: timestamp.toMillis(),
      ...(input.communityDisplayName
        ? { community_display_name: input.communityDisplayName }
        : {}),
      ...(input.communityPath ? { community_path: input.communityPath } : {}),
    };

    return this._firestoreAdapter.addDocument(
      `community_pages/${input.communityKey}/edits`,
      edit,
    );
  }

  async saveKnowledgeCards(input: SaveCommunityKnowledgeRequest): Promise<string> {
    const response = await this._functionsAdapter.call<
      SaveCommunityKnowledgeRequest,
      SaveCommunityKnowledgeResponse
    >("saveCommunityKnowledge", input);
    return response.editId;
  }

  async getPendingKnowledgeEdits(
    limitCount: number = 25,
  ): Promise<CommunityKnowledgeEditItem[]> {
    const editFilters: QueryFilter[] = [
      { fieldPath: "target_type", opStr: "==", value: "community" },
      { fieldPath: "status", opStr: "==", value: "pending" },
    ];
    const editConstraints: QueryConstraintOptions[] = [
      { type: "orderBy", fieldPath: "timestamp_raw_ms", direction: "desc" },
      { type: "limit", limit: limitCount },
    ];
    const legacyFilters: QueryFilter[] = [
      { fieldPath: "status", opStr: "==", value: "pending" },
    ];
    const legacyConstraints: QueryConstraintOptions[] = [
      { type: "limit", limit: limitCount },
    ];

    const [communityEdits, legacySuggestions] = await Promise.all([
      this._firestoreAdapter.getCollectionGroupWithMetadata<CommunityEditSchema>(
        "edits",
        editFilters,
        editConstraints,
      ),
      this._firestoreAdapter.getCollection<
        CommunityCardSuggestionSchema & { id: string }
      >("community_card_suggestions", legacyFilters, legacyConstraints),
    ]);

    const byTargetAndId = new Map<string, CommunityKnowledgeEditItem>();
    for (const legacySuggestion of legacySuggestions) {
      if (legacySuggestion.status !== "pending") {
        continue;
      }
      const mapped = this._mapLegacySuggestion(legacySuggestion);
      byTargetAndId.set(this._editKey(mapped), mapped);
    }
    for (const edit of communityEdits.data) {
      if (!this._isStatus(edit.status, "pending")) {
        continue;
      }
      const mapped = {
        ...edit,
        timestamp_millis: this._toMillis(
          edit.timestamp,
          edit.timestamp_raw_ms,
        ),
      };
      byTargetAndId.set(this._editKey(mapped), mapped);
    }

    return Array.from(byTargetAndId.values())
      .sort((left, right) => right.timestamp_millis - left.timestamp_millis)
      .slice(0, limitCount);
  }

  approveEdit(
    edit: CommunityKnowledgeEditItem,
    reviewNote?: string,
  ): Promise<void> {
    return this._reviewEdit(edit, "approve", reviewNote);
  }

  rejectEdit(
    edit: CommunityKnowledgeEditItem,
    reviewNote?: string,
  ): Promise<void> {
    return this._reviewEdit(edit, "reject", reviewNote);
  }

  private async _reviewEdit(
    edit: CommunityKnowledgeEditItem,
    decision: "approve" | "reject",
    reviewNote?: string,
  ): Promise<void> {
    await this._functionsAdapter.call<
      ReviewCommunityEditRequest,
      ReviewCommunityEditResponse
    >("reviewCommunityEdit", {
      communityKey: edit.target_id,
      editId: edit.id,
      decision,
      ...(reviewNote?.trim() ? { reviewNote: reviewNote.trim() } : {}),
    });
  }

  private _mapLegacySuggestion(
    suggestion: CommunityCardSuggestionSchema & { id: string },
  ): CommunityKnowledgeEditItem {
    const timestampRawMs = this._toMillis(
      suggestion.created_at,
      suggestion.created_at_raw_ms,
    );
    return {
      id: suggestion.id,
      path: `community_pages/${suggestion.community_key}/edits/${suggestion.id}`,
      target_type: "community",
      target_id: suggestion.community_key,
      schema_version: EDIT_SCHEMA_VERSION,
      type: "UPDATE",
      edit_kind: "knowledge",
      operation: "UPSERT_KNOWLEDGE_CARD",
      data: { card: suggestion.card },
      status: suggestion.status,
      approved: suggestion.status === "approved",
      visibility: suggestion.status === "approved" ? "public" : "private",
      review_policy: "admin",
      user: suggestion.created_by,
      timestamp: suggestion.created_at,
      timestamp_raw_ms: timestampRawMs,
      timestamp_millis: timestampRawMs,
      ...(suggestion.community_display_name
        ? { community_display_name: suggestion.community_display_name }
        : {}),
      ...(suggestion.community_path
        ? { community_path: suggestion.community_path }
        : {}),
      ...(suggestion.reviewed_by
        ? { reviewed_by: suggestion.reviewed_by }
        : {}),
      ...(suggestion.reviewed_at
        ? { reviewed_at: suggestion.reviewed_at }
        : {}),
      ...(suggestion.review_note
        ? { review_note: suggestion.review_note }
        : {}),
      legacy_source: {
        collection: "community_card_suggestions",
        id: suggestion.id,
      },
    };
  }

  private _editKey(edit: Pick<CommunityKnowledgeEditItem, "id" | "target_id">): string {
    return `${edit.target_id}/${edit.id}`;
  }

  private _isStatus(
    value: string,
    status: CommunityEditStatus,
  ): boolean {
    return value === status;
  }

  private _toMillis(
    timestamp:
      | { seconds: number; nanoseconds: number }
      | { toMillis(): number }
      | undefined,
    rawMillis: number | undefined,
  ): number {
    if (typeof rawMillis === "number") {
      return rawMillis;
    }
    if (timestamp && "toMillis" in timestamp) {
      return timestamp.toMillis();
    }
    return timestamp?.seconds ? timestamp.seconds * 1000 : 0;
  }
}
