import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import { MatProgressBar } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { firstValueFrom } from "rxjs";
import { humanFileSize, generateUUID } from "../../../scripts/Helpers";
import { MediaType } from "../../../db/models/Interfaces";
import { StorageBucket } from "../../../db/schemas/Media";
import type { MediaUploadTargetKind } from "../../../db/schemas/MediaModerationSchema";
import { StorageService } from "../../services/firebase/storage.service";
import {
  DISABLED_IMAGE_CROP_POLICY,
  canCropImage,
  type ImageCropPolicy,
} from "../crop-image/image-crop-policy";
import {
  ImageCropDialogComponent,
  type ImageCropDialogData,
} from "../crop-image/image-crop-dialog.component";

export type MediaUploadState =
  | "staged"
  | "editing"
  | "uploading"
  | "complete"
  | "failed";

export interface UploadMedia {
  id: string;
  originalFile: File;
  file: File;
  originalPreviewSrc: string;
  previewSrc: string;
  icon: string;
  uploadProgress: number;
  type: MediaType;
  state: MediaUploadState;
  isCropped: boolean;
  error?: string;
}

export interface MediaUploadEvent {
  src: string;
  is_sized: boolean;
  type: MediaType;
  uploadId?: string;
  previewSrc?: string;
  targetKind?: MediaUploadTargetKind;
  targetId?: string;
}

@Component({
  selector: "app-media-upload",
  templateUrl: "./media-upload.component.html",
  styleUrls: ["./media-upload.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButton,
    MatIconButton,
    MatIcon,
    MatProgressBar,
  ],
})
export class MediaUpload implements OnInit, OnDestroy {
  private readonly snackbar = inject(MatSnackBar);
  private readonly storageService = inject(StorageService);
  private readonly dialog = inject(MatDialog);

  readonly required = input(false);
  readonly multipleAllowed = input(false);
  readonly storageFolder = input<StorageBucket | null>(null);
  readonly uploadToStorage = input(true);
  readonly maximumSizeInBytes = input(500 * 1024 * 1024);
  readonly allowedMimeTypes = input<string[] | null>(null);
  readonly acceptString = input<string | null>(null);
  readonly moderationTargetKind = input<MediaUploadTargetKind | null>(null);
  readonly moderationTargetId = input<string | null>(null);
  readonly imageCropPolicy = input<ImageCropPolicy>(
    DISABLED_IMAGE_CROP_POLICY,
  );

  readonly changed = output<void>();
  readonly newMedia = output<MediaUploadEvent>();
  readonly fileSelected = output<File>();
  readonly mediaBatchUploaded = output<MediaUploadEvent[]>();
  readonly isUploading = output<boolean>();

  readonly mediaList = signal<UploadMedia[]>([]);
  readonly uploading = computed(() =>
    this.mediaList().some((media) => media.state === "uploading"),
  );
  readonly hasPendingMedia = computed(() =>
    this.mediaList().some(
      (media) => media.state === "staged" || media.state === "failed",
    ),
  );
  readonly hasIncompleteRequiredCrop = computed(
    () =>
      this.imageCropPolicy().requirement === "required" &&
      this.mediaList().some(
        (media) => canCropImage(media.file) && !media.isCropped,
      ),
  );

  hasError = false;
  errorMessage = "";
  private batchGeneration = 0;

  ngOnInit(): void {
    if (this.storageFolder() === null && this.uploadToStorage()) {
      console.error("No storage folder specified for media upload");
    }
  }

  ngOnDestroy(): void {
    this.revokeAllPreviews();
  }

