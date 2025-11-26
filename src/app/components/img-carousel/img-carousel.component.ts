import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  Input,
  CUSTOM_ELEMENTS_SCHEMA,
  Inject,
  PLATFORM_ID,
  inject,
  signal,
  computed,
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
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

@Component({
  selector: "app-img-carousel",
  imports: [MatRippleModule, NgOptimizedImage, MatProgressSpinnerModule],
  templateUrl: "./img-carousel.component.html",
  styleUrl: "./img-carousel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImgCarouselComponent {
  @Input() media: AnyMedia[] | undefined;

  /** Tracks images that failed to load and are being retried */
  imageLoadErrors = signal<Set<number>>(new Set());
  /** Tracks the retry count for each image index */
  private retryCountMap = new Map<number, number>();
  private readonly MAX_RETRIES = 10;
  private readonly RETRY_DELAY_MS = 3000;

  constructor(
    public dialog: MatDialog,
    public storageService: StorageService
  ) {}

  /**
   * Called when an image fails to load.
   * For StorageImages, this likely means the resized version isn't ready yet.
   */
  onImageError(event: Event, index: number, mediaObj: AnyMedia): void {
    if (!(mediaObj instanceof StorageImage)) return;

    const currentRetries = this.retryCountMap.get(index) ?? 0;
    if (currentRetries >= this.MAX_RETRIES) {
      console.warn(`Max retries reached for image at index ${index}`);
      return;
    }

    // Mark this image as having an error (shows spinner)
    mediaObj.isProcessing.set(true);
    this.imageLoadErrors.update((set) => {
      const newSet = new Set(set);
      newSet.add(index);
      return newSet;
    });

    // Schedule a retry
    this.retryCountMap.set(index, currentRetries + 1);
    setTimeout(() => {
      this.retryImage(index, mediaObj);
    }, this.RETRY_DELAY_MS);
  }

  /**
   * Retries loading an image by resetting its error state.
   */
  private retryImage(index: number, mediaObj: StorageImage): void {
    // Clear the error to trigger a reload
    this.imageLoadErrors.update((set) => {
      const newSet = new Set(set);
      newSet.delete(index);
      return newSet;
    });
  }

  /**
   * Called when an image successfully loads.
   */
  onImageLoad(index: number, mediaObj: AnyMedia): void {
    if (mediaObj instanceof StorageImage) {
      mediaObj.isProcessing.set(false);
    }
    this.retryCountMap.delete(index);
    this.imageLoadErrors.update((set) => {
      const newSet = new Set(set);
      newSet.delete(index);
      return newSet;
    });
  }

  /**
   * Returns true if the image at the given index is currently being processed/loading.
   */
  isImageProcessing(index: number, mediaObj: AnyMedia): boolean {
    if (mediaObj instanceof StorageImage) {
      return mediaObj.isProcessing();
    }
    return false;
  }

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

      @if (canReportCurrentMedia()) {
      <button
        mat-icon-button
        style="position: absolute; top: 10px; left: 10px; z-index: 1; background-color: #00000080;"
        (click)="onReportClick()"
      >
        <mat-icon>report</mat-icon>
      </button>
      }
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
  swiper: Swiper | undefined;
  isBroswer: boolean = false;
  activeSlideIndex = signal<number>(0);

  canReportCurrentMedia = computed(() => {
    const index = this.activeSlideIndex();
    const media = this.data.media?.[index];
    if (!media) return false;
    // Hide report button for street view media
    console.log("media", media);
    return media.userId !== "streetview";
  });

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

      // Update active slide index when swiper slide changes
      this.swiper?.on("slideChange", () => {
        this.activeSlideIndex.set(this.swiper?.activeIndex ?? 0);
      });

      // Set initial index
      this.activeSlideIndex.set(this.data.index ?? 0);
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
