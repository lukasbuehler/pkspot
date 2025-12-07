import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  OnChanges,
  ElementRef,
  HostBinding,
  LOCALE_ID,
  AfterViewInit,
  Pipe,
  PipeTransform,
  Signal,
  signal,
  input,
  computed,
  effect,
  WritableSignal,
  model,
  inject,
  OnDestroy,
} from "@angular/core";
import {
  MatProgressBar,
  MatProgressBarModule,
} from "@angular/material/progress-bar";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { LocalSpot, Spot } from "../../../db/models/Spot";
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
import { Observable, Subscription } from "rxjs";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  MediaType,
  LocaleCode,
  LocaleMap,
} from "../../../db/models/Interfaces";
import {
  AmenitiesMap,
  AmenityIcons,
  AmenityNegativeIcons,
  IndoorAmenities,
  OutdoorAmenities,
  GeneralAmenities,
} from "../../../db/schemas/Amenities";
import {
  AmenityNames,
  AmenityNegativeNames,
  makeSmartAmenitiesArray,
  AmenityQuestions,
  type AmenityQuestion,
  type QuestionValue,
} from "../../../db/models/Amenities";

//import { MatTooltipModule } from "@angular/material/tooltip";

import {
  isoCountryCodeToFlagEmoji,
  isMobileDevice,
} from "../../../scripts/Helpers";
import { UntypedFormControl, FormsModule } from "@angular/forms";
import { map, startWith } from "rxjs/operators";
import {
  trigger,
  transition,
  style,
  animate,
  keyframes,
} from "@angular/animations";
import { MapsApiService } from "../../services/maps-api.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { SpotReportDialogComponent } from "../spot-report-dialog/spot-report-dialog.component";
import { SpotReviewDialogComponent } from "../spot-review-dialog/spot-review-dialog.component";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { Inject } from "@angular/core";
import { SpotReportSchema } from "../../../db/schemas/SpotReportSchema";
import { SpotTypes, SpotAccess } from "../../../db/schemas/SpotTypeAndAccess";
import { MatSelect, MatSelectModule } from "@angular/material/select";
import { MediaPreviewGridComponent } from "../media-preview-grid/media-preview-grid.component";
import { MatInput } from "@angular/material/input";
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { ImgCarouselComponent } from "../img-carousel/img-carousel.component";
import { SpotRatingComponent } from "../spot-rating/spot-rating.component";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { MatIconButton, MatButton } from "@angular/material/button";
import {
  KeyValuePipe,
  LocationStrategy,
  NgOptimizedImage,
  JsonPipe,
} from "@angular/common";
import {
  MatChipListbox,
  MatChipsModule,
  MatChip,
  MatChipSet,
  MatChipOption,
} from "@angular/material/chips";
import { MatRipple, MatOption, MatRippleModule } from "@angular/material/core";
import {
  MatCard,
  MatCardHeader,
  MatCardTitle,
  MatCardSubtitle,
  MatCardContent,
  MatCardActions,
} from "@angular/material/card";
import { create } from "core-js/core/object";
import { MatDividerModule } from "@angular/material/divider";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { SpotReportsService } from "../../services/firebase/firestore/spot-reports.service";
import { PostsService } from "../../services/firebase/firestore/posts.service";
import { SpotReviewSchema } from "../../../db/schemas/SpotReviewSchema";
import { SpotReviewsService } from "../../services/firebase/firestore/spot-reviews.service";
import { getValueFromEventTarget } from "../../../scripts/Helpers";
import { StructuredDataService } from "../../services/structured-data.service";
import {
  MatSlideToggle,
  MatSlideToggleChange,
} from "@angular/material/slide-toggle";
import { LocaleMapEditFieldComponent } from "../locale-map-edit-field/locale-map-edit-field.component";
import { SpotChallengeSchema } from "../../../db/schemas/SpotChallengeSchema";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";
import { ChallengeDetailComponent } from "../challenge-detail/challenge-detail.component";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import {
  LocalSpotChallenge,
  SpotChallenge,
} from "../../../db/models/SpotChallenge";
import {
  AnyMedia,
  ExternalImage,
  StorageImage,
} from "../../../db/models/Media";
import { languageCodes } from "../../../scripts/Languages";
import { SelectLanguageDialogComponent } from "../select-language-dialog/select-language-dialog.component";
import { locale } from "core-js";
import { SlugsService } from "../../services/firebase/firestore/slugs.service";
import { LocaleMapViewComponent } from "../locale-map-view/locale-map-view.component";
import { StorageBucket } from "../../../db/schemas/Media";
import { Timestamp } from "firebase/firestore";
import { Router, RouterLink } from "@angular/router";
import { ChallengeListComponent } from "../challenge-list/challenge-list.component";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
// import { SpotAmenityToggleComponent } from "../spot-amenity-toggle/spot-amenity-toggle.component";
import { SpotAmenitiesDialogComponent } from "../spot-amenities-dialog/spot-amenities-dialog.component";
import { GooglePlacePreviewComponent } from "../google-place-preview/google-place-preview.component";
import { FancyCounterComponent } from "../fancy-counter/fancy-counter.component";
import { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import { createUserReference } from "../../../scripts/Helpers";
import { AnalyticsService } from "../../services/analytics.service";

@Pipe({ name: "reverse", standalone: true })
export class ReversePipe implements PipeTransform {
  transform(value: any[]): any[] {
    if (!Array.isArray(value)) {
      return value;
    }
    return value.slice().reverse();
  }
}

@Pipe({ name: "asRatingKey", standalone: true })
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
        { params: { startHeight: 0 } }
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
          ])
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
          style({ opacity: 0, transform: "translateY(-4px)" })
        ),
      ]),
    ]),
  ],
  imports: [
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
    FormsModule,
    MediaPreviewGridComponent,
    MatSelect,
    MatOption,
    MatCardActions,
    SpotRatingComponent,
    MatDividerModule,
    MatProgressBarModule,
    KeyValuePipe,
    ReversePipe,
    AsRatingKeyPipe,
    MatSlideToggle,
    LocaleMapEditFieldComponent,
    MatRippleModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    LocaleMapViewComponent,
    ChallengeListComponent,
    MatButtonToggleModule,
    MatDialogModule,
    // New reusable Google Place preview
    GooglePlacePreviewComponent,
    // Fancy number animation for rating
    FancyCounterComponent,
    // For change-detection-friendly stringification in animation binding
    JsonPipe,
    RouterLink,
  ],
  schemas: [],
})
export class SpotDetailsComponent
  implements OnInit, AfterViewInit, OnChanges, OnDestroy
{
  public locale: LocaleCode = inject(LOCALE_ID);
  private _challengeService = inject(SpotChallengesService);
  private _structuredDataService = inject(StructuredDataService);
  private _analyticsService = inject(AnalyticsService);

  spot = model<Spot | LocalSpot | null>(null);
  notLocalSpotOrNull = computed(() => {
    const spot = this.spot();

    if (spot instanceof Spot) {
      return spot;
    } else {
      return null;
    }
  });
  spotSlugOrId = computed(() => {
    const spot = this.spot();

    if (spot instanceof Spot) {
      return spot.slug ?? spot.id;
    } else {
      return "";
    }
  });
  challenge = model<SpotChallenge | LocalSpotChallenge | null>(null);
  isEditing = model<boolean>(false);
  isLocalSpot = computed(
    () => this.spot() !== null && !(this.spot() instanceof Spot)
  );

  // Expose centralized questions for potential dynamic UI
  AmenityQuestions = AmenityQuestions;

  // Compute the next applicable unanswered question
  public nextAmenityQuestion = computed(() => {
    const spot = this.spot();
    if (!spot) return null;
    const a = spot.amenities();
    for (const q of this.AmenityQuestions) {
      try {
        if (q.isApplicable(a) && !q.isAnswered(a)) return q;
      } catch {
        // If a question throws, skip it rather than breaking the UI
        continue;
      }
    }
    return null;
  });

  // Current selection value for the next question
  currentQuestionValue = computed<QuestionValue | null>(() => {
    const spot = this.spot();
    const q = this.nextAmenityQuestion();
    if (!spot || !q) return null;
    return q.getValue(spot.amenities());
  });

  // Apply selection for the currently shown question
  public answerAmenityQuestion(questionId: string, value: string) {
    const q = this.nextAmenityQuestion();
    const spot = this.spot();
    if (!q || !spot) return;
    const opt = q.options.find((o) => o.value === value);
    if (!opt) return;
    this.spot!.update((s) => {
      if (!s) return s;
      const updated = opt.apply({ ...(s.amenities() ?? {}) });
      s.amenities.set(updated);
      return s;
    });
  }

  spotImages = computed(() => {
    const spot = this.spot();
    if (!spot) return [];

    return spot
      .userMedia()
      .filter(
        (media) =>
          media instanceof StorageImage || media instanceof ExternalImage
      );
  });

  languages = languageCodes;

  @Input() infoOnly: boolean = false;
  @Input() dismissable: boolean = false;
  @Input() border: boolean = false;
  @Input() clickable: boolean = false;
  @Input() editable: boolean = false;

  @Output() dismiss: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() addBoundsClick: EventEmitter<void> = new EventEmitter<void>();
  @Output() focusClick: EventEmitter<void> = new EventEmitter<void>();
  @Output() saveClick: EventEmitter<Spot> = new EventEmitter<Spot>();
  @Output() discardClick: EventEmitter<void> = new EventEmitter<void>();

  // Media upload is handled in a dialog now

  getValueFromEventTarget = getValueFromEventTarget;

  isSaving: boolean = false;

  AmenityIcons = AmenityIcons;
  AmenityNegativeIcons = AmenityNegativeIcons;
  AmenityNames = AmenityNames;
  AmenityNegativeNames = AmenityNegativeNames;
  IndoorAmenities = IndoorAmenities;
  OutdoorAmenities = OutdoorAmenities;
  GeneralAmenities = GeneralAmenities;

  // Environment 4-state selection derived from amenities
  public environmentSelection = computed<
    "indoor" | "outdoor" | "both" | "unknown"
  >(() => {
    const a = this.spot()?.amenities();
    if (!a) return "unknown";
    const indoor = a.indoor ?? null;
    const outdoor = a.outdoor ?? null;
    if (indoor === true && outdoor === true) return "both";
    if (indoor === true) return "indoor";
    if (outdoor === true) return "outdoor";
    return "unknown";
  });

  visited: boolean = false;
  bookmarked: boolean = false;

  allSpotSlugs: string[] = [];
  newSlug: string = "";
  addingSlug = signal<boolean>(false);

  get spotNameLocaleMap(): LocaleMap {
    const spot = this.spot();
    if (!spot) return {};

    return spot.names();
  }
  set spotNameLocaleMap(value: LocaleMap) {
    this.spot()?.names.set(value);
  }

  get spotSlug(): string {
    const spot = this.spot();
    if (!spot || this.isLocalSpot()) return "";

    return (spot as Spot).slug ?? "";
  }
  set spotSlug(value: string) {
    const spot = this.spot();
    if (!spot || this.isLocalSpot()) return;
    (spot as Spot).slug = value;
  }

  canAddSlug(): boolean {
    const list = this.allSpotSlugs;
    return Array.isArray(list) ? list.length < 1 : true;
  }

  async addSlug() {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return;
    const slug = (this.newSlug || "").trim().toLowerCase();
    if (!slug) return;
    this.addingSlug.set(true);
    try {
      await this._slugService.addSpotSlug(spot.id, slug);
      this.allSpotSlugs = await this._slugService.getAllSlugsForASpot(spot.id);
      this.spot.update((s) => {
        if (s instanceof Spot) s.slug = slug;
        return s;
      });
      this.newSlug = "";
      this._snackbar.open($localize`Custom URL added`, undefined, {
        duration: 2000,
      });
      // Redirect to the canonical slug URL
      void this._router.navigate(["/s", slug]);
    } catch (e: any) {
      this._snackbar.open(
        e?.message || e || $localize`Failed to add custom URL`,
        undefined,
        { duration: 3000 }
      );
    } finally {
      this.addingSlug.set(false);
    }
  }

  get spotDescriptionLocaleMap(): LocaleMap {
    const spot = this.spot();
    if (!spot) return {};
    // Return a stable object reference without mutating signals during render
    const current = spot.descriptions();
    return current ?? this._EMPTY_LOCALE_MAP;
  }
  set spotDescriptionLocaleMap(value: LocaleMap) {
    this.spot()?.descriptions.set(value);
  }

  // Stable empty LocaleMap to avoid identity churn in templates when descriptions are unset
  private readonly _EMPTY_LOCALE_MAP = Object.freeze({}) as LocaleMap;

  spotTypes = Object.values(SpotTypes);
  spotTypeNames = SpotTypesNames;
  spotTypesIcons = SpotTypesIcons;
  spotTypeDescriptions = SpotTypesDescriptions;

  spotAccesses = Object.values(SpotAccess);
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
  private _latestReportRequestSpotId: string | null = null;

  automaticallyDetermineAddress: boolean = true;

  isAppleMaps: boolean = false;

  mediaStorageFolder: StorageBucket = StorageBucket.SpotPictures;

  googlePlace = signal<
    | {
        name: string;
        rating?: number;
        photo_url?: string;
        url?: string;
        opening_hours?: any;
      }
    | undefined
  >(undefined);

  // Google Places linking state (edit mode only)
  placeSearch = new UntypedFormControl("");
  placePredictions: google.maps.places.AutocompletePrediction[] = [];
  nearbyPlaceResults: google.maps.places.Place[] = [];
  linkingPlace = signal<boolean>(false);
  unlinkingPlace = signal<boolean>(false);

  // Animation keys to force transitions on content changes
  nameAnimKey = signal<number>(0);
  typeAnimKey = signal<number>(0);
  accessAnimKey = signal<number>(0);

  private _lastNameValue: string | null = null;
  private _lastTypeValue: string | null = null;
  private _lastAccessValue: string | null = null;

  // Live updates subscription for the current Spot
  private _spotSnapshotSub: Subscription | null = null;
  private _lastSubscribedSpotId: string | null = null;

  async searchPlaces(query: string) {
    const spot = this.spot();
    if (!this._mapsApiService.isApiLoaded()) {
      // try to load if consent allows
      this._mapsApiService.loadGoogleMapsApi();
    }
    let biasRect: google.maps.LatLngBoundsLiteral | undefined;
    if (spot) {
      const loc = spot.location();
      const d = 0.01; // ~1km bias box
      biasRect = {
        south: loc.lat - d,
        west: loc.lng - d,
        north: loc.lat + d,
        east: loc.lng + d,
      };
    }
    try {
      if (!query || query.trim().length === 0) {
        // No query: seed with nearby places (sorted by distance)
        if (spot) {
          this.nearbyPlaceResults =
            await this._mapsApiService.getNearbyPlacesByDistance(
              spot.location(),
              "restaurant",
              5
            );
        } else {
          this.nearbyPlaceResults = [];
        }
        this.placePredictions = [];
        return;
      }
      // With query: use autocomplete filtered by name, biased to location, show only top 1 result
      const preds = await this._mapsApiService.autocompletePlaceSearch(
        query,
        ["establishment"],
        biasRect
      );
      // Show only the top Google result before nearby places
      this.placePredictions = preds.slice(0, 1);
    } catch (e) {
      console.warn("Place autocomplete failed", e);
      this.placePredictions = [];
      this.nearbyPlaceResults = [];
    }
  }

  private async _preloadNearbyPlaces() {
    const spot = this.spot();
    if (!spot) return;
    try {
      this.nearbyPlaceResults =
        await this._mapsApiService.getNearbyPlacesByDistance(
          spot.location(),
          "restaurant",
          5
        );
    } catch (e) {
      console.warn("Failed to preload nearby places", e);
      this.nearbyPlaceResults = [];
    }
  }

  async linkPlace(pred: google.maps.places.AutocompletePrediction) {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return;
    if (!pred.place_id) return;
    if (!this.authenticationService.user?.uid) return;
    this.linkingPlace.set(true);
    try {
      const userReference = createUserReference(
        this.authenticationService.user.data!
      );
      await this._spotEditsService.updateSpotExternalReferenceEdit(
        spot.id,
        { google_maps_place_id: pred.place_id },
        userReference
      );
      this.placeSearch.setValue("");
      this.placePredictions = [];
      this._snackbar.open($localize`Linked Google Place`, undefined, {
        duration: 2000,
      });
    } catch (e) {
      console.error("Failed to link Google Place", e);
      this._snackbar.open($localize`Failed to link Google Place`, undefined, {
        duration: 2500,
      });
    } finally {
      this.linkingPlace.set(false);
    }
  }

  async linkPlaceResult(res: google.maps.places.Place) {
    if (!res.id) return;
    // Wrap the place_id in an object compatible with linkPlace signature
    await this.linkPlace({ place_id: res.id } as any);
  }

  async unlinkPlace() {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return;
    if (!this.authenticationService.user?.uid) return;
    this.unlinkingPlace.set(true);
    try {
      const userReference = createUserReference(
        this.authenticationService.user.data!
      );
      // To unlink, we need to send an edit that will clear the google_maps_place_id
      // The cloud function will need to handle this appropriately
      await this._spotEditsService.updateSpotExternalReferenceEdit(
        spot.id,
        { google_maps_place_id: null as any }, // null to indicate deletion
        userReference
      );
      this.googlePlace.set(undefined);
      this._snackbar.open($localize`Unlinked Google Place`, undefined, {
        duration: 2000,
      });
    } catch (e) {
      console.error("Failed to unlink Google Place", e);
      this._snackbar.open($localize`Failed to unlink Google Place`, undefined, {
        duration: 2500,
      });
    } finally {
      this.unlinkingPlace.set(false);
    }
  }

  get isNewSpot() {
    return !(this.spot() instanceof Spot);
  }

  startHeight: number = 0;

  @HostBinding("@grow") get grow() {
    return { value: this.spot(), params: { startHeight: this.startHeight } };
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
    private _slugService: SlugsService,
    private _postsService: PostsService,
    private _storageService: StorageService,
    private _mapsApiService: MapsApiService,
    private _snackbar: MatSnackBar
  ) {
    this.filteredCountries = this.stateCtrl.valueChanges.pipe(
      startWith(""),
      map((country) =>
        country ? this._filterCountries(country) : this.countries.slice()
      )
    );

    effect(() => {
      const spot = this.spot();

      // Reset slug-related UI state on spot change to avoid stale state
      this.allSpotSlugs = [];
      this.newSlug = "";
      this.addingSlug.set(false);

      if (spot instanceof Spot) {
        // Ensure live updates subscription for this spot id
        this._subscribeToLiveSpot(spot);
        // Load Google Place preview and nearby places
        this._loadGooglePlaceDataForSpot();
        this._preloadNearbyPlaces();

        const currentId = spot.id;
        this._slugService.getAllSlugsForASpot(currentId).then((slugs) => {
          // Apply only if still on the same spot to avoid race conditions
          const latest = this.spot();
          if (latest instanceof Spot && latest.id === currentId) {
            this.allSpotSlugs = slugs;
          }
        });
      } else {
        // Not a persisted spot: stop any live subscription
        this._unsubscribeFromLiveSpot();
      }
    });

    // Reactively (re)load Google Place preview whenever the place id changes
    effect(() => {
      const s = this.spot();
      const placeId = s instanceof Spot ? s.googlePlaceId() : undefined;
      if (placeId) {
        this._loadGooglePlaceDataForSpot();
      } else {
        this.googlePlace.set(undefined);
      }
    });

    // Kick animations when name/type/access change
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
    effect(() => {
      const a = this.spot()?.access() ?? null;
      if (a !== this._lastAccessValue) {
        this._lastAccessValue = a;
        this.accessAnimKey.update((v) => v + 1);
      }
    });
  }

  ngOnInit() {
    // add structured data for place
    if (this.spot instanceof Spot) {
      const placeData = this._structuredDataService.generateSpotPlaceData(
        this.spot
      );
      this._structuredDataService.addStructuredData("spot", placeData);
    }
  }

  ngAfterViewInit() {
    this.isAppleMaps = this._mapsApiService.isMacOSOriOS();
  }

  ngOnChanges() {
    //console.log(this._element.nativeElement.clientHeight);

    this.startHeight = this._element.nativeElement.clientHeight;

    void this.loadReportForSpot();
  }

  ngOnDestroy(): void {
    this._structuredDataService.removeStructuredData("spot");
    this._unsubscribeFromLiveSpot();
  }

  private _filterCountries(value: string): any[] {
    const filterValue = value.toLowerCase();

    return this.countries.filter(
      (country) => country.name.toLowerCase().indexOf(filterValue) === 0
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
    if (this.dismissable) {
      this.isEditing.set(false);

      this.dismiss.emit(true);
    }
  }

  editButtonClick() {
    if (this.editable && this.authenticationService.isSignedIn) {
      this.isEditing.set(true);
    }
  }

  editHistoryButtonClick() {
    if (this.authenticationService.isSignedIn) {
      // TODO Open the edit history view
    }
  }

  saveButtonClick() {
    this.isSaving = true;

    this.saveClick.emit(this.spot() as Spot);
  }

  discardButtonClick() {
    this.discardClick.emit();
    this.isEditing.set(false);

    if (this.isNewSpot) {
      // close the compact view as well
      this.dismissed();
    }
  }

  descriptionTextChanged(
    spot: LocalSpot | Spot,
    eventTarget: EventTarget | null
  ) {
    const value = getValueFromEventTarget(eventTarget);

    if (!value) return;

    spot.setDescription(value, this.locale);
  }

  addBoundsClicked() {
    if (!(this.spot() instanceof Spot)) {
      console.error("the spot needs to be saved first before adding bounds");
    }
    if (!this.isEditing()) {
      this.isEditing.set(true);
    }
    this.addBoundsClick.emit();
  }

  focusButtonClick() {
    console.log("Focus button clicked");
    this.focusClick.emit();
  }

  rateClick() {
    // TODO
  }

  bookmarkClick() {
    this.bookmarked = !this.bookmarked;
  }

  visitedClick() {
    this.visited = !this.visited;
  }

  // addressChanged(newAddress: SpotAddressSchema) {
  //   this.spot.address.set(newAddress);
  // }

  setNewMediaFromUpload(media: {
    src: string;
    is_sized: boolean;
    type: MediaType;
  }) {
    console.log("Setting new media from upload");
    const spot = this.spot();
    if (!spot) {
      console.error("No spot to add media to");
      return;
    }

    this.spot.update((spot) => {
      if (spot) {
        if (!this.authenticationService.user.uid) {
          console.error("User not signed in, cannot upload media");
          return spot;
        }

        if (media.type !== MediaType.Image) {
          console.error("Only images are allowed for now");
          return spot;
        }

        if (!media.is_sized) {
          console.error("Media is not sized, cannot upload");
          return spot;
        }

        // Mark as processing since resized versions won't be ready immediately
        spot.addMedia(
          media.src,
          media.type,
          this.authenticationService.user.uid,
          true,
          true // isProcessing = true for newly uploaded images
        );
      }
      if (spot instanceof Spot && this.authenticationService.user?.uid) {
        // if possible, already save the uploaded media via a spot edit
        const userReference = createUserReference(
          this.authenticationService.user.data!
        );
        this._spotEditsService.updateSpotMediaEdit(
          spot.id,
          spot.userMedia(),
          userReference
        );
      }

      console.debug("Spot after adding media", spot);
      return spot;
    });

    const currentSpot = this.spot();
    if (currentSpot instanceof Spot) {
      this._analyticsService.trackEvent("Upload Spot Image", {
        spotId: currentSpot.id,
      });
    }
  }

  mediaChanged(newSpotMedia: AnyMedia[]) {
    this.spot()?.userMedia.set(newSpotMedia);
  }

  async shareSpot() {
    const spot = this.spot();
    if (!(spot instanceof Spot)) {
      console.error($localize`Cannot share a spot that hasn't been saved yet`);
      return;
    }

    // Build domain-agnostic share link without locale prefix
    const { buildAbsoluteUrlNoLocale } = await import(
      "../../../scripts/Helpers"
    );
    const idOrSlug = spot.slug ?? spot.id;
    const link = buildAbsoluteUrlNoLocale(
      spot.slug ? `/s/${idOrSlug}` : `/map/${idOrSlug}`
    );

    if (navigator["share"]) {
      try {
        const shareData = {
          title: "Spot: " + spot.name(),
          text: `PK Spot: ${spot.name()}`,
          url: link,
        };

        await navigator["share"](shareData);
      } catch (err) {
        console.error("Couldn't share this spot");
        console.error(err);
      }
    } else {
      navigator.clipboard.writeText(`${spot.name()} Spot - PK Spot \n${link}`);
      this._snackbar.open(
        $localize`Link to spot copied to clipboard`,
        "Dismiss",
        {
          duration: 3000,
          horizontalPosition: "center",
          verticalPosition: "top",
        }
      );
    }

    this._analyticsService.trackEvent("Share Spot", { spotId: spot.id });
  }

  openSpotInMaps() {
    const spot = this.spot();
    if (spot instanceof Spot) {
      this._analyticsService.trackEvent("Opening in Maps", { spotId: spot.id });
    }
    if (spot) this._mapsApiService.openLatLngInMaps(spot.location());
  }

  openMediaUploadDialog() {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return;
    import("../media-upload-dialog/media-upload-dialog.component").then((m) => {
      const ref = this.dialog.open(m.MediaUploadDialogComponent, {
        data: {
          spotId: spot.id,
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
      this._resetReportState();
      return;
    }

    const spotId = spot.id;
    this._latestReportRequestSpotId = spotId;

    try {
      const reports = await this._spotReportsService.getSpotReportsBySpotId(
        spotId
      );

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

  private _loadGooglePlaceDataForSpot() {
    if (!this.spot()?.googlePlaceId()) {
      this.googlePlace.set(undefined);
      return;
    }

    this._mapsApiService
      .getGooglePlaceById(this.spot()!.googlePlaceId()!)
      .then((place) => {
        const photoUrl = this._mapsApiService.getPhotoURLOfGooglePlace(place);
        this.googlePlace.set({
          name: place.displayName ?? "",
          rating: place.rating ?? undefined,
          photo_url: photoUrl ?? undefined,
          opening_hours: place.regularOpeningHours,
          url: place.websiteURI ?? undefined,
        });
      });
  }

  hasBounds() {
    return this.spot()?.hasBounds();
  }

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

    const spotReportData: SpotReportSchema = {
      spot: {
        id: spot.id,
        name: spot.name(),
      },
      user: {
        uid: this.authenticationService.user.uid,
        display_name: this.authenticationService.user.data.displayName,
      },
      reason: "",
    };
    const dialogRef = this.dialog.open(SpotReportDialogComponent, {
      data: spotReportData,
    });
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

    let isUpdate: boolean = false;
    let review: SpotReviewSchema | undefined;

    // TODO somehow show that we are loading the review

    // check if the user has already reviewed this spot
    this._spotReviewsService
      .getSpotReviewById(spotId, uid)
      .then((_review) => {
        review = _review;
        isUpdate = true;
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
            comment: {
              text: "",
              locale: this.locale,
            },
          };
        } else {
          if (!review.comment?.text || !review.comment?.locale) {
            review.comment = {
              text: "",
              locale: this.locale,
            };
          }
        }

        const dialogRef = this.dialog.open(SpotReviewDialogComponent, {
          data: {
            review: review,
            isUpdate: isUpdate,
          },
        });
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
        this.locale
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

    this._router.navigate(["/map", spot.id, "c"]);
  }

  setSpotIconicFromToggle(event: MatSlideToggleChange) {
    this.spot!.update((spot) => {
      if (!spot) return spot;
      spot.isIconic = event.checked;
      return spot;
    });
  }

  setHideStreetviewFromToggle(event: MatSlideToggleChange) {
    this.spot!.update((spot) => {
      if (!spot) return spot;
      spot.hideStreetview = event.checked;
      return spot;
    });
  }

  updateAmenityFromToggle(
    amenityKey: keyof AmenitiesMap,
    selected: boolean | null | undefined
  ) {
    this.spot!.update((spot) => {
      if (!spot) return spot;

      const amenities = spot.amenities();

      // Handle indoor/outdoor mutual exclusivity
      if (amenityKey === "indoor" && selected) {
        amenities.outdoor = null; // Reset outdoor when indoor is selected
      } else if (amenityKey === "outdoor" && selected) {
        amenities.indoor = null; // Reset indoor when outdoor is selected
      }

      // Set the amenity value using nullable boolean logic
      (amenities as any)[amenityKey] = selected ?? null;

      return spot;
    });
  }

  setEnvironment(selection: "indoor" | "outdoor" | "both" | "unknown") {
    this.spot!.update((spot) => {
      if (!spot) return spot;
      const a = { ...(spot.amenities() ?? {}) } as AmenitiesMap;
      if (selection === "indoor") {
        a.indoor = true;
        a.outdoor = false;
      } else if (selection === "outdoor") {
        a.indoor = false;
        a.outdoor = true;
      } else if (selection === "both") {
        a.indoor = true;
        a.outdoor = true;
      } else {
        a.indoor = null;
        a.outdoor = null;
      }
      spot.amenities.set(a);
      return spot;
    });
  }

  // Covered selection: "covered" | "not_covered" | "unknown"
  public coveredSelection = computed<"covered" | "not_covered" | "unknown">(
    () => {
      const a = this.spot()?.amenities() as AmenitiesMap | undefined;
      const covered = a?.covered ?? null;
      if (covered === true) return "covered";
      if (covered === false) return "not_covered";
      return "unknown";
    }
  );

  public setCovered(selection: "covered" | "not_covered" | "unknown") {
    this.spot!.update((spot) => {
      if (!spot) return spot;
      const a = { ...(spot.amenities() ?? {}) } as AmenitiesMap;
      if (selection === "covered") a.covered = true;
      else if (selection === "not_covered") a.covered = false;
      else a.covered = null;
      spot.amenities.set(a);
      return spot;
    });
  }

  openSpotAmenitiesDialog() {
    const spot = this.spot();
    if (!spot) return;

    const ref = this.dialog.open(SpotAmenitiesDialogComponent, {
      data: { amenities: spot.amenities() },
      width: "640px",
    });

    ref.afterClosed().subscribe((updated: AmenitiesMap | undefined) => {
      if (!updated) return;
      this.spot!.update((s) => {
        if (!s) return s;
        s.amenities.set(updated);
        return s;
      });
    });
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
          if (current instanceof Spot && current.id === incoming.id) {
            // Apply general fields from schema
            current.applyFromSchema(incoming.data());
            // data() does not include external_references; ensure place id is preserved
            current.googlePlaceId.set(incoming.googlePlaceId());
          }
        },
        error: (err) => console.warn("Live spot update error", err),
      });
  }

  private _unsubscribeFromLiveSpot() {
    if (this._spotSnapshotSub) {
      this._spotSnapshotSub.unsubscribe();
      this._spotSnapshotSub = null;
    }
    this._lastSubscribedSpotId = null;
  }
}
