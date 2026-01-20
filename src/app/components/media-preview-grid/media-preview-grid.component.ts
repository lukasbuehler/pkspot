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
  EventEmitter,
  inject,
  input,
  Signal,
  InputSignal,
  OnInit,
  Output,
} from "@angular/core";
import { MatIcon } from "@angular/material/icon";
import { MatIconButton } from "@angular/material/button";
import { NgIf, NgFor, NgOptimizedImage } from "@angular/common";
import { StorageService } from "../../services/firebase/storage.service";
import { AnyMedia, StorageImage, StorageVideo } from "../../../db/models/Media";
import { MatDialog } from "@angular/material/dialog";
import { MediaReportDialogComponent } from "../../media-report-dialog/media-report-dialog.component";

@Component({
  selector: "app-media-preview-grid",
  templateUrl: "./media-preview-grid.component.html",
  styleUrls: ["./media-preview-grid.component.scss"],
  imports: [
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    MatIconButton,
    MatIcon,
    NgOptimizedImage,
  ],
})
export class MediaPreviewGridComponent implements OnInit {
  media: InputSignal<AnyMedia[]> = input<AnyMedia[]>([]);
  @Output() mediaChanged: EventEmitter<AnyMedia[]> = new EventEmitter<
    AnyMedia[]
  >();

  storageService = inject(StorageService);
  dialog = inject(MatDialog);

  mediaSources: Signal<string[]> = computed<string[]>(() => {
    const media = this.media();

    return media
      .map((mediaObj) => {
        if (mediaObj instanceof StorageImage) {
          return mediaObj.getSrc(400);
        } else if (mediaObj instanceof StorageVideo) {
          return mediaObj.getPreviewImageSrc();
        } else {
          return mediaObj.src;
        }
      })
      .filter((src) => !!src) as string[];
  });

  constructor() {}

  ngOnInit(): void {}

  drop(event: CdkDragDrop<number>) {
    moveItemInArray(
      this.media(),
      event.previousContainer.data,
      event.container.data
    );

    this.mediaChanged.emit(this.media());
  }

  reportMedia(index: number) {
    const mediaItem = this.media()[index];
    const dialogRef = this.dialog.open(MediaReportDialogComponent, {
      data: { media: mediaItem },
      // width: "400px",
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        // Report submitted successfully
        const mediaCopy: AnyMedia[] = [...this.media()];
        // Mark as reported
        // We need to cast or ensure properties exist, but AnyMedia should have isReported now
        if (typeof mediaCopy[index] === "object") {
          (mediaCopy[index] as any).isReported = true;
        }
        this.mediaChanged.emit(mediaCopy);
      }
    });
  }
}
