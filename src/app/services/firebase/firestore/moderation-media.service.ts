import { inject, Injectable } from "@angular/core";
import { MediaUploadReviewSchema } from "../../../../db/schemas/MediaUploadReviewSchema";
import { SpotPreviewData } from "../../../../db/schemas/SpotPreviewData";
import { UserReferenceSchema } from "../../../../db/schemas/UserSchema";
import { SearchService } from "../../search.service";
import {
  FirestoreAdapterService,
  QueryConstraintOptions,
} from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { UsersService } from "./users.service";
import { mediaReviewStatusLabels, mediaSafetyPresentation, safeSearchLabelNames, safeSearchLikelihoodLabels } from "../../../shared/media-moderation-labels";

export interface ModerationMediaItem {
  id: string;
  status: MediaUploadReviewSchema["status"];
  statusLabel: string;
  safetyLabel?: string;
  incidentPath?: string;
  isFalsePositive: boolean;
  canMarkFalsePositive: boolean;
  canEscalate: boolean;
  uploaderUid?: string;
  uploader?: UserReferenceSchema;
  targetKind?: string;
  targetId?: string;
  spotPreview?: SpotPreviewData;
  contentType?: string;
  publicUrl?: string;
  storagePath?: string;
  createdAtMillis: number;
  provider?: string;
  decision?: string;
  reason?: string;
  labels?: Record<string, string>;
  labelEntries: ReadonlyArray<{ name: string; value: string }>;
  isApproved: boolean;
  isVideo: boolean;
  isRestricted: boolean;
  canReveal: boolean;
  canMarkSafe: boolean;
}

@Injectable({ providedIn: "root" })
export class ModerationMediaService {
  private readonly _firestore = inject(FirestoreAdapterService);
  private readonly _functions = inject(FunctionsAdapterService);
  private readonly _search = inject(SearchService);
  private readonly _users = inject(UsersService);

  async getReview(reviewId: string): Promise<ModerationMediaItem[]> {
    if (!/^[A-Za-z0-9_-]+$/.test(reviewId)) return [];
    // Fetch directly so links to older reports work beyond the stream's limit.
    const review = await this._firestore.getDocument<MediaUploadReviewSchema>(
      `media_upload_reviews/${reviewId}`,
    );
    return review
      ? this._enrichReferences([this._mapReview({ ...review, id: reviewId })])
      : [];
  }

  async getUploadStream(limitCount = 200): Promise<ModerationMediaItem[]> {
    const constraints: QueryConstraintOptions[] = [
      { type: "orderBy", fieldPath: "created_at", direction: "desc" },
      { type: "limit", limit: limitCount },
    ];
    const reviews = await this._firestore.getCollection<
      MediaUploadReviewSchema & { id: string }
    >("media_upload_reviews", undefined, constraints);

    const items = reviews
      .map((review) => this._mapReview(review))
      .sort((left, right) => right.createdAtMillis - left.createdAtMillis);
    return this._enrichReferences(items);
  }

  private async _enrichReferences(
    items: ModerationMediaItem[],
  ): Promise<ModerationMediaItem[]> {
    const spotIds = Array.from(
      new Set(
        items
          .filter((item) => item.targetKind === "spot" && item.targetId)
          .map((item) => item.targetId as string),
      ),
    );
    const uploaderUids = Array.from(
      new Set(
        items
          .map((item) => item.uploaderUid)
          .filter((uid): uid is string => Boolean(uid)),
      ),
    );

    const [spotPreviews, uploaders] = await Promise.all([
      this._loadSpotPreviews(spotIds),
      this._loadUploaders(uploaderUids),
    ]);
    const previewsById = new Map(
      spotPreviews.map((preview) => [String(preview.id), preview]),
    );
    const uploadersById = new Map(
      uploaders.map((uploader) => [uploader.uid, uploader]),
    );

    return items.map((item) => ({
      ...item,
      ...(item.targetId && previewsById.has(item.targetId)
        ? { spotPreview: previewsById.get(item.targetId) }
        : {}),
      ...(item.uploaderUid
        ? {
            uploader:
              uploadersById.get(item.uploaderUid) ?? {
                uid: item.uploaderUid,
              },
          }
        : {}),
    }));
  }