  onSelectFiles(eventTarget: EventTarget | null): void {
    const files = Array.from(
      (eventTarget as HTMLInputElement | null)?.files ?? [],
    );
    if (files.length === 0) return;

    this.hasError = false;
    this.errorMessage = "";
    const validFiles: File[] = [];
    for (const file of files) {
      const validationError = this.validateFile(file);
      if (validationError) {
        this.hasError = true;
        this.errorMessage = validationError;
        this.snackbar.open(validationError, $localize`Dismiss`, {
          duration: 5000,
        });
        return;
      }
      validFiles.push(file);
    }

    if (!this.multipleAllowed()) {
      this.revokeAllPreviews();
    }
    const staged = validFiles.map((file) => this.stageFile(file));
    this.mediaList.update((current) =>
      this.multipleAllowed() ? [...current, ...staged] : staged.slice(0, 1),
    );
    this.changed.emit();

    if (
      this.imageCropPolicy().requirement === "required" &&
      staged[0] &&
      canCropImage(staged[0].file)
    ) {
      void this.editImage(staged[0].id);
    }
  }

  async editImage(id: string): Promise<void> {
    const media = this.mediaList().find((item) => item.id === id);
    if (!media || !canCropImage(media.file) || media.state === "uploading") {
      return;
    }

    this.updateMedia(id, { state: "editing" });
    const ref = this.dialog.open<
      ImageCropDialogComponent,
      ImageCropDialogData,
      File | undefined
    >(ImageCropDialogComponent, {
      data: {
        file: media.isCropped ? media.originalFile : media.file,
        policy: this.imageCropPolicy(),
        title: $localize`Crop image`,
      },
      maxWidth: "100vw",
      maxHeight: "100dvh",
      panelClass: "image-crop-dialog-panel",
      autoFocus: "dialog",
      restoreFocus: true,
    });
    const croppedFile = await firstValueFrom(ref.afterClosed(), {
      defaultValue: undefined,
    });
    const current = this.mediaList().find((item) => item.id === id);
    if (!current) return;

    if (!croppedFile) {
      if (this.imageCropPolicy().requirement === "required" && !current.isCropped) {
        this.removeMedia(id);
      } else {
        this.updateMedia(id, { state: "staged" });
      }
      return;
    }

    if (
      current.previewSrc !== current.originalPreviewSrc &&
      current.previewSrc.startsWith("blob:")
    ) {
      URL.revokeObjectURL(current.previewSrc);
    }
    this.updateMedia(id, {
      file: croppedFile,
      previewSrc: URL.createObjectURL(croppedFile),
      state: "staged",
      isCropped: true,
      error: undefined,
    });
    this.changed.emit();
  }

  revertCrop(id: string): void {
    const media = this.mediaList().find((item) => item.id === id);
    if (!media?.isCropped || media.state === "uploading") return;
    if (
      media.previewSrc !== media.originalPreviewSrc &&
      media.previewSrc.startsWith("blob:")
    ) {
      URL.revokeObjectURL(media.previewSrc);
    }
    this.updateMedia(id, {
      file: media.originalFile,
      previewSrc: media.originalPreviewSrc,
      state: "staged",
      isCropped: false,
      error: undefined,
    });
    this.changed.emit();
  }

  removeMedia(id: string): void {
    const media = this.mediaList().find((item) => item.id === id);
    if (!media || media.state === "uploading") return;
    this.revokePreviews(media);
    this.mediaList.update((items) => items.filter((item) => item.id !== id));
    this.changed.emit();
  }

  async uploadStaged(): Promise<void> {
    if (
      this.uploading() ||
      !this.hasPendingMedia() ||
      this.hasIncompleteRequiredCrop()
    ) {
      return;
    }
    const candidates = this.mediaList().filter(
      (media) => media.state === "staged" || media.state === "failed",
    );
    if (candidates.length === 0) return;

    const generation = ++this.batchGeneration;
    this.isUploading.emit(true);
    const events = (
      await Promise.all(
        candidates.map((media) => this.uploadMedia(media, generation)),
      )
    ).filter((event): event is MediaUploadEvent => event !== null);

    if (generation !== this.batchGeneration) return;
    if (events.length > 0) this.mediaBatchUploaded.emit(events);
    this.isUploading.emit(false);
  }

