import { CommunityLinksComponent } from "../community-links/community-links.component";
import { getSpotCommunityCandidates } from "../../../scripts/CommunityHelpers";
import { SpotPersonalStatsComponent } from "../spot-personal-stats/spot-personal-stats.component";
import { ShareCardService } from "../../services/share-card.service";
import { spotCopy } from "../../localization/entity-copy";
import { inject as injectFeatureTelemetry } from "@angular/core";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import {
  Component,
  OnInit,
  OnChanges,
  ElementRef,
  LOCALE_ID,
  Pipe,
  PipeTransform,
  signal,
  input,
  computed,
  effect,
  model,
  inject,
  OnDestroy,
  ChangeDetectionStrategy,
  output,
  PLATFORM_ID,
  resource,
  untracked,
} from "@angular/core";
import {
  MatProgressBarModule,
} from "@angular/material/progress-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import {
  SpotManagementSchema,
  SpotStewardshipSchema,
} from "../../../db/schemas/SpotSchema";
import {
  SpotAccessDescriptions,
  SpotAccessIcons,
  SpotAccessNames,
  SpotTypesDescriptions,
  SpotTypesIcons,
  SpotTypesNames,
} from "../../../db/schemas/SpotTypeAndAccess";
import { Post } from "../../../db/models/Post";
import { StorageService } from "../../services/firebase/storage.service";
import { from, Observable, of, Subscription } from "rxjs";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  LocaleCode,
} from "../../../db/models/Interfaces";
import {
  AmenityIcons,
  AmenityNegativeIcons,
  IndoorAmenities,
  OutdoorAmenities,
  GeneralAmenities,
} from "../../../db/schemas/Amenities";
import {
  AmenityNames,
  AmenityNegativeNames,
} from "../../../db/models/Amenities";

//import { MatTooltipModule } from "@angular/material/tooltip";

import {
  isoCountryCodeToFlagEmoji,
} from "../../../scripts/Helpers";
import {
  getDisplayCountryName,
  getDisplayLocationName,
} from "../../../scripts/AddressHelpers";
import {
  UntypedFormControl,
} from "@angular/forms";
import {
  map,
  startWith,
} from "rxjs/operators";
import {
  trigger,
  transition,
  style,
  animate,
  keyframes,
} from "@angular/animations";
import { MapsApiService } from "../../services/maps-api.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  SpotReportDialogComponent,
  type SpotReportDialogResult,
} from "../spot-report-dialog/spot-report-dialog.component";
import { SpotReviewDialogComponent } from "../spot-review-dialog/spot-review-dialog.component";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { Inject } from "@angular/core";
import { SpotReportSchema } from "../../../db/schemas/SpotReportSchema";
import type { OwnReportSummary } from "../../../db/schemas/ReportLifecycleSchema";
import { localizedPublicSpotWarning } from "./spot-public-warning";
import { ImgCarouselComponent } from "../img-carousel/img-carousel.component";
import type { GooglePlacePhoto } from "../google-place-preview/google-place-preview.component";
import { googlePlacePhotoInGalleryEnabled } from "../../features/google-place-photo-feature";
import { SpotRatingComponent } from "../spot-rating/spot-rating.component";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { MatIconButton, MatButton } from "@angular/material/button";
import {
  isPlatformBrowser,
  JsonPipe,
  KeyValuePipe,
  LocationStrategy,
} from "@angular/common";
import {
  MatChipsModule,
  MatChip,
  MatChipSet,
} from "@angular/material/chips";
import {
  MatRipple,
  MatRippleModule,
} from "@angular/material/core";
import {
  MatCard,
  MatCardHeader,
  MatCardTitle,
  MatCardSubtitle,
  MatCardContent,
} from "@angular/material/card";
import { MatDividerModule } from "@angular/material/divider";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import {
  OrganizationsService,
} from "../../services/firebase/firestore/organizations.service";
import { SpotReportsService } from "../../services/firebase/firestore/spot-reports.service";
import { PostsService } from "../../services/firebase/firestore/posts.service";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { SpotReviewSchema } from "../../../db/schemas/SpotReviewSchema";
import { ConsentService } from "../../services/consent.service";
import { SpotReviewsService } from "../../services/firebase/firestore/spot-reviews.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { getValueFromEventTarget } from "../../../scripts/Helpers";
import { StructuredDataService } from "../../services/structured-data.service";
import { SpotChallengeSchema } from "../../../db/schemas/SpotChallengeSchema";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";
import {
  LocalSpotChallenge,
  SpotChallenge,
} from "../../../db/models/SpotChallenge";
import {
  StorageImage,
  ExternalImage,
  Media,
  AnyMedia,
} from "../../../db/models/Media";
import { languageCodes } from "../../../scripts/Languages";
import { LocaleMapViewComponent } from "../locale-map-view/locale-map-view.component";
import { StorageBucket } from "../../../db/schemas/Media";
import { Timestamp } from "firebase/firestore";
import { Router, RouterLink } from "@angular/router";
// import { SpotAmenityToggleComponent } from "../spot-amenity-toggle/spot-amenity-toggle.component";
import { GooglePlacePreviewComponent } from "../google-place-preview/google-place-preview.component";
import { FancyCounterComponent } from "../fancy-counter/fancy-counter.component";
import { AnalyticsService } from "../../services/analytics.service";
import { NotificationOptInService } from "../../services/notification-opt-in.service";
import { MetaTagService } from "../../services/meta-tag.service";
import {
  buildSpotCanonicalPath,
  buildSpotChallengeCanonicalPath,
} from "../../../scripts/SpotRouteHelpers";
import { SpotProvenanceComponent } from "../spot-provenance/spot-provenance.component";
import { EventCardComponent } from "../event-card/event-card.component";
import { MediaUploadStatusService } from "../../services/firebase/firestore/media-upload-status.service";
import {
  WeatherIconButtonComponent,
  type WeatherIconData,
} from "../weather-icon-button/weather-icon-button.component";
import { WeatherService } from "../../weather/weather.service";
import { getWeatherVisualStatus } from "../../weather/weather-warnings";
import { getSpotWeatherContext } from "../../weather/spot-weather-context";
import { getWeatherAlertDisplay } from "../../weather/weather-alert-display";
import {
  WeatherForecastDialogComponent,
  type WeatherForecastDialogData,
} from "../weather-forecast-dialog/weather-forecast-dialog.component";
import { SpotEditorComponent } from "../spot-editor/spot-editor.component";
import { SpotActivitySummaryComponent } from "../spot-activity-summary/spot-activity-summary.component";

