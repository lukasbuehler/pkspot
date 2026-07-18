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
  ],
})
export class MediaPreviewGridComponent {
  readonly media = input<readonly AnyMedia[]>([]);
  readonly spotId = input<string>();
  readonly mediaChanged = output<AnyMedia[]>();

  private readonly dialog = inject(MatDialog);
  private readonly fallbackImageIndices = signal<ReadonlySet<number>>(
    new Set(),
  );

  readonly mediaSources = computed(() => {
    const media = this.media();

    return media
      .map((mediaObj, index) => {
        if (mediaObj instanceof StorageImage) {
          if (this.fallbackImageIndices().has(index)) {
            return mediaObj.getOriginalSrc();
          }
          return mediaObj.getSrc(400);
        } else if (mediaObj instanceof StorageVideo) {
          return mediaObj.getPreviewImageSrc();
        } else {
          return mediaObj.src;
        }
      })
      .filter((src) => !!src) as string[];
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

  useOriginalFallback(index: number, mediaObj: AnyMedia): void {
    if (!(mediaObj instanceof StorageImage)) {
      return;
    }

    this.fallbackImageIndices.update((set) => {
      const newSet = new Set(set);
      newSet.add(index);
      return newSet;
    });
  }
}