  private async _loadSpotPreviews(
    spotIds: string[],
  ): Promise<SpotPreviewData[]> {
    if (spotIds.length === 0) return [];
    try {
      return await this._search.searchSpotPreviewsByIds(spotIds);
    } catch (error) {
      console.warn("Failed to load moderation media spot previews", error);
      return [];
    }
  }

  private async _loadUploaders(
    uploaderUids: string[],
  ): Promise<UserReferenceSchema[]> {
    const settled = await Promise.allSettled(
      uploaderUids.map((uid) => this._users.getUserRefernceById(uid)),
    );
    return settled.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    );
  }

  private _mapReview(
    review: MediaUploadReviewSchema & { id: string },
  ): ModerationMediaItem {
    const scan = review.scan_result;
    const contentType = review.content_type;
    const safety = mediaSafetyPresentation(scan);
    const isRestricted = scan?.decision === "reportable_match" || scan?.severity === "known_csam_match";
    const isFalsePositive = review.status === "dismissed";
    const isPending = ["needs_review", "blocked", "scan_failed", "audit_flagged"].includes(review.status);
    const canReview = isPending && !review.incident_path && !review.release_in_progress;
    return {
      id: review.id,
      status: review.status,
      statusLabel: review.incident_path ? $localize`Escalated to incident` : mediaReviewStatusLabels[review.status] ?? $localize`Needs review`,
      safetyLabel: safety.label,
      incidentPath: review.incident_path,
      isFalsePositive,
      canMarkFalsePositive: canReview && !isRestricted && ["needs_review", "audit_flagged"].includes(review.status),
      canEscalate: Boolean(review.incident_path) || (canReview && review.status !== "scan_failed"),
      uploaderUid: review.uid,
      targetKind: review.target_kind,
      targetId: review.target_id,
      contentType,
      publicUrl: review.approved_url,
      storagePath:
        review.approved_path ?? review.intake_path ?? review.audited_path,
      createdAtMillis: this._toMillis(review.completed_at ?? review.created_at),
      provider: scan?.provider === "google_vision_safe_search" ? "Google Vision SafeSearch" : scan?.provider,
      decision: scan?.decision,
      reason: safety.description ?? scan?.reason ?? review.failure_reason,
      labels: scan?.labels,
      labelEntries: Object.entries(scan?.labels ?? {}).map(([name, value]) => ({
        name: safeSearchLabelNames[name] ?? name,
        value: safeSearchLikelihoodLabels[value] ?? value,
      })),
      isApproved: review.status === "approved" && Boolean(review.approved_url),
      isVideo: contentType?.startsWith("video/") === true,
      isRestricted,
      canReveal: canReview && !isRestricted,
      canMarkSafe: canReview && !isRestricted,
    };
  }

  async getQuarantinedPreview(reviewId: string): Promise<string> {
    const result = await this._functions.call<
      { review_id: string },
      { url: string }
    >("getModerationMediaPreview", { review_id: reviewId });
    return result.url;
  }

  async markSafe(reviewId: string): Promise<void> {
    await this._functions.call<{ review_id: string }, { ok: true }>(
      "markMediaUploadSafe",
      { review_id: reviewId },
    );
  }

  async markFalsePositive(reviewId: string): Promise<void> {
    await this._functions.call("markMediaUploadFalsePositive", { review_id: reviewId });
  }

  async createIncident(reviewId: string): Promise<string> {
    const result = await this._functions.call<{ report_path: string }, { incident_path: string }>(
      "createSafetyIncident", { report_path: `reports/scanner_${reviewId}` },
    );
    return result.incident_path;
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
