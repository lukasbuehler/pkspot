import {
  AfterViewInit,
  Component,
  Input,
  Output,
  EventEmitter,
  Inject,
  LOCALE_ID,
  ElementRef,
  inject,
  input,
  computed,
  signal,
  OnDestroy,
  effect,
} from "@angular/core";
import { Router } from "@angular/router";
import { MapsApiService } from "../../services/maps-api.service";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { StorageService } from "../../services/firebase/storage.service";
import { MatCardModule } from "@angular/material/card";
import { MatRippleModule } from "@angular/material/core";
import { MatIconModule } from "@angular/material/icon";
import { NgOptimizedImage } from "@angular/common";
import { SpotRatingComponent } from "../spot-rating/spot-rating.component";
import { LocaleCode, MediaType } from "../../../db/models/Interfaces";
import { MatButtonModule } from "@angular/material/button";
import { getImportantAmenities } from "../../../db/models/Amenities";
import { isoCountryCodeToFlagEmoji } from "../../../scripts/Helpers";
import {
  SpotTypes,
  SpotAccess,
  SpotTypesIcons,
  SpotAccessIcons,
  parseSpotType,
  parseSpotAccess,
} from "../../../db/schemas/SpotTypeAndAccess";

import { MatTooltipModule } from "@angular/material/tooltip";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";

