import {
  AfterViewInit,
  Component,
  Input,
  CUSTOM_ELEMENTS_SCHEMA,
  Inject,
  PLATFORM_ID,
  inject,
} from "@angular/core";
import { MatRippleModule } from "@angular/material/core";
import { MatButtonModule, MatIconButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
} from "@angular/material/dialog";
import { StorageService } from "../../services/firebase/storage.service";

// Swiper
import Swiper from "swiper";
import { Navigation, Pagination, Zoom } from "swiper/modules";

import { isPlatformBrowser, NgOptimizedImage } from "@angular/common";
import {
  AnyMedia,
  ExternalImage,
  StorageImage,
  StorageVideo,
} from "../../../db/models/Media";
import { MediaReportDialogComponent } from "../../media-report-dialog/media-report-dialog.component";

@Component({
  selector: "app-img-carousel",
  imports: [MatRippleModule, NgOptimizedImage],
  templateUrl: "./img-carousel.component.html",
  styleUrl: "./img-carousel.component.scss",
})
export class ImgCarouselComponent {
  @Input() media: AnyMedia[] | undefined;

  constructor(
    public dialog: MatDialog,
    public storageService: StorageService
  ) {}

  imageClick(index: number) {
    this.openImageViewer(index);
  }

  openImageViewer(index: number = 0) {
    const dialogRef = this.dialog.open(SwiperDialogComponent, {
      data: { media: this.media, index: index },
      hasBackdrop: true,
      maxWidth: "95vw",
      maxHeight: "95vh",
      panelClass: "dialog",
    });

    // dialogRef.afterClosed().subscribe((result) => {
    //   console.log("The dialog was closed");
    // });
  }
}

@Component({
  selector: "swiper-dialog",
  template: `
    <div id="swiper" class="swiper w-100">
      <div class="swiper-wrapper">
        @for (mediaObj of data.media; track $index) { @if(mediaObj.type ===
        'image') {
        <div class="swiper-slide">
          <div class="swiper-zoom-container">
            <div class="swiper-img-container">
              <img ngSrc="{{ getSrc(mediaObj) }}" fill />
            </div>
          </div>
        </div>
        } }
      </div>
      <!-- pagination -->
      <div class="swiper-pagination"></div>

      <!-- navigation buttons -->
      <div class="swiper-button-prev"></div>
      <div class="swiper-button-next"></div>

      <!-- scrollbar -->
      <!-- <div class="swiper-scrollbar"></div> -->

      <button
        mat-icon-button
        style="position: absolute; top: 10px; left: 10px; z-index: 1; background-color: #00000080;"
        (click)="onReportClick()"
      >
        <mat-icon>report</mat-icon>
      </button>
      <button
        mat-icon-button
        style="position: absolute; top: 10px; right: 10px; z-index: 1; background-color: #00000080;"
        (click)="onNoClick()"
      >
        <mat-icon>close</mat-icon>
      </button>
    </div>
  `,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconButton,
    MatIcon,
    NgOptimizedImage,
  ],
  styles: [
    `
      :host {
        display: flex;
        aspect-ratio: 1;
        width: 100%;
        height: 100%;
      }

      .swiper-zoom-container {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
      }

      .swiper-img-container {
        position: relative;
        width: 100%;
        height: 100%;

        > img {
          object-fit: contain;
        }
      }
    `,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SwiperDialogComponent implements AfterViewInit {
  swiper: Swiper | null = null;
  isBroswer: boolean = false;

  dialog = inject(MatDialog);

  constructor(
    public dialogRef: MatDialogRef<SwiperDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    @Inject(PLATFORM_ID) platformId: Object,
    public storageService: StorageService
  ) {
    dialogRef.disableClose = false;

    this.isBroswer = isPlatformBrowser(platformId);
  }

  getSrc(mediaObj: StorageImage | ExternalImage): string {
    if (mediaObj instanceof StorageImage) {
      return mediaObj.getSrc(800);
    } else {
      return mediaObj.src;
    }
  }

  ngAfterViewInit() {
    if (this.isBroswer) {
      this.swiper = new Swiper(".swiper", {
        modules: [Navigation, Pagination, Zoom],

        direction: "horizontal",
        loop: false,
        observer: true,
        observeParents: true,
        autoplay: false,

        pagination: {
          el: ".swiper-pagination",
          clickable: true,
          dynamicBullets: false,
        },

        navigation: {
          nextEl: ".swiper-button-next",
          prevEl: ".swiper-button-prev",
          enabled: true,
        },

        zoom: {
          maxRatio: 3,
          minRatio: 1,
          toggle: false,
        },
      });

      if (this.data.index && this.swiper) {
        this.swiper.slideTo(this.data.index, 0, false);
      }
    }
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  onReportClick(): void {
    const currentIndex = this.swiper?.activeIndex ?? this.data.index;
    const mediaDialogRef = this.dialog.open(MediaReportDialogComponent, {
      data: {
        media: this.data.media[currentIndex],
        reason: "",
        comment: "",
      },
    });

    // close the swiper dialog after opening the report dialog
    this.dialogRef.close();
  }
}
