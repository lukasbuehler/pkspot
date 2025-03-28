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
  Input,
  InputSignal,
  OnInit,
  Output,
} from "@angular/core";
import { MatIcon } from "@angular/material/icon";
import { MatIconButton } from "@angular/material/button";
import { NgIf, NgFor, NgOptimizedImage } from "@angular/common";
import { StorageService } from "../services/firebase/storage.service";
import { AnyMedia, StorageImage, StorageVideo } from "../../db/models/Media";

@Component({
  selector: "app-media-preview-grid",
  templateUrl: "./media-preview-grid.component.html",
  styleUrls: ["./media-preview-grid.component.scss"],
  imports: [
    NgIf,
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

  mediaSources = computed(() => {
    const media = this.media();
    return media.map((mediaObj) => {
      if (mediaObj instanceof StorageImage) {
        return mediaObj.getSrc(400);
      } else if (mediaObj instanceof StorageVideo) {
        return mediaObj.getPreviewImageSrc();
      } else {
        return mediaObj.src;
      }
    });
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

  removeMedia(index: number) {
    let mediaCopy: AnyMedia[] = JSON.parse(JSON.stringify(this.media()));
    mediaCopy.splice(index, 1);
    this.mediaChanged.emit(mediaCopy);
  }
}
