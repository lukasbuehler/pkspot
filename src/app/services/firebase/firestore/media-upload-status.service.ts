import { Injectable, OnDestroy, inject, signal } from "@angular/core";
import { Subscription } from "rxjs";
import { MediaType } from "../../../../db/models/Interfaces";
import type {
  MediaUploadStatusSchema,
  MediaUploadTargetKind,
} from "../../../../db/schemas/MediaModerationSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";

export interface PendingMediaPreview {
  uploadId: string;
  targetKind: MediaUploadTargetKind;
  targetId?: string;
  type: MediaType;
  publicUrl: string;
  previewSrc?: string;
  status: MediaUploadStatusSchema["status"];
}

type MediaUploadStatusDocument = MediaUploadStatusSchema & { id: string };

@Injectable({
  providedIn: "root",
})
export class MediaUploadStatusService implements OnDestroy {
  private readonly firestoreAdapter = inject(FirestoreAdapterService);
  private readonly authService = inject(AuthenticationService);
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly remoteStatuses = signal<
    Record<string, MediaUploadStatusDocument[]>
  >({});

  readonly localUploads = signal<PendingMediaPreview[]>([]);

  ngOnDestroy(): void {
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();
  }

  trackLocalUpload(upload: Omit<PendingMediaPreview, "status">): void {
    this.localUploads.update((uploads) => [
      ...uploads.filter((item) => item.uploadId !== upload.uploadId),
      { ...upload, status: "processing" },
    ]);
  }

  watchTarget(targetKind: MediaUploadTargetKind, targetId?: string): void {
    const uid =
      this.authService.user?.uid ?? this.authService.authState$.value?.uid;
    if (!uid) {
      return;
    }

    const key = this.targetKey(targetKind, targetId, uid);
    if (this.subscriptions.has(key)) {
      return;
    }

    const filters = [
      { fieldPath: "uid", opStr: "==" as const, value: uid },
      { fieldPath: "target_kind", opStr: "==" as const, value: targetKind },
      ...(targetId
        ? [{ fieldPath: "target_id", opStr: "==" as const, value: targetId }]
        : []),
    ];

    const subscription = this.firestoreAdapter
      .collectionSnapshots<MediaUploadStatusDocument>(
        "media_upload_status",
        filters,
      )
      .subscribe({
        next: (statuses) => {
          this.remoteStatuses.update((byTarget) => ({
            ...byTarget,
            [key]: statuses,
          }));
          this.applyRemoteStatuses(statuses);
        },
        error: (error) => {
          console.warn("Failed to listen for media upload status", error);
          this.subscriptions.delete(key);
        },
      });

    this.subscriptions.set(key, subscription);
  }

  processingMediaForTarget(
    targetKind: MediaUploadTargetKind,
    targetId?: string,
    publishedMediaSources: readonly string[] = [],
  ): PendingMediaPreview[] {
    const key = this.targetKey(targetKind, targetId);
    const publishedSourceSet = new Set(publishedMediaSources);
    const isAlreadyPublished = (source: string | undefined): boolean =>
      source !== undefined && publishedSourceSet.has(source);
    const remoteByUploadId = new Map(
      (this.remoteStatuses()[key] ?? []).map((status) => [
        status.upload_id,
        status,
      ]),
    );
    const localUploadIds = new Set<string>();
    const localProcessing = this.localUploads()
      .filter(
        (upload) =>
          upload.targetKind === targetKind &&
          (upload.targetId ?? "") === (targetId ?? ""),
      )
      .flatMap((upload) => {
        localUploadIds.add(upload.uploadId);
        const remote = remoteByUploadId.get(upload.uploadId);
        const status = remote?.status ?? upload.status;
        if (
          status === "published" ||
          status === "failed" ||
          isAlreadyPublished(upload.publicUrl)
        ) {
          return [];
        }
        return [{ ...upload, status }];
      });

    const remoteProcessing = (this.remoteStatuses()[key] ?? []).flatMap(
      (status): PendingMediaPreview[] => {
        if (
          localUploadIds.has(status.upload_id) ||
          status.status === "published" ||
          status.status === "failed" ||
          isAlreadyPublished(status.public_url)
        ) {
          return [];
        }
        return [
          {
            uploadId: status.upload_id,
            targetKind,
            targetId,
            type:
              status.media_type === "video" ? MediaType.Video : MediaType.Image,
            publicUrl: status.public_url ?? "",
            status: status.status,
          },
        ];
      },
    );

    return [...localProcessing, ...remoteProcessing];
  }

  failedLocalUploadsForTarget(
    targetKind: MediaUploadTargetKind,
    targetId?: string,
  ): PendingMediaPreview[] {
    return this.localUploads().filter(
      (upload) =>
        upload.targetKind === targetKind &&
        (upload.targetId ?? "") === (targetId ?? "") &&
        upload.status === "failed",
    );
  }

  private applyRemoteStatuses(statuses: MediaUploadStatusDocument[]): void {
    const byUploadId = new Map(
      statuses.map((status) => [status.upload_id, status.status]),
    );
    this.localUploads.update((uploads) =>
      uploads
        .filter((upload) => byUploadId.get(upload.uploadId) !== "published")
        .map((upload) => ({
          ...upload,
          status: byUploadId.get(upload.uploadId) ?? upload.status,
        })),
    );
  }

  private targetKey(
    targetKind: MediaUploadTargetKind,
    targetId?: string,
    uid?: string,
  ): string {
    return `${uid ?? this.currentUid()}:${targetKind}:${targetId ?? ""}`;
  }

  private currentUid(): string {
    return this.authService.user?.uid ?? this.authService.authState$.value?.uid ?? "";
  }
}