@Component({
  selector: "app-spot-preview-card",
  templateUrl: "./spot-preview-card.component.html",
  styleUrls: ["./spot-preview-card.component.scss"],
  imports: [
    MatCardModule,
    MatRippleModule,
    MatIconModule,
    NgOptimizedImage,
    SpotRatingComponent,
    MediaPlaceholderComponent,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
})
export class SpotPreviewCardComponent
  implements AfterViewInit, OnDestroy
{
  public elementRef = inject(ElementRef);

  // Spot Types and Access
  SpotTypes = SpotTypes;
  SpotAccess = SpotAccess;
  spotTypesIcons = SpotTypesIcons;
  spotAccessIcons = SpotAccessIcons;

  hasBorder = input<boolean>(true);
  imgSize = input<200 | 400 | 800>(200);
  loadingPriority = input<boolean>(false);
  mapZoom = input<number | null>(null);
  forcePlaceholderContainer = input<boolean>(false);

  spotData = input<Spot | LocalSpot | SpotPreviewData | null>(null);
  spotAmenitiesArray = computed<
    {
      name?: string;
      icon?: string;
      priority?: "high" | "medium" | "low";
      isNegative?: boolean;
    }[]
  >(() => {
    const spot = this.spotData();
    if (!spot) {
      return [];
    }
    if (spot instanceof Spot || spot instanceof LocalSpot) {
      // Use important amenities array (high-priority only)
      return spot.importantAmenitiesArray();
    }
    // For SpotPreviewData, use the centralized helper function
    const spotType =
      "type" in spot && typeof spot.type === "string" ? spot.type : undefined;
    return spot.amenities
      ? getImportantAmenities(spot.amenities, spotType)
      : [];
  });
  showInfoButton = input<boolean>(true);
  @Input() infoOnly: boolean = false;
  @Input() clickable: boolean = false;
  @Input() isCompact: boolean = false;

  @Output() spotClick: EventEmitter<Spot | LocalSpot> = new EventEmitter<
    Spot | LocalSpot
  >();
  @Output() dismiss: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() edit: EventEmitter<any> = new EventEmitter<any>();

  fallbackImgSrc = "assets/spot_placeholder.png";
  private _intersectionObserver: IntersectionObserver | null = null;
  private _isViewportSettled = signal(false);
  private _viewportTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastSpotCacheKey: string | null = null;
  private readonly _mediaLoadDelayMs = 350;
  private _hasLoadedMedia = signal(false);
  private _streetViewPreviewSrc = signal<string | null>(null);
  private _knownNoStreetViewForSpot = signal(false);
  private _streetViewPreviewEnabled = computed(() =>
    this.mapsApiService.isStreetViewPreviewEnabled()
  );
  shouldLoadMedia = computed(
    () =>
      this.loadingPriority() ||
      this._isViewportSettled() ||
      this._hasLoadedMedia() ||
      this._knownNoStreetViewForSpot()
  );
  private _shouldAttemptStreetViewPreview = computed(
    () => this._isViewportSettled() || this._hasLoadedMedia()
  );
  private _allowStreetViewPreview = computed(() => {
    if (!this._streetViewPreviewEnabled()) {
      return false;
    }

    if (!this._shouldAttemptStreetViewPreview()) {
      return false;
    }

    return this.mapsApiService.isStreetViewPreviewAllowedAtZoom(this.mapZoom());
  });

  spotName?: string;
  spotLocality?: string;
  media = computed<string[]>(() => {
    const spot = this.spotData();

    if (!spot) {
      return [];
    }

    const allowStreetViewPreview = this._allowStreetViewPreview();

    let mediaArr: string[] = [];
    let location: google.maps.LatLngLiteral | null = null;
    let isStreetViewHidden = false;

    if (!(spot instanceof Spot || spot instanceof LocalSpot)) {
      // Spot is a SpotPreviewData object
      if (spot.location) {
        location = {
          lat: spot.location.latitude,
          lng: spot.location.longitude,
        };
      }
      isStreetViewHidden = !!spot.hideStreetview;
      if (spot.imageSrc) {
        mediaArr = [spot.imageSrc];
      }
    } else {
      location = spot.location();
      isStreetViewHidden = spot.hideStreetview;
      mediaArr = spot
        .media()
        .filter((m) => m.type === MediaType.Image)
        .map((m) => m.getPreviewImageSrc());
    }

    if (!allowStreetViewPreview) {
      mediaArr = mediaArr.filter((src) => !this._isStreetViewUrl(src));
    }

    if (mediaArr.length === 0) {
      // Return Street View Static API image if available

      if (location && allowStreetViewPreview && !isStreetViewHidden) {
        const svUrl = this._streetViewPreviewSrc();

        if (svUrl) {
          mediaArr.push(svUrl);
        }
      }
    }
    return mediaArr;
  });
  failedMediaSrcs = signal<string[]>([]);
  primaryMediaSrc = computed<string | null>(() => {
    const failed = new Set(this.failedMediaSrcs());
    const media = this.media();
    for (const src of media) {
      if (!failed.has(src)) {
        return src;
      }
    }
    return null;
  });
  showNoMediaLabel = computed(
    () =>
      this.shouldLoadMedia() &&
      !this.primaryMediaSrc() &&
      this.media().length === 0 &&
      this._shouldShowNoMediaLabel()
  );

  countryCode = computed(() => {
    const spot = this.spotData();
    let code: string | undefined;
    if (!spot) return undefined;
    if (spot instanceof Spot || spot instanceof LocalSpot) {
      code = spot.address()?.country?.code;
    } else {
      // SpotPreviewData
      code = spot.countryCode;

      // Fallback: try to extract from locality string if it ends with ", XX"
      if (!code && spot.locality) {
        const match = spot.locality.trim().match(/, ([A-Za-z]{2})$/);
        if (match && match[1]) {
          code = match[1];
        }
      }
    }
    return code?.trim().toUpperCase();
  });

  countryFlagEmoji = computed(() => {
    const code = this.countryCode();
    return code ? isoCountryCodeToFlagEmoji(code) : undefined;
  });

  countryTooltip = computed(() => {
    const spot = this.spotData();
    if (!spot) return "";
    let name = "";
    if (spot instanceof Spot || spot instanceof LocalSpot) {
      name = spot.address()?.country?.name || "";
    } else {
      name = (spot as any).countryName || "";
    }
    return name;
  });

  displayLocality = computed(() => {
    const spot = this.spotData();
    if (!spot) return "";
    let loc = "";
    let code = this.countryCode();

    if (spot instanceof Spot || spot instanceof LocalSpot) {
      loc = spot.localityString();
    } else {
      loc = spot.locality;
    }

    // If we have a code and the locality ends with it, strip it
    if (code && loc.endsWith(code.toUpperCase())) {
      // Also strip the comma/space before it if present
      const suffix = code.toUpperCase();
      loc = loc.substring(0, loc.length - suffix.length);
      loc = loc.trim();
      if (loc.endsWith(",")) {
        loc = loc.substring(0, loc.length - 1);
      }
    }
    return loc;
  });

  spotType = computed(() => {
    const spot = this.spotData();
    if (!spot) return undefined;
    if (spot instanceof Spot || spot instanceof LocalSpot) {
      return spot.type();
    } else {
      // SpotPreviewData
      return parseSpotType(spot.type);
    }
  });

  spotAccess = computed(() => {
    const spot = this.spotData();
    if (!spot) return undefined;
    if (spot instanceof Spot || spot instanceof LocalSpot) {
      return spot.access();
    } else {
      // SpotPreviewData
      return parseSpotAccess(spot.access);
    }
  });

  bookmarked = false;
  visited = false;

  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    private _router: Router,
    public storageService: StorageService,
    public mapsApiService: MapsApiService
  ) {
    effect(() => {
      const spot = this.spotData();
      const currentCacheKey = this._getSpotCacheKey(spot);

      if (currentCacheKey !== this._lastSpotCacheKey) {
        this._lastSpotCacheKey = currentCacheKey;
        this.failedMediaSrcs.set([]);
        this._hasLoadedMedia.set(false);
        this._streetViewPreviewSrc.set(null);
        this._knownNoStreetViewForSpot.set(false);
      }

      if (!spot) {
        this.spotName = undefined;
        this.spotLocality = undefined;
        return;
      }

      if (spot instanceof Spot || spot instanceof LocalSpot) {
        this.spotName = spot.name();
        this.spotLocality = spot.localityString();
        return;
      }

      this.spotName = spot.name;
      this.spotLocality = spot.locality;
    });

    effect((onCleanup) => {
      const spot = this.spotData();
      const allowStreetViewPreview = this._allowStreetViewPreview();

      if (!spot || !allowStreetViewPreview) {
        this._streetViewPreviewSrc.set(null);
        return;
      }

      const spotId = this._getSpotId(spot);
      const location = this._getSpotLocation(spot);
      const hasImageMedia = this._spotHasImageMedia(spot);
      const isStreetViewHidden = this._isStreetViewHidden(spot);

      if (!location || hasImageMedia || isStreetViewHidden) {
        this._streetViewPreviewSrc.set(null);
        this._knownNoStreetViewForSpot.set(false);
        return;
      }

      const cachedAvailability =
        this.mapsApiService.getCachedStreetViewPanoramaAvailability(
          location,
          spotId
        );
      if (cachedAvailability === false) {
        this._streetViewPreviewSrc.set(null);
        this._knownNoStreetViewForSpot.set(true);
        return;
      }

      if (cachedAvailability === true) {
        this._knownNoStreetViewForSpot.set(false);
        this._streetViewPreviewSrc.set(
          this.mapsApiService.getStaticStreetViewImageForLocation(
            location,
            400,
            400,
            spotId
          )
        );
        return;
      }

      let isCancelled = false;
      void this.mapsApiService.hasStreetViewPanoramaForLocation(location, spotId).then(
        (hasPanorama) => {
          if (isCancelled) {
            return;
          }

          if (!hasPanorama) {
            this._streetViewPreviewSrc.set(null);
            this._knownNoStreetViewForSpot.set(true);
            return;
          }

          this._knownNoStreetViewForSpot.set(false);
          this._streetViewPreviewSrc.set(
            this.mapsApiService.getStaticStreetViewImageForLocation(
              location,
              400,
              400,
              spotId
            )
          );
        }
      );

      onCleanup(() => {
        isCancelled = true;
      });
    });
  }

  ngAfterViewInit() {
    if (this.loadingPriority()) {
      this._isViewportSettled.set(true);
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof IntersectionObserver === "undefined"
    ) {
      this._isViewportSettled.set(true);
      return;
    }

    this._intersectionObserver = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        const isIntersecting = entry?.isIntersecting ?? false;

        if (isIntersecting) {
          if (this._isViewportSettled() || this._hasLoadedMedia()) {
            return;
          }

          if (this._viewportTimer) {
            clearTimeout(this._viewportTimer);
          }

          this._viewportTimer = setTimeout(() => {
            this._isViewportSettled.set(true);
            this._viewportTimer = null;
          }, this._mediaLoadDelayMs);
          return;
        }

        if (this._viewportTimer) {
          clearTimeout(this._viewportTimer);
          this._viewportTimer = null;
        }

        this._isViewportSettled.set(false);
      },
      {
        root: null,
        rootMargin: "200px 0px",
        threshold: 0.01,
      }
    );

    this._intersectionObserver.observe(this.elementRef.nativeElement);
  }

  ngOnDestroy() {
    if (this._viewportTimer) {
      clearTimeout(this._viewportTimer);
      this._viewportTimer = null;
    }
    this._intersectionObserver?.disconnect();
    this._intersectionObserver = null;
  }

  capitalize(s: string) {
    return s && s[0].toUpperCase() + s.slice(1);
  }

  // onClick() {
  //   if (this.clickable && this.spot && this.spot instanceof Spot) {
  //     // open the spot in the spot map
  //     this.spotClick.emit(this.spot);
  //   }
  // }

  onImageError(event?: Event) {
    const target = event?.target as HTMLImageElement | null;
    const failedSrc = target?.currentSrc || target?.src;
    if (failedSrc) {
      this.failedMediaSrcs.update((current) =>
        current.includes(failedSrc) ? current : [...current, failedSrc]
      );
    }

    if (!failedSrc || !this._isStreetViewSrc(failedSrc)) {
      return;
    }
  }

  onImageLoad(event?: Event) {
    const target = event?.target as HTMLImageElement | null;
    const loadedSrc = target?.currentSrc || target?.src;
    if (!loadedSrc) return;

    this._hasLoadedMedia.set(true);
    this.failedMediaSrcs.update((current) =>
      current.filter((src) => src !== loadedSrc)
    );
  }

  private _isStreetViewUrl(url: string): boolean {
    return /maps\.googleapis\.com\/maps\/api\/streetview/i.test(url);
  }

  private _isStreetViewSrc(src: string): boolean {
    return this._isStreetViewUrl(src) || src === this._streetViewPreviewSrc();
  }

  private _getSpotId(
    spot: Spot | LocalSpot | SpotPreviewData | null
  ): string | undefined {
    if (!spot) return undefined;

    if (spot instanceof Spot) {
      return spot.id;
    }

    if (spot instanceof LocalSpot) {
      return undefined;
    }

    return spot.id || undefined;
  }

  private _getSpotCacheKey(
    spot: Spot | LocalSpot | SpotPreviewData | null
  ): string | null {
    if (!spot) return null;

    const spotId = this._getSpotId(spot);
    if (spotId) {
      return `spot:${spotId}`;
    }

    const location =
      spot instanceof Spot || spot instanceof LocalSpot
        ? spot.location()
        : spot.location
        ? { lat: spot.location.latitude, lng: spot.location.longitude }
        : null;

    if (!location) {
      return null;
    }

    return `loc:${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
  }

  private _getSpotLocation(
    spot: Spot | LocalSpot | SpotPreviewData
  ): google.maps.LatLngLiteral | null {
    if (spot instanceof Spot || spot instanceof LocalSpot) {
      return spot.location();
    }

    if (!spot.location) {
      return null;
    }

    return {
      lat: spot.location.latitude,
      lng: spot.location.longitude,
    };
  }

  private _spotHasImageMedia(spot: Spot | LocalSpot | SpotPreviewData): boolean {
    const allowStreetViewPreview = this._allowStreetViewPreview();

    if (spot instanceof Spot || spot instanceof LocalSpot) {
      return spot.media().some((m) => {
        if (m.type !== MediaType.Image) {
          return false;
        }

        const previewSrc = m.getPreviewImageSrc();
        if (this._isStreetViewUrl(previewSrc) && !allowStreetViewPreview) {
          return false;
        }

        return true;
      });
    }

    if (!spot.imageSrc) {
      return false;
    }

    if (this._isStreetViewUrl(spot.imageSrc) && !allowStreetViewPreview) {
      return false;
    }

    return true;
  }

  private _isStreetViewHidden(
    spot: Spot | LocalSpot | SpotPreviewData
  ): boolean {
    if (spot instanceof Spot || spot instanceof LocalSpot) {
      return !!spot.hideStreetview;
    }

    return !!spot.hideStreetview;
  }

  private _shouldShowNoMediaLabel(): boolean {
    const spot = this.spotData();
    if (!spot) return false;

    if (this._spotHasImageMedia(spot)) {
      return false;
    }

    if (this._isStreetViewHidden(spot)) {
      return true;
    }

    if (!this._streetViewPreviewEnabled()) {
      return true;
    }

    // If preview loading is currently disabled (e.g. zoomed out), treat this
    // as no media for the card to avoid unlabeled placeholder states.
    if (!this._allowStreetViewPreview()) {
      return true;
    }

    const location = this._getSpotLocation(spot);
    if (!location) {
      return true;
    }

    return this._knownNoStreetViewForSpot();
  }

  getReferrerPolicyForSrc(src: string | null): "no-referrer" | null {
    if (!src) return "no-referrer";
    return this._isStreetViewUrl(src) ? null : "no-referrer";
  }

  shareSpot() {
    // TODO
  }
}
