// used this answer on github for help: https://github.com/angular/components/issues/13372#issuecomment-447129222

import {
  CdkDragDrop,
  moveItemInArray,
  CdkDropListGroup,
  CdkDropList,
  CdkDrag,
} from "@angular/cdk/drag-drop";
import {
  Component,
  computed,
  inject,
  input,
  signal,
  ChangeDetectionStrategy,
  output,
} from "@angular/core";
import { MatIcon } from "@angular/material/icon";
import { MatIconButton } from "@angular/material/button";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import type { PendingMediaPreview } from "../../services/firebase/firestore/media-upload-status.service";
import { NgOptimizedImage } from "@angular/common";
import { AnyMedia, StorageImage, StorageVideo } from "../../../db/models/Media";
import { MatDialog } from "@angular/material/dialog";
import { MediaReportDialogComponent } from "../../media-report-dialog/media-report-dialog.component";

@Component({
  selector: "app-media-preview-grid",
  templateUrl: "./media-preview-grid.component.html",
  styleUrls: ["./media-preview-grid.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    MatIconButton,
    MatIcon,
    NgOptimizedImage,
    MatProgressSpinner,
  ],
})
export class MediaPreviewGridComponent {
  readonly media = input<readonly AnyMedia[]>([]);
  readonly spotId = input<string>();
  readonly processingMedia = input<readonly PendingMediaPreview[]>([]);
  readonly mediaChanged = output<AnyMedia[]>();

  private readonly dialog = inject(MatDialog);
  // Key by media identity so loading and fallback state follow drag-and-drop moves.
  private readonly imageStates = signal<ReadonlyMap<AnyMedia, {
    original: boolean;
    settled: boolean;
    failed: boolean;
  }>>(new Map());

  readonly mediaPreviews = computed(() => {
    const states = this.imageStates();
    return this.media().map((media) => {
      const state = states.get(media);
      let src: string;
      if (media instanceof StorageImage) {
        src = state?.original ? media.getOriginalSrc() : media.getSrc(200);
      } else if (media instanceof StorageVideo) {
        src = media.thumbnail.getSrc(200);
      } else {
        src = media.src;
      }
      return {
        media,
        src,
        loading: !!src && !state?.settled,
        failed: !!state?.failed,
      };
    });
  });

  drop(event: CdkDragDrop<number>): void {
    const newMedia = [...this.media()];
    moveItemInArray(
      newMedia,
      event.previousContainer.data,
      event.container.data,
    );

    this.mediaChanged.emit(newMedia);
  }

  reportMedia(index: number): void {
    const mediaItem = this.media()[index];
    this.dialog.open(MediaReportDialogComponent, {
      data: { media: mediaItem, spotId: this.spotId() },
    });
  }

  onImageLoad(media: AnyMedia): void {
    this.imageStates.update((states) => new Map(states).set(media, {
      original: states.get(media)?.original ?? false,
      settled: true,
      failed: false,
    }));
  }

  onImageError(media: AnyMedia): void {
    this.imageStates.update((states) => {
      const original = states.get(media)?.original ?? false;
      const canFallback = media instanceof StorageImage && !original;
      return new Map(states).set(media, {
        original: original || canFallback,
        settled: !canFallback,
        failed: !canFallback,
      });
    });
  }
}
