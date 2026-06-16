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
  ExternalVideo,
  StorageImage,
  StorageVideo,
} from "../../../db/models/Media";
import { MediaReportDialogComponent } from "../../media-report-dialog/media-report-dialog.component";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MapsApiService } from "../../services/maps-api.service";
import { isFirstPartyStorageUrl } from "../../utils/first-party-media-url";

export type ImgCarouselImageFit = "cover" | "contain";

interface ExternalMediaPreference {
  allowAll: boolean;
  allowedDomains: string[];
  temporaryAllowedDomains?: Record<string, number>;
}

@Component({
  selector: "app-img-carousel",
  imports: [
    NgOptimizedImage,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconButton,
    MatIcon,
  ],
  templateUrl: "./img-carousel.component.html",
  styleUrl: "./img-carousel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImgCarouselComponent implements AfterViewInit, OnDestroy {
  media = input<AnyMedia[] | undefined>();
  spotId = input<string | undefined>();
  reportContext = input<"spot" | "event" | "media">("media");
  reportTargetId = input<string | undefined>();

  /** Tracks images that failed to load and are being retried */
  imageLoadErrors = signal<Set<number>>(new Set());
  /** Tracks storage images whose resized variant failed and should use the original object. */
  originalFallbackIndices = signal<Set<number>>(new Set());
  /** Tracks storage images whose original object failed and should use the extension failed copy. */
  failedCopyFallbackIndices = signal<Set<number>>(new Set());

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
  canScrollLeft = signal(false);
  canScrollRight = signal(false);
  videoMuted = signal(true);
  private readonly externalMediaPreferenceStorageKey =
    "pkspot.showExternalMedia.v1";
  private readonly temporaryExternalMediaDurationMs = 60 * 60 * 1000;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  externalMediaPreference = signal(this.readExternalMediaPreference());

  hasBlockedExternalMedia = computed(() =>
    (this.media() ?? []).some(
      (mediaObj, index) =>
        this.isExternalMedia(mediaObj) &&
        this.isPreviewMedia(mediaObj) &&
        !this.hiddenIndices().has(index) &&
        !mediaObj.isReported &&
        !this.isExternalMediaAllowed(mediaObj),
    ),
  );

  mapsApiService = inject(MapsApiService);
  private resizeAnimationFrame: number | null = null;
  private previewResizeObserver: ResizeObserver | null = null;
  private autoplayIntersectionObserver: IntersectionObserver | null = null;
  private readonly autoplayVideos = new Map<number, HTMLVideoElement>();
  private readonly videoCurrentTimes = new Map<number, number>();
  private activePreviewPointerId: number | null = null;
  private previewDragStartX = 0;
  private previewDragStartY = 0;
  private previewDragStartScrollLeft = 0;
  private previewDragMoved = false;
  private previewDragDirection: "horizontal" | "vertical" | null = null;
  private readonly previewDragLockThresholdPx = 6;
  private readonly previewGapPx = 10;
  private readonly containedImageDefaultBackground =
    "var(--mat-sys-surface-container-highest)";
  readonly scrollLeftLabel = "Scroll images left";
  readonly scrollRightLabel = "Scroll images right";

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
    if (typeof IntersectionObserver !== "undefined") {
      this.autoplayIntersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const video = entry.target as HTMLVideoElement;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
              void video.play().catch(() => {
                // Muted autoplay can still be blocked on some platforms.
              });
            } else {
              video.pause();
            }
          }
        },
        { threshold: [0, 0.35, 0.7] },
      );
    }
    this.queuePreviewResize();
  }

  ngOnDestroy(): void {
    if (this.resizeAnimationFrame !== null) {
      cancelAnimationFrame(this.resizeAnimationFrame);
    }
    this.previewResizeObserver?.disconnect();
    this.autoplayIntersectionObserver?.disconnect();
    this.autoplayVideos.clear();
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

  onVideoMetadataLoaded(event: Event, index: number): void {
    const video = event.currentTarget as HTMLVideoElement;
    video.muted = this.videoMuted();
    const savedTime = this.videoCurrentTimes.get(index);
    if (savedTime !== undefined && Number.isFinite(savedTime)) {
      video.currentTime = Math.min(savedTime, video.duration || savedTime);
    }
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const aspectRatio = video.videoWidth / video.videoHeight;
      this.imageAspectRatios.update((ratios) => {
        const next = new Map(ratios);
        next.set(index, aspectRatio);
        return next;
      });
      const container = video.closest<HTMLElement>(".spot-img-container");
      container?.style.setProperty("--image-aspect-ratio", String(aspectRatio));
      this.queuePreviewResize();
    }
    this.registerAutoplayVideo(index, video);
  }

  onPreviewVideoTimeUpdate(event: Event, index: number): void {
    const video = event.currentTarget as HTMLVideoElement;
    if (Number.isFinite(video.currentTime)) {
      this.videoCurrentTimes.set(index, video.currentTime);
    }
  }

  private registerAutoplayVideo(index: number, video: HTMLVideoElement): void {
    const current = this.autoplayVideos.get(index);
    if (current === video) {
      return;
    }
    if (current) {
      this.autoplayIntersectionObserver?.unobserve(current);
      current.pause();
    }
    this.autoplayVideos.set(index, video);
    this.autoplayIntersectionObserver?.observe(video);
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

  isPreviewMedia(mediaObj: AnyMedia): boolean {
    return mediaObj instanceof ExternalVideo || mediaObj.type === "image";
  }

  shouldShowPreviewMedia(mediaObj: AnyMedia, index: number): boolean {
    return (
      this.isPreviewMedia(mediaObj) &&
      !this.hiddenIndices().has(index) &&
      !mediaObj.isReported &&
      (!this.isExternalMedia(mediaObj) || this.isExternalMediaAllowed(mediaObj))
    );
  }

  shouldShowExternalMediaGate(mediaObj: AnyMedia, index: number): boolean {
    const domain = this.getExternalMediaDomain(mediaObj);
    return (
      this.isExternalMedia(mediaObj) &&
      this.isPreviewMedia(mediaObj) &&
      !this.hiddenIndices().has(index) &&
      !mediaObj.isReported &&
      domain !== null &&
      !this.isExternalMediaAllowed(mediaObj) &&
      index === this.getFirstBlockedExternalMediaIndexForDomain(domain)
    );
  }

  isExternalVideo(mediaObj: AnyMedia): mediaObj is ExternalVideo {
    return mediaObj instanceof ExternalVideo;
  }

  allowExternalMediaDomain(mediaObj: AnyMedia): void {
    this.allowExternalMediaDomainWithDuration(mediaObj, null);
  }

  allowExternalMediaDomainTemporarily(mediaObj: AnyMedia): void {
    this.allowExternalMediaDomainWithDuration(
      mediaObj,
      Date.now() + this.temporaryExternalMediaDurationMs,
    );
  }

  private allowExternalMediaDomainWithDuration(
    mediaObj: AnyMedia,
    expiresAt: number | null,
  ): void {
    const domain = this.getExternalMediaDomain(mediaObj);
    if (!domain) {
      return;
    }
    this.externalMediaPreference.update((preference) => {
      const temporaryAllowedDomains = {
        ...(preference.temporaryAllowedDomains ?? {}),
      };

      if (expiresAt === null) {
        delete temporaryAllowedDomains[domain];
      } else {
        temporaryAllowedDomains[domain] = expiresAt;
      }

      const next = {
        ...preference,
        allowedDomains:
          expiresAt === null && !preference.allowedDomains.includes(domain)
            ? [...preference.allowedDomains, domain]
            : preference.allowedDomains,
        temporaryAllowedDomains,
      };
      this.writeExternalMediaPreference(next);
      return next;
    });
    this.queuePreviewResize();
  }

  allowAllExternalMedia(): void {
    const next = {
      ...this.externalMediaPreference(),
      allowAll: true,
    };
    this.externalMediaPreference.set(next);
    this.writeExternalMediaPreference(next);
    this.queuePreviewResize();
  }

  getExternalMediaSourceLabel(mediaObj?: AnyMedia): string | null {
    const externalMediaObj =
      mediaObj && this.isExternalMedia(mediaObj)
        ? mediaObj
        : (this.media() ?? []).find((item) => this.isExternalMedia(item));
    if (!externalMediaObj) {
      return null;
    }
    return (
      externalMediaObj.attributionText ||
      externalMediaObj.attribution?.author ||
      externalMediaObj.attribution?.title ||
      this.getExternalMediaDomain(externalMediaObj)
    );
  }

  getExternalMediaDomainLabel(mediaObj: AnyMedia): string | null {
    return this.getExternalMediaDomain(mediaObj);
  }

  getTemporaryExternalMediaExpiry(mediaObj: AnyMedia): number | null {
    const domain = this.getExternalMediaDomain(mediaObj);
    if (!domain) {
      return null;
    }
    return (
      this.externalMediaPreference().temporaryAllowedDomains?.[domain] ?? null
    );
  }

  private isExternalMediaAllowed(mediaObj: AnyMedia): boolean {
    const domain = this.getExternalMediaDomain(mediaObj);
    if (!domain) {
      return false;
    }
    const preference = this.externalMediaPreference();
    const temporaryExpiry = preference.temporaryAllowedDomains?.[domain];
    return (
      preference.allowAll ||
      preference.allowedDomains.includes(domain) ||
      (typeof temporaryExpiry === "number" && temporaryExpiry > Date.now())
    );
  }

  private getFirstBlockedExternalMediaIndexForDomain(domain: string): number {
    return (this.media() ?? []).findIndex(
      (mediaObj, index) =>
        this.isExternalMedia(mediaObj) &&
        this.isPreviewMedia(mediaObj) &&
        this.getExternalMediaDomain(mediaObj) === domain &&
        !this.hiddenIndices().has(index) &&
        !mediaObj.isReported &&
        !this.isExternalMediaAllowed(mediaObj),
    );
  }

  private getExternalMediaDomain(mediaObj: AnyMedia): string | null {
    if (!this.isExternalMedia(mediaObj)) {
      return null;
    }
    return this.getUrlDomain(mediaObj.src);
  }

  private writeExternalMediaPreference(preference: ExternalMediaPreference): void {
    if (this.isBrowser) {
      const now = Date.now();
      const temporaryAllowedDomains = Object.fromEntries(
        Object.entries(preference.temporaryAllowedDomains ?? {}).filter(
          ([, expiresAt]) => expiresAt > now,
        ),
      );
      localStorage.setItem(
        this.externalMediaPreferenceStorageKey,
        JSON.stringify({
          allowAll: preference.allowAll,
          allowedDomains: preference.allowedDomains,
          temporaryAllowedDomains,
        }),
      );
    }
  }

  getExternalSourceUrl(mediaObj: AnyMedia): string | null {
    if (mediaObj.sourcePageUrl) {
      return mediaObj.sourcePageUrl;
    }
    if (
      mediaObj instanceof ExternalImage ||
      mediaObj instanceof ExternalVideo
    ) {
      if (mediaObj.userId === "streetview") {
        return null;
      }
      if (isFirstPartyStorageUrl(mediaObj.src)) {
        return mediaObj.attribution?.source_url ?? null;
      }
      return mediaObj.attribution?.source_url ?? this.getRemoteUrl(mediaObj.src);
    }
    return null;
  }

  getReferrerPolicyForMedia(mediaObj: AnyMedia): "no-referrer" | null {
    return mediaObj.userId === "streetview" ? null : "no-referrer";
  }

  imageClick(index: number) {
    const mediaObj = this.media()?.[index];
    if (!mediaObj || !this.shouldShowPreviewMedia(mediaObj, index)) {
      return;
    }
    this.openImageViewer(index);
  }

  onExternalSourceClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  onExternalMediaGateCardClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  togglePreviewVideoMuted(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.videoMuted.update((muted) => !muted);
    this.syncPreviewVideosMuted();
  }

  onPreviewScroll(): void {
    this.queuePreviewResize();
  }

  scrollPreview(direction: "left" | "right"): void {
    const scroller = this.previewScroller?.nativeElement;
    if (!scroller) {
      return;
    }

    const distance = Math.max(scroller.clientWidth * 0.72, 180);
    scroller.scrollBy({
      left: direction === "right" ? distance : -distance,
      behavior: "smooth",
    });
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
    this.previewDragStartY = event.clientY;
    this.previewDragStartScrollLeft = scroller.scrollLeft;
    this.previewDragMoved = false;
    this.previewDragDirection = null;
    event.stopPropagation();
    scroller.setPointerCapture(event.pointerId);
  }

  onPreviewPointerMove(event: PointerEvent): void {
    const scroller = this.previewScroller?.nativeElement;
    if (!scroller || this.activePreviewPointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - this.previewDragStartX;
    const deltaY = event.clientY - this.previewDragStartY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (
      this.previewDragDirection === null &&
      Math.max(absDeltaX, absDeltaY) >= this.previewDragLockThresholdPx
    ) {
      this.previewDragDirection =
        absDeltaX >= absDeltaY ? "horizontal" : "vertical";
    }

    if (this.previewDragDirection === "vertical") {
      this.previewDragMoved = true;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (this.previewDragDirection !== "horizontal") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (absDeltaX > 3) {
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
    if (this.previewDragDirection !== null) {
      event.stopPropagation();
    }
    this.activePreviewPointerId = null;
    this.previewDragDirection = null;
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
    const previewVideo = this.autoplayVideos.get(index);
    const previewVideoParent = previewVideo?.parentNode ?? null;
    const previewVideoNextSibling = previewVideo?.nextSibling ?? null;
    if (previewVideo) {
      this.autoplayIntersectionObserver?.unobserve(previewVideo);
    }
    const dialogRef = this.dialog.open(SwiperDialogComponent, {
      data: {
        media: this.media(),
        index: index,
        spotId: this.spotId(),
        reportContext: this.reportContext(),
        reportTargetId: this.reportTargetId() ?? this.spotId(),
        externalMediaPreference: this.externalMediaPreference(),
        initialVideoMuted: this.videoMuted(),
        initialVideoTime:
          previewVideo?.currentTime ?? this.videoCurrentTimes.get(index),
        reusedVideoElement: previewVideo,
        reusedVideoParent: previewVideoParent,
        reusedVideoNextSibling: previewVideoNextSibling,
      },
      hasBackdrop: true,
      maxWidth: "95vw",
      maxHeight: "95vh",
      panelClass: "dialog",
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (previewVideo && previewVideoParent) {
        previewVideo.removeAttribute("controls");
        previewVideo.classList.remove("swiper-video");
        previewVideo.style.position = "";
        previewVideo.style.inset = "";
        previewVideo.style.width = "";
        previewVideo.style.height = "";
        previewVideo.style.maxWidth = "";
        previewVideo.style.maxHeight = "";
        previewVideo.style.objectFit = "";
        previewVideoParent.insertBefore(previewVideo, previewVideoNextSibling);
        this.autoplayIntersectionObserver?.observe(previewVideo);
      }
      if (typeof result?.videoMuted === "boolean") {
        this.videoMuted.set(result.videoMuted);
        this.syncPreviewVideosMuted();
      }
      if (
        typeof result?.mediaIndex === "number" &&
        typeof result?.videoCurrentTime === "number"
      ) {
        this.videoCurrentTimes.set(result.mediaIndex, result.videoCurrentTime);
        const video = this.autoplayVideos.get(result.mediaIndex);
        if (video) {
          video.currentTime = Math.min(
            result.videoCurrentTime,
            video.duration || result.videoCurrentTime,
          );
        }
      }
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

  private syncPreviewVideosMuted(): void {
    const muted = this.videoMuted();
    for (const video of this.autoplayVideos.values()) {
      video.muted = muted;
    }
  }

  private isExternalMedia(
    mediaObj: AnyMedia,
  ): mediaObj is ExternalImage | ExternalVideo {
    return (
      mediaObj instanceof ExternalImage ||
      mediaObj instanceof ExternalVideo
    ) && mediaObj.userId !== "streetview" &&
      this.getRemoteUrl(mediaObj.src) !== null &&
      !isFirstPartyStorageUrl(mediaObj.src);
  }

  private readExternalMediaPreference(): ExternalMediaPreference {
    const fallback = { allowAll: false, allowedDomains: [] };
    if (!this.isBrowser) {
      return fallback;
    }
    const raw = localStorage.getItem(this.externalMediaPreferenceStorageKey);
    if (raw === "true") {
      return { allowAll: true, allowedDomains: [] };
    }
    if (!raw) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<ExternalMediaPreference>;
      const now = Date.now();
      const temporaryAllowedDomains = Object.fromEntries(
        Object.entries(parsed.temporaryAllowedDomains ?? {}).filter(
          ([, expiresAt]) =>
            typeof expiresAt === "number" && expiresAt > now,
        ),
      );
      return {
        allowAll: parsed.allowAll === true,
        allowedDomains: Array.isArray(parsed.allowedDomains)
          ? parsed.allowedDomains.filter(
              (domain): domain is string =>
                typeof domain === "string" && domain.length > 0,
            )
          : [],
        temporaryAllowedDomains,
      };
    } catch {
      return fallback;
    }
  }

  private getUrlDomain(url: string | null): string | null {
    const remoteUrl = this.getRemoteUrl(url);
    if (!remoteUrl || !this.isBrowser) {
      return null;
    }
    try {
      return new URL(remoteUrl).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  private getRemoteUrl(url: string | null): string | null {
    if (!url) {
      return null;
    }
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:"
        ? parsed.toString()
        : null;
    } catch {
      return null;
    }
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
    this.updatePreviewScrollState(layout.trackWidth);

    for (const item of Array.from(
      viewport.querySelectorAll<HTMLElement>(".spot-img-container"),
    )) {
      const aspectRatio = Number(
        item.style.getPropertyValue("--image-aspect-ratio"),
      );
      const fullWidth = item.classList.contains("external-media-gate-card")
        ? this.getExternalMediaGateFullWidth(viewportWidth)
        : this.getPreviewFullWidth(viewportWidth, viewportHeight, aspectRatio);
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

  private updatePreviewScrollState(trackWidth?: number): void {
    const scroller = this.previewScroller?.nativeElement;
    if (!scroller) {
      this.canScrollLeft.set(false);
      this.canScrollRight.set(false);
      return;
    }

    const scrollWidth = trackWidth ?? scroller.scrollWidth;
    const maxScrollLeft = Math.max(scrollWidth - scroller.clientWidth, 0);
    const tolerance = 4;

    this.canScrollLeft.set(scroller.scrollLeft > tolerance);
    this.canScrollRight.set(scroller.scrollLeft < maxScrollLeft - tolerance);
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
        !this.isPreviewMedia(mediaObj) ||
        (this.isExternalMedia(mediaObj) &&
          !this.isExternalMediaAllowed(mediaObj) &&
          index !==
            this.getFirstBlockedExternalMediaIndexForDomain(
              this.getExternalMediaDomain(mediaObj) ?? "",
            )) ||
        this.hiddenIndices().has(index) ||
        mediaObj.isReported
      ) {
        continue;
      }

      widths.push(
        this.shouldShowExternalMediaGate(mediaObj, index)
          ? this.getExternalMediaGateFullWidth(viewportWidth)
          : this.getPreviewFullWidth(
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

  private getExternalMediaGateFullWidth(viewportWidth: number): number {
    return Math.max(200, Math.min(300, viewportWidth * 0.72));
  }
}

interface SwiperDialogData {
  media?: AnyMedia[];
  index?: number;
  spotId?: string;
  reportContext?: "spot" | "event" | "media";
  reportTargetId?: string;
  externalMediaPreference?: ExternalMediaPreference;
  initialVideoMuted?: boolean;
  initialVideoTime?: number;
  reusedVideoElement?: HTMLVideoElement;
  reusedVideoParent?: ParentNode | null;
  reusedVideoNextSibling?: ChildNode | null;
}

interface SwiperDialogResult {
  reportedMediaIndex?: number;
  mediaIndex?: number;
  videoMuted?: boolean;
  videoCurrentTime?: number;
}

@Component({
  selector: "swiper-dialog",
  template: `
    <div id="swiper" class="swiper w-100">
      <div class="swiper-wrapper">
        @for (mediaObj of getDialogMedia(); track $index) {
          @if (isDialogMedia(mediaObj)) {
            <div class="swiper-slide">
              <div class="swiper-zoom-container">
                <div class="swiper-img-container">
                  @if (mediaObj.type === "video") {
                    @if (isReusedVideoMedia(mediaObj)) {
                      <div
                        class="swiper-video-reuse-host"
                        [attr.data-media-index]="
                          getOriginalMediaIndexFromDialogIndex($index)
                        "
                      ></div>
                    } @else {
                      <video
                        class="swiper-video"
                        [src]="getVideoSrc(mediaObj)"
                        controls
                        playsinline
                        [muted]="videoMuted()"
                        [attr.referrerpolicy]="
                          getReferrerPolicyForMedia(mediaObj)
                        "
                        (loadedmetadata)="onSwiperVideoLoaded($event, $index)"
                        (timeupdate)="onSwiperVideoTimeUpdate($event, $index)"
                        (volumechange)="onSwiperVideoVolumeChange($event)"
                      ></video>
                    }
                  } @else {
                    <img
                      ngSrc="{{ getSrc(mediaObj) }}"
                      fill
                      [attr.referrerpolicy]="
                        getReferrerPolicyForMedia(mediaObj)
                      "
                    />
                  }
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

      <div class="swiper-top-left-actions">
        @if (getActiveExternalSourceUrl(); as sourceUrl) {
          <a
            mat-stroked-button
            class="swiper-external-source"
            [href]="sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <mat-icon>open_in_new</mat-icon>
            <span i18n="@@img_carousel.external_source">External source</span>
          </a>
        }
        @if (canReportCurrentMedia()) {
          <button
            mat-icon-button
            class="swiper-report-button d-flex"
            (click)="onReportClick()"
          >
            <mat-icon>report</mat-icon>
          </button>
        }
      </div>
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
        style="display: flex; position: absolute; top: 10px; right: 10px; z-index: 1; background-color: #00000080;"
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

        > .swiper-video,
        > .swiper-video-reuse-host {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        > .swiper-video-reuse-host {
          display: block;

          > video {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
        }
      }

      .swiper-top-left-actions {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: calc(100% - 68px);
      }

      .swiper-external-source {
        min-width: 0;
        max-width: min(320px, 100%);
        color: var(--mat-sys-primary);
        border-color: color-mix(
          in srgb,
          var(--mat-sys-primary) 42%,
          transparent
        );
        background: color-mix(in srgb, var(--mat-sys-shadow) 70%, transparent);
        backdrop-filter: blur(12px) saturate(1.3);
        -webkit-backdrop-filter: blur(12px) saturate(1.3);

        span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      .swiper-report-button {
        --mat-icon-button-hover-state-layer-opacity: 0;
        --mat-icon-button-focus-state-layer-opacity: 0;
        --mat-icon-button-pressed-state-layer-opacity: 0;

        flex: 0 0 auto;
        color: var(--mat-sys-on-surface);
        background: color-mix(in srgb, var(--mat-sys-shadow) 58%, transparent);
        backdrop-filter: blur(12px) saturate(1.3);
        -webkit-backdrop-filter: blur(12px) saturate(1.3);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SwiperDialogComponent implements AfterViewInit, OnDestroy {
  swiper: Swiper | undefined;
  isBroswer: boolean = false;
  activeSlideIndex = signal<number>(0);
  videoMuted = signal(true);
  private readonly videoCurrentTimes = new Map<number, number>();
  private reusedVideoElement: HTMLVideoElement | undefined;

  canReportCurrentMedia = computed(() => {
    const media = this.getActiveMedia();
    if (!media) return false;
    // Hide report button for Street View media
    return media.userId !== "streetview";
  });

  dialog = inject(MatDialog);

  constructor(
    public dialogRef: MatDialogRef<SwiperDialogComponent, SwiperDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: SwiperDialogData,
    @Inject(PLATFORM_ID) platformId: Object,
    public storageService: StorageService,
  ) {
    dialogRef.disableClose = true;
    dialogRef.backdropClick().subscribe(() => this.onNoClick());
    dialogRef.keydownEvents().subscribe((event) => {
      if (event.key === "Escape") {
        this.onNoClick();
      }
    });

    this.isBroswer = isPlatformBrowser(platformId);
    this.videoMuted.set(data.initialVideoMuted ?? true);
    if (
      data.index !== undefined &&
      data.initialVideoTime !== undefined &&
      Number.isFinite(data.initialVideoTime)
    ) {
      this.videoCurrentTimes.set(data.index, data.initialVideoTime);
    }
  }

  getSrc(mediaObj: AnyMedia): string {
    if (mediaObj instanceof StorageImage) {
      return mediaObj.getSrc(800);
    } else if (mediaObj instanceof ExternalImage) {
      if (mediaObj.userId === "streetview") {
        return mediaObj.src.replace(/size=\d+x\d+/i, "size=800x800");
      }
      return mediaObj.src;
    }
    return mediaObj.getPreviewImageSrc();
  }

  getVideoSrc(mediaObj: AnyMedia): string {
    if (mediaObj instanceof StorageVideo || mediaObj instanceof ExternalVideo) {
      return mediaObj.getVideoSrc();
    }
    return "";
  }

  getReferrerPolicyForMedia(mediaObj: AnyMedia): "no-referrer" | null {
    return mediaObj.userId === "streetview" ? null : "no-referrer";
  }

  getActiveMedia(): AnyMedia | undefined {
    const activeIndex = this.activeSlideIndex();
    const media = this.getDialogMedia();
    return media[activeIndex];
  }

  onSwiperVideoLoaded(event: Event, index: number): void {
    const video = event.currentTarget as HTMLVideoElement;
    const originalIndex = this.getOriginalMediaIndexFromDialogIndex(index);
    video.muted = this.videoMuted();
    const savedTime = this.videoCurrentTimes.get(originalIndex);
    if (savedTime !== undefined && Number.isFinite(savedTime)) {
      video.currentTime = Math.min(savedTime, video.duration || savedTime);
    }
  }

  onSwiperVideoTimeUpdate(event: Event, index: number): void {
    const video = event.currentTarget as HTMLVideoElement;
    if (Number.isFinite(video.currentTime)) {
      this.videoCurrentTimes.set(
        this.getOriginalMediaIndexFromDialogIndex(index),
        video.currentTime,
      );
    }
  }

  onSwiperVideoVolumeChange(event: Event): void {
    const video = event.currentTarget as HTMLVideoElement;
    this.videoMuted.set(video.muted);
  }

  getActiveExternalSourceUrl(): string | null {
    const active = this.getActiveMedia();
    if (
      !active ||
      !(active instanceof ExternalImage || active instanceof ExternalVideo)
    ) {
      return null;
    }
    if (active.userId === "streetview") {
      return null;
    }
    return (
      active.sourcePageUrl ||
      active.attribution?.source_url ||
      this.getRemoteUrl(active.src)
    );
  }

  getActiveAttributionText(): string | null {
    const active = this.getActiveMedia();
    if (
      !active ||
      !(active instanceof ExternalImage || active instanceof ExternalVideo)
    ) {
      return null;
    }
    const parts = [
      active.attribution?.title,
      active.attribution?.author,
      active.attributionText,
      active.attribution?.license,
    ].filter((p) => !!p);
    if (parts.length === 0) {
      return null;
    }
    return parts.join(" · ");
  }

  ngAfterViewInit() {
    if (this.isBroswer) {
      const media = this.getDialogMedia();

      // Find the initial slide index corresponding to the passed original index
      let initialSlide = 0;
      if (this.data.index !== undefined && this.data.media) {
        const targetMedia = this.data.media[this.data.index];
        initialSlide = media.indexOf(targetMedia);
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
      this.attachReusedVideoElement();
    }
  }

  ngOnDestroy(): void {
    if (!this.reusedVideoElement) {
      return;
    }
    this.reusedVideoElement.removeEventListener(
      "timeupdate",
      this.onReusedVideoTimeUpdate,
    );
    this.reusedVideoElement.removeEventListener(
      "volumechange",
      this.onReusedVideoVolumeChange,
    );
  }

  onNoClick(): void {
    this.dialogRef.close(this.getVideoSyncResult());
  }

  onReportClick(): void {
    const activeIndex = this.activeSlideIndex();

    const media = this.getDialogMedia();
    const mediaItem = media[activeIndex];

    if (!mediaItem) {
      console.warn("Could not find media item to report");
      return;
    }

    // Find original index in the full media list
    const originalIndex = this.data.media?.indexOf(mediaItem) ?? -1;

    const mediaDialogRef = this.dialog.open(MediaReportDialogComponent, {
      data: {
        media: mediaItem,
        spotId: this.data.spotId,
        context: this.data.reportContext,
        targetId: this.data.reportTargetId,
        reason: "",
        comment: "",
      },
    });

    mediaDialogRef.afterClosed().subscribe((result) => {
      if (result === true) {
        // Report was submitted successfully
        // Close the swiper dialog and pass back the reported index (original)
        this.dialogRef.close({
          ...this.getVideoSyncResult(),
          reportedMediaIndex: originalIndex,
        });
      }
    });
  }

  private getVideoSyncResult(): SwiperDialogResult {
    this.captureReusedVideoState();
    const activeIndex = this.activeSlideIndex();
    const media = this.getDialogMedia();
    const mediaItem = media[activeIndex];
    const originalIndex = this.data.media?.indexOf(mediaItem) ?? activeIndex;

    return {
      mediaIndex: originalIndex,
      videoMuted: this.videoMuted(),
      videoCurrentTime: this.videoCurrentTimes.get(originalIndex),
    };
  }

  getOriginalMediaIndexFromDialogIndex(index: number): number {
    const mediaItem = this.getDialogMedia()[index];
    return this.data.media?.indexOf(mediaItem) ?? index;
  }

  isReusedVideoMedia(mediaObj: AnyMedia): boolean {
    return (
      !!this.data.reusedVideoElement &&
      this.data.index !== undefined &&
      this.data.media?.[this.data.index] === mediaObj
    );
  }

  private attachReusedVideoElement(): void {
    const reusedVideo = this.data.reusedVideoElement;
    if (!reusedVideo || this.data.index === undefined) {
      return;
    }

    const host = document.querySelector<HTMLElement>(
      `.swiper-video-reuse-host[data-media-index="${this.data.index}"]`,
    );
    if (!host) {
      return;
    }

    this.reusedVideoElement = reusedVideo;
    reusedVideo.classList.add("swiper-video");
    reusedVideo.setAttribute("controls", "");
    reusedVideo.style.position = "absolute";
    reusedVideo.style.inset = "0";
    reusedVideo.style.width = "100%";
    reusedVideo.style.height = "100%";
    reusedVideo.style.maxWidth = "100%";
    reusedVideo.style.maxHeight = "100%";
    reusedVideo.style.objectFit = "contain";
    reusedVideo.muted = this.videoMuted();
    reusedVideo.addEventListener("timeupdate", this.onReusedVideoTimeUpdate);
    reusedVideo.addEventListener(
      "volumechange",
      this.onReusedVideoVolumeChange,
    );
    host.appendChild(reusedVideo);
  }

  private readonly onReusedVideoTimeUpdate = (): void => {
    this.captureReusedVideoState();
  };

  private readonly onReusedVideoVolumeChange = (): void => {
    if (this.reusedVideoElement) {
      this.videoMuted.set(this.reusedVideoElement.muted);
    }
  };

  private captureReusedVideoState(): void {
    if (!this.reusedVideoElement || this.data.index === undefined) {
      return;
    }
    this.videoMuted.set(this.reusedVideoElement.muted);
    if (Number.isFinite(this.reusedVideoElement.currentTime)) {
      this.videoCurrentTimes.set(
        this.data.index,
        this.reusedVideoElement.currentTime,
      );
    }
  }

  isDialogMedia(mediaObj: AnyMedia): boolean {
    if (!(mediaObj instanceof ExternalVideo || mediaObj.type === "image")) {
      return false;
    }
    return !this.isBlockedExternalDialogMedia(mediaObj);
  }

  getDialogMedia(): AnyMedia[] {
    return this.data.media?.filter((m) => this.isDialogMedia(m)) ?? [];
  }

  private isBlockedExternalDialogMedia(mediaObj: AnyMedia): boolean {
    if (
      !(
        (mediaObj instanceof ExternalImage ||
          mediaObj instanceof ExternalVideo) &&
        mediaObj.userId !== "streetview" &&
        !isFirstPartyStorageUrl(mediaObj.src)
      )
    ) {
      return false;
    }

    const domain = this.getRemoteDomain(mediaObj.src);
    if (!domain) {
      return false;
    }
    const preference = this.data.externalMediaPreference;
    const temporaryExpiry = preference?.temporaryAllowedDomains?.[domain];
    return !(
      preference?.allowAll ||
      preference?.allowedDomains?.includes(domain) ||
      (typeof temporaryExpiry === "number" && temporaryExpiry > Date.now())
    );
  }

  private getRemoteDomain(url: string): string | null {
    const remoteUrl = this.getRemoteUrl(url);
    if (!remoteUrl) {
      return null;
    }
    return new URL(remoteUrl).hostname.replace(/^www\./, "");
  }

  private getRemoteUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }
}
