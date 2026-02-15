import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  Input,
  Output,
  EventEmitter,
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
import { MapsApiService } from "../../services/maps-api.service";

@Component({
  selector: "app-img-carousel",
  imports: [MatRippleModule, NgOptimizedImage, MatProgressSpinnerModule],
  templateUrl: "./img-carousel.component.html",
  styleUrl: "./img-carousel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImgCarouselComponent {
  @Input() media: AnyMedia[] | undefined;
  @Input() spotId: string | undefined;

  /** Tracks images that failed to load and are being retried */
  imageLoadErrors = signal<Set<number>>(new Set());
  /** Tracks the retry count for each image index */
  private retryCountMap = new Map<number, number>();
  private readonly MAX_RETRIES = 10;
  private readonly RETRY_DELAY_MS = 3000;

  /** Tracks indices of images that should be hidden (e.g. broken external images) */
  /** Tracks indices of images that should be hidden (e.g. broken external images) */
  hiddenIndices = signal<Set<number>>(new Set());

  @Output() mediaRemove = new EventEmitter<AnyMedia>();

  mapsApiService = inject(MapsApiService);

  constructor(
    public dialog: MatDialog,
    public storageService: StorageService
  ) {}

  /**
   * Called when an image fails to load.
   * For StorageImages, this likely means the resized version isn't ready yet.
   */
  onImageError(event: Event, index: number, mediaObj: AnyMedia): void {
    if (mediaObj instanceof StorageImage) {
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
    } else if (mediaObj instanceof ExternalImage) {
      if (mediaObj.userId === "streetview") {
        this.mediaRemove.emit(mediaObj);
      }

      // For any broken external image, hide it.
      this.hiddenIndices.update((set) => {
        const newSet = new Set(set);
        newSet.add(index);
        return newSet;
      });
    }
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
      data: { media: this.media, index: index, spotId: this.spotId },
      hasBackdrop: true,
      maxWidth: "95vw",
      maxHeight: "95vh",
      panelClass: "dialog",
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.reportedMediaIndex !== undefined) {
        console.log(
          "Hiding reported media at index",
          result.reportedMediaIndex
        );
        this.hiddenIndices.update((set) => {
          const newSet = new Set(set);
          newSet.add(result.reportedMediaIndex);
          return newSet;
        });
      }
    });
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
              <img
                ngSrc="{{ getSrc(mediaObj) }}"
                fill
                referrerpolicy="no-referrer"
              />
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

      @if (getActiveExternalSourceUrl(); as sourceUrl) {
      <a
        mat-stroked-button
        style="position: absolute; left: 10px; bottom: 10px; z-index: 1; background-color: #000000b0;"
        [href]="sourceUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        <mat-icon>open_in_new</mat-icon>
        <span>Open Source</span>
      </a>
      }
      @if (getActiveAttributionText(); as attributionText) {
      <div
        style="position: absolute; right: 10px; bottom: 10px; z-index: 1; background-color: #000000b0; border-radius: 12px; padding: 6px 10px; max-width: 70%;"
        class="mat-body-small"
      >
        {{ attributionText }}
      </div>
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

  getActiveMedia(): AnyMedia | undefined {
    const activeIndex = this.swiper?.activeIndex ?? this.activeSlideIndex();
    const images =
      this.data.media?.filter((m: AnyMedia) => m.type === "image") ?? [];
    return images[activeIndex];
  }

  getActiveExternalSourceUrl(): string | null {
    const active = this.getActiveMedia();
    if (!active || !(active instanceof ExternalImage)) {
      return null;
    }
    return active.attribution?.source_url || active.src;
  }

  getActiveAttributionText(): string | null {
    const active = this.getActiveMedia();
    if (!active || !(active instanceof ExternalImage)) {
      return null;
    }
    const parts = [
      active.attribution?.title,
      active.attribution?.author,
      active.attribution?.license,
    ].filter((p) => !!p);
    if (parts.length === 0) {
      return null;
    }
    return parts.join(" · ");
  }

  ngAfterViewInit() {
    if (this.isBroswer) {
      // Filter images to match template logic
      const images =
        this.data.media?.filter((m: AnyMedia) => m.type === "image") ?? [];

      // Find the initial slide index corresponding to the passed original index
      let initialSlide = 0;
      if (this.data.index !== undefined && this.data.media) {
        const targetMedia = this.data.media[this.data.index];
        initialSlide = images.indexOf(targetMedia);
        if (initialSlide === -1) initialSlide = 0;
      }

      this.swiper = new Swiper(".swiper", {
        modules: [Navigation, Pagination, Zoom],

        direction: "horizontal",
        loop: false,
        observer: true,
        observeParents: true,
        autoplay: false,
        initialSlide: initialSlide, // Use mapped index

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

      // Update active slide index when swiper slide changes
      this.swiper?.on("slideChange", () => {
        this.activeSlideIndex.set(this.swiper?.activeIndex ?? 0);
      });

      // Set initial index
      this.activeSlideIndex.set(initialSlide);
    }
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  onReportClick(): void {
    const activeIndex = this.swiper?.activeIndex ?? this.activeSlideIndex();

    // Get filtered images (as rendered in swiper)
    const images =
      this.data.media?.filter((m: AnyMedia) => m.type === "image") ?? [];
    const mediaItem = images[activeIndex];

    if (!mediaItem) {
      console.warn("Could not find media item to report");
      return;
    }

    // Find original index in the full media list
    const originalIndex = this.data.media.indexOf(mediaItem);

    const mediaDialogRef = this.dialog.open(MediaReportDialogComponent, {
      data: {
        media: mediaItem,
        spotId: this.data.spotId,
        reason: "",
        comment: "",
      },
    });

    mediaDialogRef.afterClosed().subscribe((result) => {
      if (result === true) {
        // Report was submitted successfully
        // Close the swiper dialog and pass back the reported index (original)
        this.dialogRef.close({ reportedMediaIndex: originalIndex });
      }
    });
  }
}