@Pipe({ name: "reverse" })
export class ReversePipe implements PipeTransform {
  transform(value: any[]): any[] {
    if (!Array.isArray(value)) {
      return value;
    }
    return value.slice().reverse();
  }
}

@Pipe({ name: "asRatingKey" })
export class AsRatingKeyPipe implements PipeTransform {
  transform(value: any): "1" | "2" | "3" | "4" | "5" {
    return value.toString() as "1" | "2" | "3" | "4" | "5";
  }
}

@Component({
  selector: "app-spot-details",
  templateUrl: "./spot-details.component.html",
  styleUrls: ["./spot-details.component.scss"],
  animations: [
    trigger("grow", [
      transition("void <=> *", []),
      transition(
        "* <=> *",
        [style({ height: "{{startHeight}}px" }), animate(".3s ease")],
        { params: { startHeight: 0 } },
      ),
    ]),
    // Fade/slide when bound value changes
    trigger("fadeSlideOnChange", [
      transition("* => *", [
        style({ opacity: 0, transform: "translateY(-2px)" }),
        animate("180ms ease", style({ opacity: 1, transform: "none" })),
      ]),
    ]),
    // Pulse container slightly on value change (e.g., rating)
    trigger("pulseOnChange", [
      transition("* => *", [
        animate(
          "220ms ease",
          keyframes([
            style({ transform: "scale(1)", offset: 0 }),
            style({ transform: "scale(1.06)", offset: 0.35 }),
            style({ transform: "scale(1)", offset: 1 }),
          ]),
        ),
      ]),
    ]),
    // Per-item list animation for enter/leave
    trigger("listItem", [
      transition(":enter", [
        style({ opacity: 0, transform: "translateY(4px)" }),
        animate("140ms ease-out", style({ opacity: 1, transform: "none" })),
      ]),
      transition(":leave", [
        animate(
          "100ms ease-in",
          style({ opacity: 0, transform: "translateY(-4px)" }),
        ),
      ]),
    ]),
  ],
  imports: [
    CommunityLinksComponent,
    SpotPersonalStatsComponent,
    MatCard,
    MatRipple,
    MatCardHeader,
    MatCardTitle,
    MatCardSubtitle,
    MatChipsModule,
    MatChip,
    MatChipSet,
    MatIconButton,
    MatTooltip,
    MatIcon,
    MatCardContent,
    ImgCarouselComponent,
    MatButton,
    SpotRatingComponent,
    MatDividerModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    KeyValuePipe,
    ReversePipe,
    AsRatingKeyPipe,
    MatRippleModule,
    LocaleMapViewComponent,
    MatDialogModule,
    // New reusable Google Place preview
    GooglePlacePreviewComponent,
    // Fancy number animation for rating
    FancyCounterComponent,
    // For change-detection-friendly stringification in animation binding
    JsonPipe,
    RouterLink,
    SpotProvenanceComponent,
    EventCardComponent,
    WeatherIconButtonComponent,
    SpotActivitySummaryComponent,
    SpotEditorComponent,
  ],
  host: {
    "[style.--open-progress]": "openProgressStyle",
    "[@grow]": "grow",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [],
})
export class SpotDetailsComponent
  implements OnInit, OnChanges, OnDestroy
{
  readonly shareCards = inject(ShareCardService);
  private readonly featureTelemetry = injectFeatureTelemetry(FeatureTelemetryService);

  public locale: LocaleCode = inject(LOCALE_ID);
  readonly localizedCopy = computed(() => {
    const spot = this.spot();
    return spot ? spotCopy(spot, this.locale) : null;
  });
  private _challengeService = inject(SpotChallengesService);
  private _structuredDataService = inject(StructuredDataService);
  private _metaTagService = inject(MetaTagService);
  private _analyticsService = inject(AnalyticsService);
  private _notificationOptIn = inject(NotificationOptInService);
  private _usersService = inject(UsersService);
  private _organizationsService = inject(OrganizationsService);
  private _ageAssuranceService = inject(AgeAssuranceService);
  private _mediaUploadStatusService = inject(MediaUploadStatusService);
  private readonly _platformId = inject(PLATFORM_ID);
  private readonly _consentService = inject(ConsentService);
  private readonly _weatherService = inject(WeatherService);

  /**
   * Sets the --open-progress CSS custom property on the host element.
   * This controls the visibility of collapsible header info sections.
   */
  get openProgressStyle(): number {
    return this.openProgress();
  }

  spot = model<Spot | LocalSpot | null>(null);
  readonly spotWeatherContext = computed(() =>
    getSpotWeatherContext(this.spot()?.amenities()),
  );
  /** Country and locality community keys derived from the Spot's address. */
  readonly communityKeys = computed(() => {
    const spot = this.spot();
    if (!spot || this.isLocalSpot()) return [];
    return getSpotCommunityCandidates({
      address: spot.address(),
      landing: spot.data().landing,
    }).map((candidate) => candidate.communityKey);
  });

  readonly weatherResource = resource({
    params: () => {
      const location = this.spot()?.location();
      if (
        !isPlatformBrowser(this._platformId) ||
        !this._consentService.hasConsent() ||
        !this.spotWeatherContext().available ||
        !location ||
        !Number.isFinite(location.lat) ||
        !Number.isFinite(location.lng)
      ) {
        return undefined;
      }
      return location;
    },
    loader: ({ params }) =>
      this._weatherService.getCurrentAndNearFutureForTileAt(params),
  });
  readonly weatherIconData = computed<WeatherIconData>(() => {
    if (!this.weatherResource.hasValue()) {
      return { condition: "unknown" };
    }
    const response = this.weatherResource.value();
    const point = response?.current ?? response?.forecast?.[0];
    if (!point) {
      return { condition: "unknown" };
    }
    const primaryAlert = response.alerts?.[0];
    const alertDisplay = primaryAlert
      ? getWeatherAlertDisplay(primaryAlert)
      : undefined;
    return {
      condition: point.condition ?? "unknown",
      countryCode: response.countryCode ?? this.countryCode(),
      icon: alertDisplay?.icon,
      isDay: point.isDay,
      label: alertDisplay?.label,
      temperatureC: point.temperatureC,
      precipitationMm: point.precipitationMm,
      precipitationProbabilityPercent: point.precipitationProbabilityPercent,
      status: getWeatherVisualStatus(response, {
        covered: this.spotWeatherContext().covered,
      }),
    };
  });
  readonly weatherAvailable = computed(() => {
    if (
      !this.spotWeatherContext().available ||
      !this.weatherResource.hasValue()
    ) {
      return false;
    }
    const response = this.weatherResource.value();
    return Boolean(response?.current ?? response?.forecast?.[0]);
  });
  notLocalSpotOrNull = computed(() => {
    const spot = this.spot();

    if (spot instanceof Spot) {
      return spot;
    } else {
      return null;
    }
  });
  readonly spotActivityMin = computed(() => this.spot()?.recent_activity_min_30d);
  readonly spotActivitySpotId = computed(() => {
    const spot = this.spot();
    return spot instanceof Spot ? spot.id : null;
  });
  spotSlugOrId = computed(() => {
    const spot = this.spot();

    if (spot instanceof Spot) {
      return spot.slug ?? spot.id;
    } else {
      return "";
    }
  });
  /** Photo loaded by the Google Place preview, shown at the end of the gallery. */
  private readonly _googlePlacePhoto = signal<GooglePlacePhoto | null>(null);
  readonly galleryGooglePhoto = computed(() => {
    if (!googlePlacePhotoInGalleryEnabled) return null;
    const photo = this._googlePlacePhoto();
    const spot = this.spot();
    // Ignore a photo left over from a previously opened Spot's place.
    return photo && spot instanceof Spot && spot.googlePlaceId() === photo.placeId
      ? photo
      : null;
  });

  onGooglePlacePhotoChange(photo: GooglePlacePhoto | null): void {
    this._googlePlacePhoto.set(photo);
  }

  processingSpotMedia = computed(() => {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return [];
    return this._mediaUploadStatusService.processingMediaForTarget(
      "spot",
      spot.id,
      spot.userMedia().map((media) => media.baseSrc),
    );
  });
  failedSpotMediaUploads = computed(() => {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return [];
    return this._mediaUploadStatusService.failedLocalUploadsForTarget(
      "spot",
      spot.id,
    );
  });
  challenge = model<SpotChallenge | LocalSpotChallenge | null>(null);
  isEditing = model<boolean>(false);
  isLocalSpot = computed(
    () => this.spot() !== null && !(this.spot() instanceof Spot),
  );
  upcomingEvents = computed(() => this.spot()?.upcomingEvents() ?? []);

  countryCode = computed(() => {
    return this.spot()?.address()?.country?.code;
  });

  countryFlagEmoji = computed(() => {
    const code = this.countryCode();
    return code ? isoCountryCodeToFlagEmoji(code) : undefined;
  });

  countryTooltip = computed(() => {
    return getDisplayCountryName(this.spot()?.address() ?? null) ?? "";
  });

  displayLocation = computed(() => {
    return getDisplayLocationName(this.spot()?.address() ?? null) ?? "";
  });

  spotImages = computed(() => {
    const spot = this.spot();
    if (!spot) return [];

    const blockedUsers =
      this.authenticationService.user?.data?.data?.blocked_users || [];

    return spot
      .userMedia()
      .filter(
        (media) =>
          (media instanceof StorageImage || media instanceof ExternalImage) &&
          (!media.userId || !blockedUsers.includes(media.userId)),
      );
  });

  languages = languageCodes;

  readonly infoOnly = input<boolean>(false);
  readonly dismissable = input<boolean>(false);
  readonly border = input<boolean>(false);
  readonly clickable = input<boolean>(false);
  readonly editable = input<boolean>(false);
  showRating = input<boolean>(true);
  loading = input(false);
  loadingTitle = input<string>("");
  loadingSubtitle = input<string>("");
  loadingImageSrc = input<string | null | undefined>(null);
  liveUpdates = input<boolean>(true);

  /**
   * Controls the visibility of collapsible header info when used in bottom sheet.
   * 0 = closed (only show spot name + close button), 1 = fully open (show all info).
   * On desktop sidebar this should always be 1.
   */
  openProgress = input<number>(1);
  pendingVoteCount = input<number>(0);
  mapQueryParams = input<Record<string, string> | null>(null);

  readonly dismiss = output<boolean>();
  readonly addBoundsClick = output<void>();
  readonly focusClick = output<void>();
  readonly saveClick = output<Spot | LocalSpot>();
  readonly discardClick = output<void>();
  readonly reviewSubmitted = output<Spot>();
  readonly reportSubmitted = output<Spot>();

  // Media upload is handled in a dialog now

  getValueFromEventTarget = getValueFromEventTarget;

  readonly isSaving = input(false);

  AmenityIcons = AmenityIcons;
  AmenityNegativeIcons = AmenityNegativeIcons;
  AmenityNames = AmenityNames;
  AmenityNegativeNames = AmenityNegativeNames;
  IndoorAmenities = IndoorAmenities;
  OutdoorAmenities = OutdoorAmenities;
  GeneralAmenities = GeneralAmenities;

  visited = signal<boolean>(false);
  bookmarked = signal<boolean>(false);
  isBookmarkUpdating = signal<boolean>(false);
  isVisitedUpdating = signal<boolean>(false);
  isDeletingSpot = signal<boolean>(false);

  spotTypeNames = SpotTypesNames;
  spotTypesIcons = SpotTypesIcons;
  spotTypeDescriptions = SpotTypesDescriptions;

  spotAccessNames = SpotAccessNames;
  spotAccessIcons = SpotAccessIcons;
  spotAccessDescriptions = SpotAccessDescriptions;

  newSpotImage: File | null = null;

  spotPosts: Post.Class[] = [];
  postSubscription: Subscription | null = null;

  countries: any[] = [];
  filteredCountries: Observable<any[]>;
  stateCtrl = new UntypedFormControl();

  report = signal<SpotReportSchema | null>(null);
  ownReport = signal<OwnReportSummary | null>(null);
  private _latestOwnReportRequestSpotId: string | null = null;
  currentReport = computed(() => {
    const spot = this.spot();
    if (spot instanceof Spot && spot.isReported) {
      return {
        spot: {
          id: spot.id,
          name: spot.name(),
        },
        reason: localizedPublicSpotWarning(
          spot.publicNotice,
          spot.reportReason,
        ),
        user: {
          uid: "",
        },
      } satisfies SpotReportSchema;
    }

    return null;
  });
  private _latestReportRequestSpotId: string | null = null;

  automaticallyDetermineAddress: boolean = true;

  mediaStorageFolder: StorageBucket = StorageBucket.SpotPictures;

  readonly stewardedOrganizations = computed((): SpotStewardshipSchema[] => {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return [];

    const stewardship = spot.stewardship;
    const organizations =
      stewardship?.organization_ids
        .map((organizationId) => stewardship.organizations[organizationId])
        .filter(
          (organization): organization is SpotStewardshipSchema =>
            organization !== undefined,
        ) ?? [];

    return organizations;
  });
  readonly managedOrganization = computed((): SpotManagementSchema | null => {
    const spot = this.spot();
    return spot instanceof Spot ? (spot.management ?? null) : null;
  });

  // Animation keys to force transitions on content changes
  nameAnimKey = signal<number>(0);
  typeAnimKey = signal<number>(0);

  private _lastNameValue: string | null = null;
  private _lastTypeValue: string | null = null;

  // Live updates subscription for the current Spot
  private _spotSnapshotSub: Subscription | null = null;
  private _lastSubscribedSpotId: string | null = null;
  /**
   * The newest live snapshot that arrived while the Spot was being edited.
   * Replacing the Spot mid-edit would hand the form and the save button a
   * fresh server copy while the map keeps writing the dragged pin and outline
   * into the instance it passed in, so the moved pin (and any earlier field
   * edits) would silently be dropped from the saved diff.
   */
  private _snapshotHeldDuringEdit: Spot | null = null;
  private _privateDataSub: Subscription | null = null;
  private _authStateSub: Subscription | null = null;
  private _bookmarkedSpotIds = new Set<string>();
  private _visitedSpotIds = new Set<string>();

  get isNewSpot() {
    return !(this.spot() instanceof Spot);
  }

  startHeight: number = 0;

  get grow() {
    return { value: this.spot(), params: { startHeight: this.startHeight } };
  }

  openWeatherDialog(): void {
    if (!this.weatherResource.hasValue()) {
      return;
    }

    const response = this.weatherResource.value();
    const spot = this.spot();
    if (!response || !spot) {
      return;
    }

    this.dialog.open<
      WeatherForecastDialogComponent,
      WeatherForecastDialogData
    >(WeatherForecastDialogComponent, {
      data: {
        spotName: spot.name(),
        response,
        countryCode: this.countryCode(),
        covered: this.spotWeatherContext().covered,
      },
      width: "680px",
      maxWidth: "calc(100vw - 24px)",
      maxHeight: "calc(100dvh - 24px)",
      autoFocus: "dialog",
      restoreFocus: true,
    });
    this._analyticsService.trackEvent("spot_weather_opened", {
      provider: response.provider,
      spotId: spot instanceof Spot ? spot.id : "local",
    });
  }

  constructor(
    public authenticationService: AuthenticationService,
    @Inject(MatDialog) public dialog: MatDialog,
    private _locationStrategy: LocationStrategy,
    private _router: Router,
    private _element: ElementRef,
    private _spotsService: SpotsService,
    private _spotEditsService: SpotEditsService,
    private _spotReportsService: SpotReportsService,
    private _spotReviewsService: SpotReviewsService,
    private _postsService: PostsService,
    private _storageService: StorageService,
    private _mapsApiService: MapsApiService,
    private _snackbar: MatSnackBar,
  ) {
    this.filteredCountries = this.stateCtrl.valueChanges.pipe(
      startWith(""),
      map((country) =>
        country ? this._filterCountries(country) : this.countries.slice(),
      ),
    );

    effect(() => {
      const spot = this.spot();

      if (
        spot instanceof Spot && this.liveUpdates() &&
        isPlatformBrowser(this._platformId) && this._consentService.hasConsent()
      ) {
        // Ensure live updates subscription for this spot id
        this._subscribeToLiveSpot(spot);
      } else {
        // Local spots and fixture spots do not need Firestore live updates.
        this._unsubscribeFromLiveSpot();
      }
    });

    effect(() => {
      const spot = this.spot();
      if (spot instanceof Spot && this.authenticationService.isSignedIn) {
        this._watchSpotMediaUploadStatus();
      }
    });

    // Attempt to load streetview for spots when Maps API is available.
    effect(() => {
      const spot = this.spot();
      const apiLoaded = this._mapsApiService.isApiLoaded();

      if (spot instanceof Spot && apiLoaded) {
        // Fire-and-forget: Spot.loadStreetview will no-op if not needed.
        void spot.loadStreetview(this._mapsApiService);
      }
    });

    // Reactively (re)load Google Place preview whenever the place id changes
    // effect(() => {
    //   const s = this.spot();
    //   const placeId = s instanceof Spot ? s.googlePlaceId() : undefined;
    //   if (placeId) {
    //     this._loadGooglePlaceDataForSpot();
    //   } else {
    //     this.googlePlace.set(undefined);
    //   }
    // });

    // Kick animations when name or type changes
    effect(() => {
      const n = this.spot()?.name() ?? null;
      if (n !== this._lastNameValue) {
        this._lastNameValue = n;
        this.nameAnimKey.update((v) => v + 1);
      }
    });
    effect(() => {
      const t = this.spot()?.type() ?? null;
      if (t !== this._lastTypeValue) {
        this._lastTypeValue = t;
        this.typeAnimKey.update((v) => v + 1);
      }
    });
    // Editing can end from either side (discard here, or the map closing the
    // editor), so react to the mode itself rather than to one button.
    effect(() => {
      if (!this.isEditing()) {
        untracked(() => this._applySnapshotHeldDuringEdit());
      }
    });

    // Keep spot-specific structured data and meta tags in sync as spot changes.
    effect(() => {
      this._syncSpotSeoData(this.spot());
    });

    // Keep bookmark/visited button state aligned with current spot.
    effect(() => {
      this.spot();
      this._syncPrivateSpotButtonState();
    });
  }

  ngOnInit() {
    this._syncSpotSeoData(this.spot());
    this._subscribeToPrivateData();
  }

  ngOnChanges() {
    //console.log(this._element.nativeElement.clientHeight);

    this.startHeight = this._element.nativeElement.clientHeight;

    void this.loadReportForSpot();
  }

  ngOnDestroy(): void {
    this._structuredDataService.removeStructuredData("spot");
    this._unsubscribeFromLiveSpot();
    this._unsubscribeFromPrivateData();
  }

  private _syncSpotSeoData(spot: Spot | LocalSpot | null) {
    if (spot instanceof Spot) {
      const placeData = this._structuredDataService.generateSpotPlaceData(spot);
      this._structuredDataService.addStructuredData("spot", placeData);

      const canonicalPath = buildSpotCanonicalPath(spot.slug ?? spot.id);
      this._metaTagService.setSpotMetaTags(spot, canonicalPath);
      return;
    }

    this._structuredDataService.removeStructuredData("spot");
  }

  private _filterCountries(value: string): any[] {
    const filterValue = value.toLowerCase();

    return this.countries.filter(
      (country) => country.name.toLowerCase().indexOf(filterValue) === 0,
    );
  }

  selectedTabChanged(number: number) {
    if (number === 1) {
      // Post Tab selected
      this.loadSpotPosts();
    } else {
      this.unsubscribeFromSpotPosts();
    }
  }

  dismissed() {
    if (this.dismissable()) {
      this.isEditing.set(false);

      this.dismiss.emit(true);
    }
  }

  editButtonClick() {
    if (this.editable() && this.authenticationService.isSignedIn) {
      if (!this._ageAssuranceService.canParticipatePublicly()) {
        this._snackbar.open(
          this._ageAssuranceService.getRestrictionMessage(),
          $localize`Dismiss`,
          { duration: 6000 },
        );
        return;
      }
      const spot = this.spot();
      this._analyticsService.trackEvent("spot_edit_opened", {
        spot_id: spot instanceof Spot ? spot.id : null,
        is_new_spot: this.isNewSpot,
      });
      this.isEditing.set(true);
    }
  }

  canParticipatePublicly(): boolean {
    return this._ageAssuranceService.canParticipatePublicly();
  }

  editHistoryButtonClick() {
    if (this.authenticationService.isSignedIn) {
      const spot = this.spot();
      this._analyticsService.trackEvent("spot_edit_history_opened", {
        spot_id: spot instanceof Spot ? spot.id : null,
      });
    }
  }

  /** Saves the editor's draft through the map's save path. */
  onEditorSave(spot: Spot | LocalSpot): void {
    // The saved draft is newer than anything held back; the edit's own
    // snapshot follows once it is processed.
    this._snapshotHeldDuringEdit = null;
    this.saveClick.emit(spot);
  }

  onEditorDiscard(): void {
    this.discardClick.emit();
    this.isEditing.set(false);

    if (this.isNewSpot) {
      // close the compact view as well
      this.dismissed();
    }
  }

  focusButtonClick() {
    console.log("Focus button clicked");
    this.focusClick.emit();
  }

  isAdmin(): boolean {
    return this.authenticationService.user.data?.isAdmin === true;
  }

  async deleteSpotClick(): Promise<void> {
    const spot = this.spot();
    if (!(spot instanceof Spot) || !this.isAdmin() || this.isDeletingSpot()) {
      return;
    }

    const confirmed = window.confirm(
      $localize`Delete this spot and all of its reviews and edits? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    this.isDeletingSpot.set(true);
    try {
      await this._spotsService.deleteSpotCascade(spot.id);
      this._analyticsService.trackEvent("Delete Spot", { spotId: spot.id });
      this._snackbar.open($localize`Spot deleted`, undefined, {
        duration: 2500,
      });
      this.dismiss.emit(true);
      void this._router.navigate(["/map"]);
    } catch (error) {
      console.error("Failed to delete spot", error);
      this._analyticsService.reportError(error, {
        context: "spot_delete_failed",
        feature: "spots",
        action: "delete_spot",
        userFacing: true,
        properties: {
          spot_id: spot.id,
        },
      });
      this._snackbar.open($localize`Failed to delete spot`, undefined, {
        duration: 3000,
      });
    } finally {
      this.isDeletingSpot.set(false);
    }
  }

  rateClick() {
    // TODO
  }

  async bookmarkClick(event?: Event) {
    event?.stopPropagation();

    const spot = this.spot();
    const uid = this.authenticationService.user.uid;

    if (!(spot instanceof Spot) || !uid || this.isBookmarkUpdating()) {
      return;
    }

    const shouldBookmark = !this.bookmarked();
    this.isBookmarkUpdating.set(true);
    this.bookmarked.set(shouldBookmark);

    try {
      await this._usersService.updateSavedSpot(uid, spot.id, shouldBookmark);
      if (shouldBookmark) {
        this._bookmarkedSpotIds.add(spot.id);
      } else {
        this._bookmarkedSpotIds.delete(spot.id);
      }
      this._analyticsService.trackEvent("spot_bookmark_toggled", {
        spot_id: spot.id,
        enabled: shouldBookmark,
      });
    } catch (error) {
      this.bookmarked.set(!shouldBookmark);
      console.error("Failed to update saved spot", error);
      this._analyticsService.reportError(error, {
        context: "saved_spot_update_failed",
        feature: "spots",
        action: shouldBookmark ? "save_spot" : "unsave_spot",
        userFacing: true,
        properties: {
          spot_id: spot.id,
          attempted_state: shouldBookmark,
        },
      });
      this._snackbar.open($localize`Failed to update saved spot`, undefined, {
        duration: 2500,
      });
    } finally {
      this.isBookmarkUpdating.set(false);
    }
  }

  async visitedClick(event?: Event) {
    event?.stopPropagation();

    const spot = this.spot();
    const uid = this.authenticationService.user.uid;

    if (!(spot instanceof Spot) || !uid || this.isVisitedUpdating()) {
      return;
    }

    const shouldBeVisited = !this.visited();
    this.isVisitedUpdating.set(true);
    this.visited.set(shouldBeVisited);

    try {
      await this._usersService.updateVisitedSpot(uid, spot.id, shouldBeVisited);
      if (shouldBeVisited) {
        this._visitedSpotIds.add(spot.id);
      } else {
        this._visitedSpotIds.delete(spot.id);
      }
      this._analyticsService.trackEvent("spot_visited_toggled", {
        spot_id: spot.id,
        enabled: shouldBeVisited,
      });
    } catch (error) {
      this.visited.set(!shouldBeVisited);
      console.error("Failed to update visited spot", error);
      this._analyticsService.reportError(error, {
        context: "visited_spot_update_failed",
        feature: "spots",
        action: shouldBeVisited ? "mark_spot_visited" : "unmark_spot_visited",
        userFacing: true,
        properties: {
          spot_id: spot.id,
          attempted_state: shouldBeVisited,
        },
      });
      this._snackbar.open($localize`Failed to update visited spot`, undefined, {
        duration: 2500,
      });
    } finally {
      this.isVisitedUpdating.set(false);
    }
  }

  async shareSpot(): Promise<void> {
    const spot = this.spot();
    if (!spot || !(spot instanceof Spot)) return;
    const { buildAbsoluteUrlNoLocale } = await import("../../../scripts/Helpers");
    this._analyticsService.trackEvent("Share Spot", { spotId: spot.id });
    await this.shareCards.share({ kind: "spot", id: String(spot.id) },
      buildAbsoluteUrlNoLocale(buildSpotCanonicalPath(spot.slug ?? spot.id)), spot.name());
  }

  openSpotInMaps(mapsType?: "google" | "apple") {
    const spot = this.spot();
    if (spot instanceof Spot) {
      this._analyticsService.trackEvent("Opening in Maps", {
        spotId: spot.id,
        mapsType: mapsType ?? "unknown",
      });
    }
    if (spot) this._mapsApiService.openLatLngInMaps(spot.location(), mapsType);
  }

  openMediaUploadDialog() {
    if (!this._ageAssuranceService.canParticipatePublicly()) {
      this._snackbar.open(
        this._ageAssuranceService.getRestrictionMessage(),
        $localize`Dismiss`,
        { duration: 6000 },
      );
      return;
    }

    const spot = this.spot();
    if (!(spot instanceof Spot)) return;
    this._analyticsService.trackEvent("spot_media_upload_opened", {
      spot_id: spot.id,
    });
    import("../media-upload-dialog/media-upload-dialog.component").then((m) => {
      const ref = this.dialog.open(m.MediaUploadDialogComponent, {
        data: {
          spotId: spot.id,
          currentMedia: spot.data().media,
        },
        width: "640px",
      });
      // Live snapshot will reflect any media changes; no manual refresh needed
      ref.afterClosed().subscribe(() => void 0);
    });
  }

  openDirectionsInMaps() {
    const spot = this.spot();
    if (spot instanceof Spot) {
      this._analyticsService.trackEvent("Opening in Google Maps", {
        spotId: spot.id,
      });
    }

    if (spot) this._mapsApiService.openDirectionsInMaps(spot.location());
  }

  private _resetReportState(): void {
    if (this.report() !== null) {
      this.report.set(null);
    }
  }

  async loadReportForSpot(): Promise<void> {
    const spot = this.spot();

    if (!(spot instanceof Spot)) {
      this._latestReportRequestSpotId = null;
      this._latestOwnReportRequestSpotId = null;
      this.ownReport.set(null);
      this._resetReportState();
      return;
    }

    const spotId = spot.id;

    if (!this.isAdmin()) {
      this._latestReportRequestSpotId = spotId;
      this.report.set(null);
      if (!this.authenticationService.isSignedIn) {
        this.ownReport.set(null);
        return;
      }
      this._latestOwnReportRequestSpotId = spotId;
      try {
        const report = await this._spotReportsService.getOwnSpotReport(spotId);
        if (this._latestOwnReportRequestSpotId === spotId) {
          this.ownReport.set(report);
        }
      } catch (error) {
        console.warn("Failed to load own report for Spot", spotId, error);
        if (this._latestOwnReportRequestSpotId === spotId) {
          this.ownReport.set(null);
        }
      }
      return;
    }

    if (this._latestReportRequestSpotId === spotId) {
      return;
    }

    this._latestReportRequestSpotId = spotId;

    try {
      const reports =
        await this._spotReportsService.getSpotReportsBySpotId(spotId);

      if (this._latestReportRequestSpotId !== spotId) {
        // Spot changed while we were loading; ignore stale data
        return;
      }

      const nextReport = reports.at(0) ?? null;
      this.report.set(nextReport);
    } catch (error) {
      console.warn("Failed to load report for spot", spotId, error);
      if (this._latestReportRequestSpotId === spotId) {
        this._resetReportState();
      }
    }
  }

  // private _loadGooglePlaceDataForSpot() {
  //   if (!this.spot()?.googlePlaceId()) {
  //     this.googlePlace.set(undefined);
  //     return;
  //   }

  //   this._mapsApiService
  //     .getGooglePlaceById(this.spot()!.googlePlaceId()!)
  //     .then((place) => {
  //       const photoUrl = this._mapsApiService.getPhotoURLOfGooglePlace(place);
  //       this.googlePlace.set({
  //         name: place.displayName ?? "",
  //         rating: place.rating ?? undefined,
  //         photo_url: photoUrl ?? undefined,
  //         opening_hours: place.regularOpeningHours,
  //         url: place.websiteURI ?? undefined,
  //       });
  //     });
  // }

  capitalize(s: string) {
    return s && s[0].toUpperCase() + s.slice(1);
  }

  loadSpotPosts() {
    // if (!(this.spot instanceof Spot)) return;
    // console.log("Loading posts");
    // this.postSubscription = this._postsService
    //   .getPostsFromSpot(this.spot)
    //   .subscribe(
    //     (postsSchemaMap) => {
    //       console.log(postsSchemaMap);
    //       this.spotPosts = [];
    //       for (let id in postsSchemaMap) {
    //         this.spotPosts.push(new Post.Class(id, postsSchemaMap[id]));
    //       }
    //     },
    //     (error) => {},
    //     () => {}
    //   );
  }

  unsubscribeFromSpotPosts() {
    if (!this.postSubscription) {
      return;
    }

    console.log("Unsubscribing...");
    this.postSubscription.unsubscribe();
  }

  openSpotReportDialog() {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return;

    if (
      !this.authenticationService.isSignedIn ||
      !this.authenticationService.user.uid ||
      !this.authenticationService.user.data
    )
      return;

    this._analyticsService.trackEvent("spot_report_opened", {
      spot_id: spot.id,
      report_count: spot.reportCount,
    });
    const dialogRef = this.dialog.open(SpotReportDialogComponent, {
      width: "560px",
      maxWidth: "calc(100vw - 32px)",
      height: "min(780px, calc(100dvh - 32px))",
      data: {
        spotId: spot.id,
        spotName: spot.name(),
        report: this.ownReport(),
      },
    });
    dialogRef
      .afterClosed()
      .subscribe(
        (result?: SpotReportDialogResult) => {
          if (!result?.reportId && !result?.withdrawn) {
            return;
          }
          void this.loadReportForSpot();
          if (result.withdrawn) {
            this._snackbar.open($localize`Your report was withdrawn.`, undefined, {duration: 4000});
            return;
          }
          if (result.created) {
            spot.isReported = true;
            spot.reportCount += 1;
            this.reportSubmitted.emit(spot);
          }
          this._analyticsService.trackEvent("spot_report_submitted", {
            spot_id: spot.id,
            report_id: result.reportId,
            created: result.created,
          });
          this._snackbar.open(
            result.created ?
              $localize`Your report is pending. You can edit or withdraw it at any time.` :
              $localize`Your report was updated.`,
            undefined,
            {
              duration: 4000,
            },
          );
          if (result.created) void this._notificationOptIn.maybePrompt("report_updates");
        },
      );
  }

  openSpotReviewDialog() {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return;

    const uid = this.authenticationService.user.uid;
    const spotId = spot.id;

    if (!uid) {
      console.error("User not signed in, cannot open review dialog");
      return;
    }

    this._analyticsService.trackEvent("spot_review_opened", {
      spot_id: spot.id,
    });

    let isUpdate: boolean = false;
    let review: SpotReviewSchema | undefined;
    let previousReviewRating: number | null = null;

    // TODO somehow show that we are loading the review

    // check if the user has already reviewed this spot
    this._spotReviewsService
      .getSpotReviewById(spotId, uid)
      .then((_review) => {
        review = _review;
        isUpdate = true;
        previousReviewRating =
          typeof _review.rating === "number" ? _review.rating : null;
      })
      .finally(() => {
        if (!spot) {
          console.warn("Spot has been unselected after opening review dialog");
          this.dialog.closeAll();
          return;
        }
        if (!this.authenticationService.user.data?.displayName) {
          console.error("User data is missing, cannot open review dialog");
          return;
        }

        // don't throw an error if the review doesn't exist, create a new one

        if (!review) {
          review = {
            spot: {
              name: spot.name(),
              id: spotId,
            },
            user: {
              uid: uid,
              display_name: this.authenticationService.user.data.displayName,
            },
            rating: 0,
          };
        }

        const dialogRef = this.dialog.open(SpotReviewDialogComponent, {
          data: {
            review: review,
            isUpdate: isUpdate,
          },
        });

        dialogRef
          .afterClosed()
          .subscribe((submittedReview?: SpotReviewSchema) => {
            if (
              !submittedReview ||
              typeof submittedReview.rating !== "number" ||
              submittedReview.rating <= 0
            ) {
              return;
            }

            this._applyOptimisticSpotRating(
              spot,
              submittedReview.rating,
              previousReviewRating,
              isUpdate,
            );
            this.reviewSubmitted.emit(spot);
          });
      });
  }

  private _applyOptimisticSpotRating(
    spot: Spot,
    submittedRating: number,
    previousReviewRating: number | null,
    isUpdate: boolean,
  ): void {
    const previousReviewCount = Math.max(0, spot.numReviews ?? 0);
    const nextReviewCount = isUpdate
      ? Math.max(1, previousReviewCount)
      : previousReviewCount + 1;
    const previousRatingSum = (spot.rating ?? 0) * previousReviewCount;
    const nextRatingSum = isUpdate
      ? previousRatingSum -
        (previousReviewRating ?? spot.rating ?? 0) +
        submittedRating
      : previousRatingSum + submittedRating;

    spot.rating =
      nextReviewCount > 0
        ? Math.round((nextRatingSum / nextReviewCount) * 10) / 10
        : 0;
    spot.numReviews = nextReviewCount;

    const histogram = { ...spot.ratingHistogram() };
    if (
      isUpdate &&
      previousReviewRating &&
      previousReviewRating >= 1 &&
      previousReviewRating <= 5
    ) {
      const previousKey = String(
        previousReviewRating,
      ) as keyof typeof histogram;
      histogram[previousKey] = Math.max(0, (histogram[previousKey] ?? 0) - 1);
    }

    if (submittedRating >= 1 && submittedRating <= 5) {
      const nextKey = String(submittedRating) as keyof typeof histogram;
      histogram[nextKey] = (histogram[nextKey] ?? 0) + 1;
    }

    spot.ratingHistogram.set(histogram);
  }

  trackVerificationBadgeClick(
    relationship: "managed" | "stewarded",
    organizationId: string,
    organizationName: string,
  ): void {
    const spot = this.spot();
    this._analyticsService.trackEvent("spot_verification_badge_clicked", {
      spot_id: spot instanceof Spot ? spot.id : null,
      organization_id: organizationId,
      organization_name: organizationName,
      relationship,
    });
  }

  openChallenge(challengeId: string) {
    const spot = this.spot();
    if (!spot) {
      console.error("No spot selected");
      return;
    } else if (!(spot instanceof Spot)) {
      console.error("Spot is a LocalSpot, which has no challenges");
      return;
    }

    // get challenge
    this._challengeService
      .getSpotChallenge(spot, challengeId)
      .then((challenge) => {
        this.challenge.set(challenge);
      });
  }

  addChallenge() {
    const spot = this.spot();

    const uid = this.authenticationService.user.uid;
    if (!uid) {
      console.error("User not signed in, cannot add challenge");
      return;
    }

    if (spot && spot instanceof Spot) {
      const newChallengeData: SpotChallengeSchema = {
        name: {
          [this.locale]: {
            text: "",
            provider: "user",
          },
        },
        spot: spot.makePreviewData(),
        user: {
          uid: uid,
          display_name: this.authenticationService.user.data?.displayName,
          profile_picture:
            this.authenticationService.user.data?.profilePicture?.baseSrc ??
            undefined,
        },
        is_completed: false,
        created_at: new Timestamp(Date.now() / 1000, 0),
      };
      const newChallenge: LocalSpotChallenge = new LocalSpotChallenge(
        newChallengeData,
        spot,
        this.locale,
      );
      this.challenge.set(newChallenge);
      this.isEditing.set(true);
    }
  }

  showAllChallenges() {
    const spot = this.spot();

    if (!spot || !(spot instanceof Spot)) {
      throw new Error("The spot is a local spot, it has no challenges");
    }

    this._router.navigateByUrl(
      buildSpotChallengeCanonicalPath(spot.slug ?? spot.id),
    );
  }

  getSpotId(): string | undefined {
    const s = this.spot();
    return s instanceof Spot ? s.id : undefined;
  }

  mediaRemoved(media: AnyMedia) {
    if (media instanceof ExternalImage && media.userId === "streetview") {
      const spot = this.spot();
      if (spot instanceof LocalSpot) {
        spot.removeStreetView();

        // Also ensure persistence if it's a full Spot
        if (spot instanceof Spot) {
          this._mapsApiService.reportStreetViewError(spot.id);
        }
      }
    }
  }

  // -- Private helpers -----------------------------------------------------
  private _subscribeToLiveSpot(spot: Spot) {
    if (this._lastSubscribedSpotId === spot.id && this._spotSnapshotSub) return;
    this._unsubscribeFromLiveSpot();
    this._lastSubscribedSpotId = spot.id;
    this._spotSnapshotSub = this._spotsService
      .getSpotById$(spot.id, this.locale)
      .subscribe({
        next: (incoming: Spot) => {
          const current = this.spot();
          if (!(current instanceof Spot) || current.id !== incoming.id) return;
          if (this.isEditing()) {
            this._snapshotHeldDuringEdit = incoming;
            return;
          }
          this.spot.set(incoming);
        },
        error: (err) => console.warn("Live spot update error", err),
      });
  }

  /** Shows the snapshot held back during editing, once editing has ended. */
  private _applySnapshotHeldDuringEdit(): void {
    const held = this._snapshotHeldDuringEdit;
    this._snapshotHeldDuringEdit = null;
    const current = this.spot();
    if (held && current instanceof Spot && current.id === held.id) {
      this.spot.set(held);
    }
  }

  private _unsubscribeFromLiveSpot() {
    this._snapshotHeldDuringEdit = null;
    if (this._spotSnapshotSub) {
      this._spotSnapshotSub.unsubscribe();
      this._spotSnapshotSub = null;
    }
    this._lastSubscribedSpotId = null;
  }

  private _subscribeToPrivateData() {
    this._unsubscribeFromPrivateData();
    this._authStateSub = this.authenticationService.authState$.subscribe(
      (authState) => {
        const uid = authState?.uid;
        this._privateDataSub?.unsubscribe();
        this._privateDataSub = null;
        this._bookmarkedSpotIds.clear();
        this._visitedSpotIds.clear();
        this._syncPrivateSpotButtonState();
        this._watchSpotMediaUploadStatus();

        if (!uid) {
          return;
        }

        this._privateDataSub = this._usersService.getPrivateData(uid).subscribe(
          (privateData) => {
            this._bookmarkedSpotIds = new Set(privateData?.bookmarks || []);
            this._visitedSpotIds = new Set(privateData?.visited_spots || []);
            this._syncPrivateSpotButtonState();
          },
          (error) => {
            console.error("Failed to load private user data", error);
          },
        );
      },
    );
  }

  private _unsubscribeFromPrivateData() {
    if (this._privateDataSub) {
      this._privateDataSub.unsubscribe();
      this._privateDataSub = null;
    }
    if (this._authStateSub) {
      this._authStateSub.unsubscribe();
      this._authStateSub = null;
    }
  }

  private _watchSpotMediaUploadStatus(): void {
    const spot = this.spot();
    if (spot instanceof Spot && this.authenticationService.user?.uid) {
      this._mediaUploadStatusService.watchTarget("spot", spot.id);
    }
  }

  private _syncPrivateSpotButtonState() {
    const spot = this.spot();
    if (!(spot instanceof Spot) || !this.authenticationService.isSignedIn) {
      this.bookmarked.set(false);
      this.visited.set(false);
      return;
    }

    this.bookmarked.set(this._bookmarkedSpotIds.has(spot.id));
    this.visited.set(this._visitedSpotIds.has(spot.id));
  }
}
