import { inject, Injectable } from "@angular/core";
import type {
  CommunityCardSuggestionSchema,
  CommunityCardSuggestionStatus,
} from "../../../../db/schemas/CommunityCardSuggestionSchema";
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
}
