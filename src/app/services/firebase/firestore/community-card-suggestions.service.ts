import { inject, Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";
import type {
  CommunityCardSuggestionSchema,
  CommunityCardSuggestionStatus,
} from "../../../../db/schemas/CommunityCardSuggestionSchema";
import type {
  CommunityInfoCardSchema,
  CommunityPageSchema,
} from "../../../../db/schemas/CommunityPageSchema";
import { AuthenticationService } from "../authentication.service";
import { LandingPagesService } from "./landing-pages.service";
import {
  FirestoreAdapterService,
  QueryConstraintOptions,
  QueryFilter,
} from "../firestore-adapter.service";

export type CommunityCardSuggestionItem = CommunityCardSuggestionSchema & {
  id: string;
  created_at_millis: number;
};

@Injectable({
  providedIn: "root",
})
export class CommunityCardSuggestionsService {
  private readonly _firestoreAdapter = inject(FirestoreAdapterService);
  private readonly _authService = inject(AuthenticationService);
  private readonly _landingPagesService = inject(LandingPagesService);

  async submitSuggestion(input: {
    communityKey: string;
    communityDisplayName?: string;
    communityPath?: string;
    card: CommunityInfoCardSchema;
  }): Promise<string> {
    const authUser = await firstValueFrom(this._authService.authState$);
    if (!authUser?.uid) {
      throw new Error("You must be signed in to suggest community cards.");
    }

    const createdAtRawMs = Date.now();
    return this._firestoreAdapter.addDocument("community_card_suggestions", {
      community_key: input.communityKey,
      ...(input.communityDisplayName
        ? { community_display_name: input.communityDisplayName }
        : {}),
      ...(input.communityPath ? { community_path: input.communityPath } : {}),
      card: input.card,
      status: "pending",
      created_by: {
        uid: authUser.uid,
        ...(authUser.data?.displayName
          ? { display_name: authUser.data.displayName }
          : {}),
      },
      created_at: {
        seconds: Math.floor(createdAtRawMs / 1000),
        nanoseconds: (createdAtRawMs % 1000) * 1_000_000,
      },
      created_at_raw_ms: createdAtRawMs,
    } satisfies CommunityCardSuggestionSchema);
  }

  async getPendingSuggestions(
    limitCount: number = 25,
  ): Promise<CommunityCardSuggestionItem[]> {
    const filters: QueryFilter[] = [
      { fieldPath: "status", opStr: "==", value: "pending" },
    ];
    const constraints: QueryConstraintOptions[] = [
      { type: "limit", limit: limitCount },
    ];

    const suggestions =
      await this._firestoreAdapter.getCollection<
        CommunityCardSuggestionSchema & { id: string }
      >("community_card_suggestions", filters, constraints);

    return suggestions
      .filter((suggestion) => this._isStatus(suggestion.status, "pending"))
      .map((suggestion) => ({
        ...suggestion,
        created_at_millis: this._toMillis(
          suggestion.created_at,
          suggestion.created_at_raw_ms,
        ),
      }))
      .sort((left, right) => right.created_at_millis - left.created_at_millis);
  }

  async approveSuggestion(
    suggestion: CommunityCardSuggestionItem,
  ): Promise<void> {
    const authUser = await firstValueFrom(this._authService.authState$);
    if (!authUser?.uid) {
      throw new Error("You must be signed in to approve community cards.");
    }
    const reviewer = {
      uid: authUser.uid,
      ...(authUser.data ? { data: authUser.data } : {}),
    };

    const pageDoc = await this._firestoreAdapter.getDocument<
      CommunityPageSchema & { id: string }
    >(`community_pages/${suggestion.community_key}`);
    if (!pageDoc) {
      throw new Error("Community page not found.");
    }

    const privateCards =
      await this._landingPagesService.getCommunityPrivateInfoCards(
        suggestion.community_key,
      );
    const cardsById = new Map<string, CommunityInfoCardSchema>();
    for (const card of pageDoc.infoCards ?? []) {
      cardsById.set(card.id, card);
    }
    for (const card of privateCards) {
      cardsById.set(card.id, {
        ...cardsById.get(card.id),
        ...card,
      });
    }
    cardsById.set(suggestion.card.id, suggestion.card);

    await this._landingPagesService.updateCommunityInfoCards(
      suggestion.community_key,
      Array.from(cardsById.values()),
    );
    await this._updateSuggestionReviewStatus(suggestion, "approved", reviewer);
  }

  async rejectSuggestion(
    suggestion: CommunityCardSuggestionItem,
  ): Promise<void> {
    const authUser = await firstValueFrom(this._authService.authState$);
    if (!authUser?.uid) {
      throw new Error("You must be signed in to reject community cards.");
    }
    const reviewer = {
      uid: authUser.uid,
      ...(authUser.data ? { data: authUser.data } : {}),
    };

    await this._updateSuggestionReviewStatus(suggestion, "rejected", reviewer);
  }

  private _isStatus(
    value: string,
    status: CommunityCardSuggestionStatus,
  ): boolean {
    return value === status;
  }

  private _toMillis(
    timestamp: CommunityCardSuggestionSchema["created_at"] | undefined,
    rawMillis: number | undefined,
  ): number {
    if (typeof rawMillis === "number") {
      return rawMillis;
    }
    if (timestamp && typeof timestamp === "object") {
      if ("toMillis" in timestamp && typeof timestamp.toMillis === "function") {
        return timestamp.toMillis();
      }
      if ("seconds" in timestamp && typeof timestamp.seconds === "number") {
        return timestamp.seconds * 1000;
      }
    }
    return 0;
  }

  private _updateSuggestionReviewStatus(
    suggestion: CommunityCardSuggestionItem,
    status: Extract<CommunityCardSuggestionStatus, "approved" | "rejected">,
    authUser: { uid: string; data?: { displayName?: string } },
  ): Promise<void> {
    const reviewedAtRawMs = Date.now();
    return this._firestoreAdapter.updateDocument(
      `community_card_suggestions/${suggestion.id}`,
      {
        status,
        reviewed_by: {
          uid: authUser.uid,
          ...(authUser.data?.displayName
            ? { display_name: authUser.data.displayName }
            : {}),
        },
        reviewed_at: {
          seconds: Math.floor(reviewedAtRawMs / 1000),
          nanoseconds: (reviewedAtRawMs % 1000) * 1_000_000,
        },
      },
    );
  }
}