  cancelBatch(): void {
    this.batchGeneration++;
    this.isUploading.emit(false);
    this.clear();
  }

  clear(): void {
    this.revokeAllPreviews();
    this.mediaList.set([]);
    this.changed.emit();
  }

  fileIsImage(file: File): boolean {
    return file.type.startsWith("image/");
  }

  private validateFile(file: File): string | null {
    const allowed = this.allowedMimeTypes();
    if (allowed && !allowed.some((type) => this.matchesMimeType(file, type))) {
      return $localize`The type of this file is not allowed.`;
    }
    if (file.size > this.maximumSizeInBytes()) {
      return $localize`The selected file was too big. It must be smaller than ${humanFileSize(
        this.maximumSizeInBytes(),
      )}.`;
    }
    return null;
  }

  private matchesMimeType(file: File, allowed: string): boolean {
    if (allowed.endsWith("/*")) {
      return file.type.startsWith(allowed.slice(0, -1));
    }
    return file.type === allowed;
  }

  private stageFile(file: File): UploadMedia {
    const previewSrc = this.fileIsImage(file) ? URL.createObjectURL(file) : "";
    return {
      id: generateUUID(),
      originalFile: file,
      file,
      originalPreviewSrc: previewSrc,
      previewSrc,
      uploadProgress: 0,
      icon: this.fileIsImage(file) ? "image" : "movie",
      type: this.fileIsImage(file) ? MediaType.Image : MediaType.Video,
      state: "staged",
      isCropped: false,
    };
  }

  private async uploadMedia(
    media: UploadMedia,
    generation: number,
  ): Promise<MediaUploadEvent | null> {
    this.updateMedia(media.id, {
      state: "uploading",
      uploadProgress: 0,
      error: undefined,
    });

    if (!this.uploadToStorage()) {
      this.fileSelected.emit(media.file);
      this.updateMedia(media.id, { state: "complete", uploadProgress: 100 });
      return null;
    }

    const storageFolder = this.storageFolder();
    if (!storageFolder) {
      this.updateMedia(media.id, {
        state: "failed",
        error: $localize`No storage destination is configured.`,
      });
      return null;
    }

    try {
      const extension = media.file.name.split(".").pop();
      const uploadResult =
        await this.storageService.setUploadToStorageWithResult(
          media.file,
          storageFolder,
          (progress) => {
            if (generation !== this.batchGeneration) return;
            this.updateMedia(media.id, { uploadProgress: progress });
          },
          generateUUID(),
          extension,
          "public, max-age=31536000",
          this.moderationTargetKind() ?? undefined,
          this.moderationTargetId() ?? undefined,
        );
      if (generation !== this.batchGeneration) return null;

      const event: MediaUploadEvent = {
        src: uploadResult.url,
        is_sized: media.type === MediaType.Image,
        type: media.type,
        uploadId: uploadResult.uploadId,
        previewSrc: media.previewSrc,
        targetKind: uploadResult.targetKind,
        targetId: uploadResult.targetId,
      };
      this.updateMedia(media.id, { state: "complete", uploadProgress: 100 });
      this.newMedia.emit(event);
      return event;
    } catch (error) {
      if (generation !== this.batchGeneration) return null;
      console.error("Error uploading media:", error);
      const message = $localize`Error uploading media. Try again.`;
      this.updateMedia(media.id, { state: "failed", error: message });
      this.snackbar.open(message, $localize`Dismiss`, { duration: 5000 });
      return null;
    }
  }

  private updateMedia(id: string, patch: Partial<UploadMedia>): void {
    this.mediaList.update((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  private revokeAllPreviews(): void {
    for (const media of this.mediaList()) this.revokePreviews(media);
  }

  private revokePreviews(media: UploadMedia): void {
    const previews = new Set([media.originalPreviewSrc, media.previewSrc]);
    for (const preview of previews) {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    }
  }
}
