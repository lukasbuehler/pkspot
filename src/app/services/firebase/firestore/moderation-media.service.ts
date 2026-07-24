import { inject, Injectable } from "@angular/core";
import { MediaUploadReviewSchema } from "../../../../db/schemas/MediaUploadReviewSchema";
import {
  FirestoreAdapterService,
  QueryConstraintOptions,
} from "../firestore-adapter.service";

export interface ModerationMediaItem {
  id: string;
  status: MediaUploadReviewSchema["status"];
  uploaderUid?: string;
  targetKind?: string;
  targetId?: string;
  contentType?: string;
  publicUrl?: string;
  storagePath?: string;
  createdAtMillis: number;
  provider?: string;
  decision?: string;
  reason?: string;
  labels?: Record<string, string>;
  isApproved: boolean;
  isVideo: boolean;
}

@Injectable({ providedIn: "root" })
export class ModerationMediaService {
  private readonly _firestore = inject(FirestoreAdapterService);

  async getUploadStream(limitCount = 200): Promise<ModerationMediaItem[]> {
    const constraints: QueryConstraintOptions[] = [
      { type: "orderBy", fieldPath: "created_at", direction: "desc" },
      { type: "limit", limit: limitCount },
    ];
    const reviews = await this._firestore.getCollection<
      MediaUploadReviewSchema & { id: string }
    >("media_upload_reviews", undefined, constraints);

    return reviews
      .map((review) => this._mapReview(review))
      .sort((left, right) => right.createdAtMillis - left.createdAtMillis);
  }

  private _mapReview(
    review: MediaUploadReviewSchema & { id: string },
  ): ModerationMediaItem {
    const scan = review.scan_result;
    const contentType = review.content_type;
    return {
      id: review.id,
      status: review.status,
      uploaderUid: review.uid,
      targetKind: review.target_kind,
      targetId: review.target_id,
      contentType,
      publicUrl: review.approved_url,
      storagePath:
        review.approved_path ?? review.intake_path ?? review.audited_path,
      createdAtMillis: this._toMillis(review.completed_at ?? review.created_at),
      provider: scan?.provider,
      decision: scan?.decision,
      reason: scan?.reason ?? review.failure_reason,
      labels: scan?.labels,
      isApproved: review.status === "approved" && Boolean(review.approved_url),
      isVideo: contentType?.startsWith("video/") === true,
    };
  }

  private _toMillis(value: unknown): number {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (
      value &&
      typeof value === "object" &&
      "toMillis" in value &&
      typeof value.toMillis === "function"
    ) {
      return value.toMillis();
    }
    if (
      value &&
      typeof value === "object" &&
      "seconds" in value &&
      typeof value.seconds === "number"
    ) {
      return value.seconds * 1000;
    }
    return 0;
  }
}
