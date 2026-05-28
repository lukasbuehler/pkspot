import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  Inject,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  inject,
  signal,
  computed,
  input,
  output,
} from "@angular/core";
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

export type ImgCarouselImageFit = "cover" | "contain";

@Component({
  selector: "app-img-carousel",
  imports: [NgOptimizedImage, MatProgressSpinnerModule],
  templateUrl: "./img-carousel.component.html",
  styleUrl: "./img-carousel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImgCarouselComponent implements AfterViewInit, OnDestroy {
  media = input<AnyMedia[] | undefined>();
  spotId = input<string | undefined>();

  /** Tracks images that failed to load and are being retried */
  imageLoadErrors = signal<Set<number>>(new Set());
  /** Tracks storage images whose resized variant failed and should use the original object. */
  originalFallbackIndices = signal<Set<number>>(new Set());
  /** Tracks storage images whose original object failed and should use the extension failed copy. */
  failedCopyFallbackIndices = signal<Set<number>>(new Set());

  horizontalPaddingPx = input<number>(0);
  imageFits = input<readonly ImgCarouselImageFit[]>([]);
  imageBackgroundColors = input<readonly (string | null | undefined)[]>([]);

  /** Tracks the retry count for each image index */
  private retryCountMap = new Map<number, number>();
  private readonly MAX_RETRIES = 10;
  private readonly RETRY_DELAY_MS = 3000;

  /** Tracks indices of images that should be hidden (e.g. broken external images) */
  hiddenIndices = signal<Set<number>>(new Set());

  mediaRemove = output<AnyMedia>();
  imageAspectRatios = signal<Map<number, number>>(new Map());
  previewTrackWidth = signal(1);

  mapsApiService = inject(MapsApiService);
  private resizeAnimationFrame: number | null = null;
  private previewResizeObserver: ResizeObserver | null = null;
  private activePreviewPointerId: number | null = null;
  private previewDragStartX = 0;
  private previewDragStartScrollLeft = 0;
  private previewDragMoved = false;
  private readonly previewGapPx = 10;
  private readonly containedImageDefaultBackground =
    "var(--mat-sys-surface-container-highest)";

  @ViewChild("previewViewport")
  private previewViewport: ElementRef<HTMLElement> | undefined;

  @ViewChild("previewScroller")
  private previewScroller: ElementRef<HTMLElement> | undefined;

  constructor(
    public dialog: MatDialog,
    public storageService: StorageService,
  ) {}

  ngAfterViewInit(): void {
    if (
      typeof ResizeObserver !== "undefined" &&
      this.previewViewport?.nativeElement
    ) {
      this.previewResizeObserver = new ResizeObserver(() => {
        this.queuePreviewResize();
      });
      this.previewResizeObserver.observe(this.previewViewport.nativeElement);
    }
    this.queuePreviewResize();
  }

  ngOnDestroy(): void {
    if (this.resizeAnimationFrame !== null) {
      cancelAnimationFrame(this.resizeAnimationFrame);
    }
    this.previewResizeObserver?.disconnect();
  }

  /**
   * Called when an image fails to load.
   * For StorageImages, this likely means the resized version isn't ready yet.
   */
  onImageError(event: Event, index: number, mediaObj: AnyMedia): void {
    if (mediaObj instanceof StorageImage) {
      if (this.failedCopyFallbackIndices().has(index)) {
        console.warn(
          `All storage fallbacks failed for image at index ${index}`,
        );
        this.hiddenIndices.update((set) => {
          const newSet = new Set(set);
          newSet.add(index);
          return newSet;
        });
        return;
      }

      if (this.originalFallbackIndices().has(index)) {
        this.failedCopyFallbackIndices.update((set) => {
          const newSet = new Set(set);
          newSet.add(index);
          return newSet;
        });
        this.imageLoadErrors.update((set) => {
          const newSet = new Set(set);
          newSet.delete(index);
          return newSet;
        });
        mediaObj.isProcessing.set(false);
        return;
      }

      const currentRetries = this.retryCountMap.get(index) ?? 0;
      if (currentRetries >= this.MAX_RETRIES) {
        console.warn(
          `Max retries reached for resized image at index ${index}; falling back to original`,
        );
        this.originalFallbackIndices.update((set) => {
          const newSet = new Set(set);
          newSet.add(index);
          return newSet;
        });
        this.imageLoadErrors.update((set) => {
          const newSet = new Set(set);
          newSet.delete(index);
          return newSet;
        });
        mediaObj.isProcessing.set(false);
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
  onImageLoad(event: Event, index: number, mediaObj: AnyMedia): void {
    if (mediaObj instanceof StorageImage) {
      mediaObj.isProcessing.set(false);
    }
    const image = event.currentTarget as HTMLImageElement;
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      this.imageAspectRatios.update((ratios) => {
        const next = new Map(ratios);
        next.set(index, aspectRatio);
        return next;
      });
      const container = image.closest<HTMLElement>(".spot-img-container");
      container?.style.setProperty("--image-aspect-ratio", String(aspectRatio));
      this.queuePreviewResize();
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
      return (
        mediaObj.isProcessing() &&
        !this.originalFallbackIndices().has(index) &&
        !this.failedCopyFallbackIndices().has(index)
      );
    }
    return false;
  }

  getImageSrc(index: number, mediaObj: AnyMedia): string {
    if (mediaObj instanceof StorageImage) {
      if (this.failedCopyFallbackIndices().has(index)) {
        return mediaObj.getFailedOriginalSrc();
      }
      if (this.originalFallbackIndices().has(index)) {
        return mediaObj.getOriginalSrc();
      }
    }

    return mediaObj.getPreviewImageSrc();
  }

  getReferrerPolicyForMedia(mediaObj: AnyMedia): "no-referrer" | null {
    return mediaObj.userId === "streetview" ? null : "no-referrer";
  }

  imageClick(index: number) {
    this.openImageViewer(index);
  }

  onPreviewScroll(): void {
    this.queuePreviewResize();
  }

  onPreviewClick(event: MouseEvent): void {
    if (this.previewDragMoved) {
      this.previewDragMoved = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const viewport = this.previewViewport?.nativeElement;
    if (!viewport) {
      return;
    }

    const clickX = event.clientX;
    let closestIndex: number | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const item of Array.from(
      viewport.querySelectorAll<HTMLElement>(".spot-img-container"),
    )) {
      const index = Number(item.dataset["mediaIndex"]);
      if (!Number.isFinite(index)) {
        continue;
      }

      const rect = item.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - clickX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }

    if (closestIndex !== null) {
      this.imageClick(closestIndex);
    }
  }

  onPreviewPointerDown(event: PointerEvent): void {
    const scroller = this.previewScroller?.nativeElement;
    if (!scroller || event.button !== 0) {
      return;
    }

    this.activePreviewPointerId = event.pointerId;
    this.previewDragStartX = event.clientX;
    this.previewDragStartScrollLeft = scroller.scrollLeft;
    this.previewDragMoved = false;
    scroller.setPointerCapture(event.pointerId);
  }

  onPreviewPointerMove(event: PointerEvent): void {
    const scroller = this.previewScroller?.nativeElement;
    if (!scroller || this.activePreviewPointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - this.previewDragStartX;
    if (Math.abs(deltaX) > 3) {
      this.previewDragMoved = true;
    }
    scroller.scrollLeft = this.previewDragStartScrollLeft - deltaX;
    this.queuePreviewResize();
  }

  onPreviewPointerEnd(event: PointerEvent): void {
    const scroller = this.previewScroller?.nativeElement;
    if (this.activePreviewPointerId !== event.pointerId) {
      return;
    }

    if (scroller?.hasPointerCapture(event.pointerId)) {
      scroller.releasePointerCapture(event.pointerId);
    }
    this.activePreviewPointerId = null;
  }

  getImageAspectRatio(index: number): string {
    return String(this.imageAspectRatios().get(index) ?? 1);
  }

  getImagePreviewFit(index: number): ImgCarouselImageFit {
    return this.imageFits()[index] ?? "cover";
  }

  getImagePreviewBackgroundColor(index: number): string | null {
    if (this.getImagePreviewFit(index) !== "contain") {
      return null;
    }

    return (
      this.imageBackgroundColors()[index] ??
      this.containedImageDefaultBackground
    );
  }

  openImageViewer(index: number = 0) {
    const dialogRef = this.dialog.open(SwiperDialogComponent, {
      data: { media: this.media(), index: index, spotId: this.spotId() },
      hasBackdrop: true,
      maxWidth: "95vw",
      maxHeight: "95vh",
      panelClass: "dialog",
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.reportedMediaIndex !== undefined) {
        console.log(
          "Hiding reported media at index",
          result.reportedMediaIndex,
        );
        this.hiddenIndices.update((set) => {
          const newSet = new Set(set);
          newSet.add(result.reportedMediaIndex);
          return newSet;
        });
      }
    });
  }

  private queuePreviewResize(): void {
    if (typeof requestAnimationFrame !== "function") {
      return;
    }

    if (this.resizeAnimationFrame !== null) {
      cancelAnimationFrame(this.resizeAnimationFrame);
    }

    this.resizeAnimationFrame = requestAnimationFrame(() => {
      this.resizeAnimationFrame = null;
      this.resizePreviewItems();
    });
  }

  private resizePreviewItems(): void {
    const viewport = this.previewViewport?.nativeElement;
    const scroller = this.previewScroller?.nativeElement;
    if (!viewport || !scroller) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const viewportWidth = viewportRect.width;
    const viewportHeight = viewportRect.height;
    const scrollLeft = scroller.scrollLeft;
    const layout = this.getPreviewLayout(viewportWidth, viewportHeight);
    let virtualLeft = layout.startInset;

    this.previewTrackWidth.set(layout.trackWidth);

    for (const item of Array.from(
      viewport.querySelectorAll<HTMLElement>(".spot-img-container"),
    )) {
      const aspectRatio = Number(
        item.style.getPropertyValue("--image-aspect-ratio"),
      );
      const fullWidth = this.getPreviewFullWidth(
        viewportWidth,
        viewportHeight,
        aspectRatio,
      );
      const virtualItemLeft = virtualLeft - scrollLeft;
      const virtualItemRight = virtualItemLeft + fullWidth;
      const visualLeft = Math.max(0, virtualItemLeft);
      const visualRight = Math.min(viewportWidth, virtualItemRight);
      const visualWidth = Math.max(0, visualRight - visualLeft);

      item.style.width = `${visualWidth}px`;
      item.style.left = `${visualLeft}px`;
      item.style.opacity = visualWidth > 0 ? "1" : "0";
      item.style.zIndex = "";

      const frame = item.querySelector<HTMLElement>(".spot-img-frame");
      if (frame) {
        if (item.classList.contains("contained-preview")) {
          frame.style.width = `${fullWidth}px`;
          frame.style.left = `${virtualItemLeft - visualLeft}px`;
        } else {
          frame.style.width = "";
          frame.style.left = "";
        }
      }

      virtualLeft += fullWidth + this.previewGapPx;
    }
  }

  private getPreviewLayout(
    viewportWidth: number,
    viewportHeight: number,
  ): { startInset: number; trackWidth: number } {
    const mediaItems = this.media() ?? [];
    const widths: number[] = [];

    for (let index = 0; index < mediaItems.length; index++) {
      const mediaObj = mediaItems[index];
      if (
        mediaObj?.type !== "image" ||
        this.hiddenIndices().has(index) ||
        mediaObj.isReported
      ) {
        continue;
      }

      widths.push(
        this.getPreviewFullWidth(
          viewportWidth,
          viewportHeight,
          this.imageAspectRatios().get(index) ?? 1,
        ),
      );
    }

    if (widths.length === 0) {
      return { startInset: 0, trackWidth: 1 };
    }

    const contentWidth =
      widths.reduce((total, width) => total + width, 0) +
      this.previewGapPx * (widths.length - 1);

    return {
      startInset: 0,
      trackWidth: Math.max(1, contentWidth),
    };
  }

  private getPreviewFullWidth(
    viewportWidth: number,
    viewportHeight: number,
    aspectRatio: number,
  ): number {
    const imageAspectRatio = Number.isFinite(aspectRatio) ? aspectRatio : 1;
    const naturalWidth = viewportHeight * imageAspectRatio;
    const maxWidth = Math.min(420, viewportWidth * 0.76);
    return Math.max(112, Math.min(naturalWidth, maxWidth));
  }
}

@Component({
  selector: "swiper-dialog",
  template: `
    <div id="swiper" class="swiper w-100">
      <div class="swiper-wrapper">
        @for (mediaObj of data.media; track $index) {
          @if (mediaObj.type === "image") {
            <div class="swiper-slide">
              <div class="swiper-zoom-container">
                <div class="swiper-img-container">
                  <img
                    ngSrc="{{ getSrc(mediaObj) }}"
                    fill
                    [attr.referrerpolicy]="getReferrerPolicyForMedia(mediaObj)"
                  />
                </div>
              </div>
            </div>
          }
        }
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
    // Hide report button for Street View media
    return media.userId !== "streetview";
  });

  dialog = inject(MatDialog);

  constructor(
    public dialogRef: MatDialogRef<SwiperDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    @Inject(PLATFORM_ID) platformId: Object,
    public storageService: StorageService,
  ) {
    dialogRef.disableClose = false;

    this.isBroswer = isPlatformBrowser(platformId);
  }

  getSrc(mediaObj: StorageImage | ExternalImage): string {
    if (mediaObj instanceof StorageImage) {
      return mediaObj.getSrc(800);
    } else {
      if (mediaObj.userId === "streetview") {
        return mediaObj.src.replace(/size=\d+x\d+/i, "size=800x800");
      }
      return mediaObj.src;
    }
  }

  getReferrerPolicyForMedia(mediaObj: AnyMedia): "no-referrer" | null {
    return mediaObj.userId === "streetview" ? null : "no-referrer";
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
    if (active.userId === "streetview") {
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
