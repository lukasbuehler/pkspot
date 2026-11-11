import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  resource,
  signal,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { MatButton } from "@angular/material/button";
import { MatCardActions } from "@angular/material/card";
import { MatChip, MatChipAvatar, MatChipSet } from "@angular/material/chips";
import { MatDialog } from "@angular/material/dialog";
import {
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
} from "@angular/material/form-field";
import { MatIcon } from "@angular/material/icon";
import { MatInput } from "@angular/material/input";
import { MatOption } from "@angular/material/core";
import { MatSelect } from "@angular/material/select";
import {
  MatSlideToggle,
  MatSlideToggleChange,
} from "@angular/material/slide-toggle";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Subject, from, of } from "rxjs";
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  switchMap,
} from "rxjs/operators";
import { LocaleCode, LocaleMap } from "../../../db/models/Interfaces";
import { AmenityQuestions, QuestionValue } from "../../../db/models/Amenities";
import { AnyMedia } from "../../../db/models/Media";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { AmenitiesMap } from "../../../db/schemas/Amenities";
import { SpotStewardshipSchema } from "../../../db/schemas/SpotSchema";
import { SpotAccess, SpotTypes } from "../../../db/schemas/SpotTypeAndAccess";
import { createUserReference } from "../../../scripts/Helpers";
import { normalizeSpotSlug } from "../../../scripts/SpotLandingHelpers";
import { buildSpotCanonicalPath } from "../../../scripts/SpotRouteHelpers";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { AnalyticsService } from "../../services/analytics.service";
import { ConsentService } from "../../services/consent.service";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MediaUploadStatusService } from "../../services/firebase/firestore/media-upload-status.service";
import {
  OrganizationDocument,
  OrganizationsService,
} from "../../services/firebase/firestore/organizations.service";
import { SlugsService } from "../../services/firebase/firestore/slugs.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { MapsApiService } from "../../services/maps-api.service";
import { createLazyDialogOpener } from "../../utils/create-lazy-dialog-opener";
import { GooglePlacePreviewComponent } from "../google-place-preview/google-place-preview.component";
import { LocaleMapEditFieldComponent } from "../locale-map-edit-field/locale-map-edit-field.component";
import { MediaPreviewGridComponent } from "../media-preview-grid/media-preview-grid.component";
import type { SpotAmenitiesDialogComponent } from "../spot-amenities-dialog/spot-amenities-dialog.component";
import { SpotAccessPickerComponent } from "../spot-access-picker/spot-access-picker.component";
import { SpotTypePickerComponent } from "../spot-type-picker/spot-type-picker.component";

type OrganizationRelationshipSaveResult = "unchanged" | "changed" | "failed";

/** A place suggestion with its distance label resolved once, not per render. */
interface PlaceSuggestion<T> {
  readonly place: T;
  readonly distanceText: string | null;
}

/**
 * Edits one Spot in place: every control writes straight into the Spot's
 * signals, and the host saves that same instance through the map's save path
 * (`SpotMapDataManager.saveSpot`). The editor owns its own side effects
 * (organization relationships, Google Place links, custom URLs), which save
 * immediately, and reports the outcome through its outputs.
 */
@Component({
  selector: "app-spot-editor",
  imports: [
    FormsModule,
    GooglePlacePreviewComponent,
    LocaleMapEditFieldComponent,
    MatButton,
    MatCardActions,
    MatChip,
    MatChipAvatar,
    MatChipSet,
    MatError,
    MatFormField,
    MatHint,
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    MatSlideToggle,
    MediaPreviewGridComponent,
    SpotAccessPickerComponent,
    SpotTypePickerComponent,
  ],
  templateUrl: "./spot-editor.component.html",
  styleUrl: "./spot-editor.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotEditorComponent {
  private readonly _authenticationService = inject(AuthenticationService);
  private readonly _ageAssuranceService = inject(AgeAssuranceService);
  private readonly _analyticsService = inject(AnalyticsService);
  private readonly _consentService = inject(ConsentService);
  private readonly _dialog = inject(MatDialog);
  private readonly _featureTelemetry = inject(FeatureTelemetryService);
  private readonly _mapsApiService = inject(MapsApiService);
  private readonly _mediaUploadStatusService = inject(MediaUploadStatusService);
  private readonly _organizationsService = inject(OrganizationsService);
  private readonly _platformId = inject(PLATFORM_ID);
  private readonly _router = inject(Router);
  private readonly _slugService = inject(SlugsService);
  private readonly _snackbar = inject(MatSnackBar);
  private readonly _spotEditsService = inject(SpotEditsService);
  readonly locale: LocaleCode = inject(LOCALE_ID);

  /** The Spot being edited. Controls write into this instance directly. */
  readonly spot = input.required<Spot | LocalSpot>();
  /** Shows the save and discard actions. */
  readonly editable = input(false);
  /** True while the host is saving; locks the save actions. */
  readonly isSaving = input(false);

  /** Save this Spot through the map's save path. */
  readonly save = output<Spot | LocalSpot>();
  /** Drop the changes and leave edit mode. */
  readonly discard = output<void>();
  /** Start drawing an outline on the map. */
  readonly addBounds = output<void>();
  /** Open the media upload flow for this (saved) Spot. */
  readonly addMedia = output<void>();
  /** Only organization relationships changed; they are saved already. */
  readonly organizationsSaved = output<void>();

  readonly isNewSpot = computed(() => !(this.spot() instanceof Spot));
  readonly savedSpotId = computed(() => {
    const spot = this.spot();
    return spot instanceof Spot ? spot.id : null;
  });

  // -- Save and discard ----------------------------------------------------

  private readonly _isSaveFlowPending = signal(false);

  readonly canSaveSpot = computed(() => {
    if (this.isSaving() || this._isSaveFlowPending()) return false;
    const spot = this.spot();
    if (spot instanceof Spot) return true;

    return this._hasEnoughDataForNewSpot(spot);
  });

  async saveButtonClick(): Promise<void> {
    const spot = this.spot();
    if (!spot || !this.canSaveSpot()) {
      return;
    }

    this._isSaveFlowPending.set(true);
    try {
      this._analyticsService.trackEvent("spot_edit_save_clicked", {
        spot_id: spot instanceof Spot ? spot.id : null,
        is_new_spot: this.isNewSpot(),
        organization_admin_changes_available:
          spot instanceof Spot && this.isAdmin(),
      });
      if (spot instanceof Spot) {
        const relationshipSaveResult =
          await this._saveOrganizationRelationshipChangesIfNeeded(spot);
        if (relationshipSaveResult === "failed") {
          return;
        }

        if (relationshipSaveResult === "changed") {
          this.organizationsSaved.emit();
          return;
        }
      }

      this.save.emit(spot);
    } finally {
      this._isSaveFlowPending.set(false);
    }
  }

  discardButtonClick(): void {
    const spot = this.spot();
    this._analyticsService.trackEvent("spot_edit_discarded", {
      spot_id: spot instanceof Spot ? spot.id : null,
      is_new_spot: this.isNewSpot(),
    });
    this.discard.emit();
  }

  private _hasEnoughDataForNewSpot(spot: LocalSpot): boolean {
    return (
      this._hasCustomName(spot) ||
      this._hasDescription(spot) ||
      spot.userMedia().length > 0 ||
      spot.hasBounds() ||
      spot.type() !== SpotTypes.Other ||
      spot.access() !== SpotAccess.Other ||
      Boolean(spot.googlePlaceId()) ||
      Object.values(spot.amenities() ?? {}).some(
        (value) => value !== null && value !== undefined,
      )
    );
  }

  private _hasCustomName(spot: LocalSpot): boolean {
    const defaultName = $localize`Unnamed Spot`.trim().toLocaleLowerCase();
    return Object.values(spot.names()).some((entry) => {
      const name = entry?.text.trim();
      return Boolean(name && name.toLocaleLowerCase() !== defaultName);
    });
  }

  private _hasDescription(spot: LocalSpot): boolean {
    return Object.values(spot.descriptions() ?? {}).some((entry) =>
      Boolean(entry?.text.trim()),
    );
  }

  // -- Permissions ---------------------------------------------------------

  isAdmin(): boolean {
    return this._authenticationService.user.data?.isAdmin === true;
  }

  canParticipatePublicly(): boolean {
    return this._ageAssuranceService.canParticipatePublicly();
  }

  // -- Name and description ------------------------------------------------

  // Stable empty LocaleMap to avoid identity churn when descriptions are unset.
  private readonly _EMPTY_LOCALE_MAP = Object.freeze({}) as LocaleMap;

  get spotNameLocaleMap(): LocaleMap {
    return this.spot().names();
  }
  set spotNameLocaleMap(value: LocaleMap) {
    this.spot().names.set(value);
  }

  get spotDescriptionLocaleMap(): LocaleMap {
    return this.spot().descriptions() ?? this._EMPTY_LOCALE_MAP;
  }
  set spotDescriptionLocaleMap(value: LocaleMap) {
    this.spot().descriptions.set(value);
  }

  // -- Media ---------------------------------------------------------------

  readonly processingSpotMedia = computed(() => {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return [];
    return this._mediaUploadStatusService.processingMediaForTarget(
      "spot",
      spot.id,
      spot.userMedia().map((media) => media.baseSrc),
    );
  });

  readonly failedSpotMediaUploads = computed(() => {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return [];
    return this._mediaUploadStatusService.failedLocalUploadsForTarget(
      "spot",
      spot.id,
    );
  });

  mediaChanged(newSpotMedia: AnyMedia[]): void {
    this.spot().userMedia.set(newSpotMedia);
  }

  setHideStreetviewFromToggle(event: MatSlideToggleChange): void {
    const spot = this.spot();
    spot.hideStreetview = event.checked;

    if (event.checked) {
      // Apply the visibility setting immediately in the current UI state.
      spot.removeStreetView();
      return;
    }

    if (spot instanceof Spot && this._mapsApiService.isApiLoaded()) {
      void spot.loadStreetview(this._mapsApiService);
    }
  }

  setSpotIconicFromToggle(event: MatSlideToggleChange): void {
    this.spot().isIconic = event.checked;
  }

  // -- Outline -------------------------------------------------------------

  readonly hasBounds = computed(() => this.spot().hasBounds());

  addBoundsClicked(): void {
    const spot = this.spot();
    this._analyticsService.trackEvent("spot_add_bounds_clicked", {
      spot_id: spot instanceof Spot ? spot.id : null,
    });
    if (!(spot instanceof Spot)) {
      console.error("the spot needs to be saved first before adding bounds");
    }
    this.addBounds.emit();
  }

  // -- Amenities -----------------------------------------------------------

  /** The next applicable, unanswered quick question, if any. */
  readonly nextAmenityQuestion = computed(() => {
    const amenities = this.spot().amenities();
    for (const question of AmenityQuestions) {
      try {
        if (question.isApplicable(amenities) && !question.isAnswered(amenities)) {
          return question;
        }
      } catch {
        // If a question throws, skip it rather than breaking the UI.
        continue;
      }
    }
    return null;
  });

  readonly currentQuestionValue = computed<QuestionValue | null>(() => {
    const question = this.nextAmenityQuestion();
    return question ? question.getValue(this.spot().amenities()) : null;
  });

  answerAmenityQuestion(questionId: string, value: string): void {
    const question = this.nextAmenityQuestion();
    if (!question || question.id !== questionId) return;
    const option = question.options.find((o) => o.value === value);
    if (!option) return;
    const spot = this.spot();
    spot.amenities.set(option.apply({ ...(spot.amenities() ?? {}) }));
  }

  readonly openSpotAmenitiesDialog = createLazyDialogOpener(
    async () =>
      (await import("../spot-amenities-dialog/spot-amenities-dialog.component"))
        .SpotAmenitiesDialogComponent,
    (component) => this._showSpotAmenitiesDialog(component),
    inject(DestroyRef),
  );

  private _showSpotAmenitiesDialog(
    dialogComponent: typeof SpotAmenitiesDialogComponent,
  ): void {
    const spot = this.spot();
    const ref = this._dialog.open(dialogComponent, {
      data: { amenities: spot.amenities() },
      width: "640px",
    });

    ref.afterClosed().subscribe((updated: AmenitiesMap | undefined) => {
      if (updated) spot.amenities.set(updated);
    });
  }

  // -- Organization relationships (admins) ---------------------------------

  readonly organizations = signal<OrganizationDocument[]>([]);
  readonly isLoadingOrganizations = signal(false);
  /** Reset to the Spot's current manager whenever another Spot is edited. */
  readonly selectedManagerOrganizationId = linkedSignal(() => {
    const spot = this.spot();
    return spot instanceof Spot ? (spot.management?.organization_id ?? "") : "";
  });
  readonly selectedStewardOrganizationId = linkedSignal({
    source: this.savedSpotId,
    computation: () => "",
  });

  readonly stewardedOrganizations = computed((): SpotStewardshipSchema[] => {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return [];

    const stewardship = spot.stewardship;
    return (
      stewardship?.organization_ids
        .map((organizationId) => stewardship.organizations[organizationId])
        .filter(
          (organization): organization is SpotStewardshipSchema =>
            organization !== undefined,
        ) ?? []
    );
  });

  private async _loadOrganizationsForAdmin(): Promise<void> {
    if (!this.isAdmin()) {
      return;
    }

    this.isLoadingOrganizations.set(true);
    try {
      this.organizations.set(
        await this._organizationsService.getOrganizations(),
      );
    } catch (error) {
      console.warn(
        "Failed to load organizations for spot relationships",
        error,
      );
      this._snackbar.open($localize`Could not load organizations`, undefined, {
        duration: 2500,
      });
    } finally {
      this.isLoadingOrganizations.set(false);
    }
  }

  private async _saveOrganizationRelationshipChangesIfNeeded(
    spot: Spot,
  ): Promise<OrganizationRelationshipSaveResult> {
    if (!this.isAdmin()) {
      return "unchanged";
    }

    try {
      let hasChanges = false;
      const nextManagerId = this.selectedManagerOrganizationId() || null;
      const currentManagerId = spot.management?.organization_id ?? null;
      if (nextManagerId !== currentManagerId) {
        await this._organizationsService.setSpotManagement(
          spot.id,
          nextManagerId,
        );
        this._snackbar.open(
          nextManagerId
            ? $localize`Managed organization updated`
            : $localize`Managed organization removed`,
          undefined,
          { duration: 2200 },
        );
        hasChanges = true;
      }

      const nextStewardId = this.selectedStewardOrganizationId();
      const currentStewardIds = new Set(
        spot.stewardship?.organization_ids ?? [],
      );
      if (nextStewardId && !currentStewardIds.has(nextStewardId)) {
        await this._organizationsService.setSpotStewardship(
          spot.id,
          nextStewardId,
          true,
        );
        this.selectedStewardOrganizationId.set("");
        this._snackbar.open($localize`Verified organization added`, undefined, {
          duration: 2200,
        });
        hasChanges = true;
      }

      return hasChanges ? "changed" : "unchanged";
    } catch (error) {
      this._featureTelemetry.failure(
        "spot-editor",
        "_saveOrganizationRelationshipChangesIfNeeded",
        error,
      );
      console.error("Failed to update spot organization relationship", error);
      this._snackbar.open(
        $localize`Failed to update spot organization settings`,
        undefined,
        { duration: 3000 },
      );
      return "failed";
    }
  }

  async removeStewardedOrganization(organizationId: string): Promise<void> {
    const spot = this.spot();
    if (!(spot instanceof Spot) || !this.isAdmin()) {
      return;
    }

    try {
      await this._organizationsService.setSpotStewardship(
        spot.id,
        organizationId,
        false,
      );
      this._snackbar.open($localize`Verified organization removed`, undefined, {
        duration: 2200,
      });
    } catch (error) {
      this._featureTelemetry.failure(
        "spot-editor",
        "removeStewardedOrganization",
        error,
      );
      console.error("Failed to remove stewarded organization", error);
      this._snackbar.open(
        $localize`Failed to remove verified organization`,
        undefined,
        { duration: 3000 },
      );
    }
  }

  // -- Google Places linking -----------------------------------------------

  private readonly _placeSearchMinQueryLength = 2;
  private readonly _placeSearchDebounceMs = 350;
  private readonly _placeQueries = new Subject<string>();
  private _nearbyPlacesPreloadInFlight: Promise<void> | null = null;
  private _nearbyPlacesPreloadedSpotId: string | null = null;

  readonly placeQuery = linkedSignal({
    source: this.savedSpotId,
    computation: () => "",
  });
  readonly placePredictions = linkedSignal<
    string | null,
    google.maps.places.AutocompletePrediction[]
  >({ source: this.savedSpotId, computation: () => [] });
  readonly nearbyPlaceResults = linkedSignal<
    string | null,
    google.maps.places.Place[]
  >({ source: this.savedSpotId, computation: () => [] });
  readonly linkingPlace = signal(false);
  readonly unlinkingPlace = signal(false);

  readonly predictionSuggestions = computed(
    (): PlaceSuggestion<google.maps.places.AutocompletePrediction>[] =>
      this.placePredictions().map((place) => ({
        place,
        distanceText: this._predictionDistanceText(place),
      })),
  );

  readonly nearbySuggestions = computed(
    (): PlaceSuggestion<google.maps.places.Place>[] => {
      const origin = this.spot().location();
      return this.nearbyPlaceResults().map((place) => ({
        place,
        distanceText: this._nearbyPlaceDistanceText(origin, place),
      }));
    },
  );

  searchPlaces(query: string): void {
    this.placeQuery.set(query);
    this._placeQueries.next(query);
  }

  private async _runPlaceSearchRequest(query: string): Promise<{
    predictions: google.maps.places.AutocompletePrediction[];
    nearbyPlaces: google.maps.places.Place[] | null;
  }> {
    const spot = this.spot();
    if (!(spot instanceof Spot)) {
      return { predictions: [], nearbyPlaces: [] };
    }

    // Don't call the Places API until the query is meaningful.
    if (query.length < this._placeSearchMinQueryLength) {
      if (query.length === 0) {
        await this._preloadNearbyPlaces();
        return { predictions: [], nearbyPlaces: this.nearbyPlaceResults() };
      }
      return { predictions: [], nearbyPlaces: null };
    }

    if (!this._mapsApiService.isApiLoaded()) {
      this._mapsApiService.loadGoogleMapsApi();
      return { predictions: [], nearbyPlaces: null };
    }

    const loc = spot.location();
    const d = 0.001; // ~100m bias box
    const biasRect: google.maps.LatLngBoundsLiteral = {
      south: loc.lat - d,
      west: loc.lng - d,
      north: loc.lat + d,
      east: loc.lng + d,
    };

    const predictions = await this._mapsApiService.autocompletePlaceSearch(
      query,
      undefined,
      biasRect,
      loc,
    );

    return { predictions: predictions.slice(0, 1), nearbyPlaces: null };
  }

  private async _preloadNearbyPlaces(): Promise<void> {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return;
    const spotId = spot.id;

    if (this._nearbyPlacesPreloadedSpotId === spotId) {
      return;
    }
    if (this._nearbyPlacesPreloadInFlight) {
      return this._nearbyPlacesPreloadInFlight;
    }

    // Don't load if the Maps API is not available.
    if (!this._mapsApiService.isApiLoaded()) {
      this._mapsApiService.loadGoogleMapsApi();
      return;
    }

    const request = (async () => {
      let places: google.maps.places.Place[] = [];
      try {
        places = await this._mapsApiService.getNearbyPlacesByDistance(
          spot.location(),
          undefined, // No type filter: all nearby POIs.
          5,
        );
      } catch (e) {
        console.warn("Failed to preload nearby places", e);
      }
      if (this.savedSpotId() === spotId) {
        this.nearbyPlaceResults.set(places);
        this._nearbyPlacesPreloadedSpotId = spotId;
      }
    })();

    this._nearbyPlacesPreloadInFlight = request;
    try {
      await request;
    } finally {
      if (this._nearbyPlacesPreloadInFlight === request) {
        this._nearbyPlacesPreloadInFlight = null;
      }
    }
  }

  async linkPlace(placeId: string | undefined | null): Promise<void> {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return;
    if (!placeId) return;
    const user = this._authenticationService.user;
    if (!user?.uid || !user.data) return;
    this.linkingPlace.set(true);
    try {
      await this._spotEditsService.updateSpotExternalReferenceEdit(
        spot.id,
        { google_maps_place_id: placeId },
        createUserReference(user.data),
      );
      this.placeQuery.set("");
      this.placePredictions.set([]);
      this._snackbar.open($localize`Linked Google Place`, undefined, {
        duration: 2000,
      });
    } catch (e) {
      console.error("Failed to link Google Place", e);
      this._analyticsService.reportError(e, {
        context: "spot_google_place_link_failed",
        feature: "spots",
        action: "link_google_place",
        userFacing: true,
        properties: {
          spot_id: spot.id,
          google_place_id: placeId,
        },
      });
      this._snackbar.open($localize`Failed to link Google Place`, undefined, {
        duration: 2500,
      });
    } finally {
      this.linkingPlace.set(false);
    }
  }

  async unlinkPlace(): Promise<void> {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return;
    const user = this._authenticationService.user;
    if (!user?.uid || !user.data) return;
    this.unlinkingPlace.set(true);
    try {
      // A null place id asks edit processing to remove the link.
      await this._spotEditsService.updateSpotExternalReferenceEdit(
        spot.id,
        { google_maps_place_id: null as unknown as string },
        createUserReference(user.data),
      );
      this._snackbar.open($localize`Unlinked Google Place`, undefined, {
        duration: 2000,
      });
    } catch (e) {
      console.error("Failed to unlink Google Place", e);
      this._analyticsService.reportError(e, {
        context: "spot_google_place_unlink_failed",
        feature: "spots",
        action: "unlink_google_place",
        userFacing: true,
        properties: {
          spot_id: spot.id,
        },
      });
      this._snackbar.open($localize`Failed to unlink Google Place`, undefined, {
        duration: 2500,
      });
    } finally {
      this.unlinkingPlace.set(false);
    }
  }

  private _predictionDistanceText(
    prediction: google.maps.places.AutocompletePrediction,
  ): string | null {
    const meters = (prediction as { distance_meters?: unknown }).distance_meters;
    if (typeof meters !== "number" || !Number.isFinite(meters)) return null;
    return formatDistanceMeters(meters);
  }

  private _nearbyPlaceDistanceText(
    origin: google.maps.LatLngLiteral,
    place: google.maps.places.Place,
  ): string | null {
    if (!place.location) return null;
    const location = place.location as
      | google.maps.LatLng
      | google.maps.LatLngLiteral;
    const lat = typeof location.lat === "function" ? location.lat() : location.lat;
    const lng = typeof location.lng === "function" ? location.lng() : location.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return formatDistanceMeters(haversineDistanceMeters(origin, { lat, lng }));
  }

  // -- Custom URL ----------------------------------------------------------

  private readonly _slugsResource = resource({
    params: () => {
      const spotId = this.savedSpotId();
      if (
        !spotId ||
        !isPlatformBrowser(this._platformId) ||
        !this._consentService.hasConsent()
      ) {
        return undefined;
      }
      return spotId;
    },
    loader: ({ params }) => this._slugService.getAllSlugsForASpot(params),
  });
  readonly allSpotSlugs = computed(() =>
    this._slugsResource.hasValue() ? this._slugsResource.value() : [],
  );
  readonly canAddSlug = computed(() => this.allSpotSlugs().length < 1);
  readonly newSlug = linkedSignal({
    source: this.savedSpotId,
    computation: () => "",
  });
  readonly addingSlug = signal(false);

  get spotSlug(): string {
    const spot = this.spot();
    return spot instanceof Spot ? (spot.slug ?? "") : "";
  }
  set spotSlug(value: string) {
    const spot = this.spot();
    if (spot instanceof Spot) spot.slug = value;
  }

  async addSlug(): Promise<void> {
    const spot = this.spot();
    if (!(spot instanceof Spot)) return;
    const slug = normalizeSpotSlug(this.newSlug() || "");
    if (!slug) return;
    this.addingSlug.set(true);
    try {
      await this._slugService.addSpotSlug(spot.id, slug);
      this._slugsResource.reload();
      spot.slug = slug;
      this.newSlug.set("");
      this._snackbar.open($localize`Custom URL added`, undefined, {
        duration: 2000,
      });
      // Redirect to the canonical slug URL.
      void this._router.navigateByUrl(buildSpotCanonicalPath(slug));
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : typeof e === "string" ? e : "";
      this._snackbar.open(
        message || $localize`Failed to add custom URL`,
        undefined,
        { duration: 3000 },
      );
    } finally {
      this.addingSlug.set(false);
    }
  }

  constructor() {
    void this._loadOrganizationsForAdmin();

    this._placeQueries
      .pipe(
        map((value) => value.trim()),
        debounceTime(this._placeSearchDebounceMs),
        distinctUntilChanged(),
        switchMap((query) =>
          from(this._runPlaceSearchRequest(query)).pipe(
            catchError((error) => {
              console.warn("Place autocomplete failed", error);
              return of({ predictions: [], nearbyPlaces: null });
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ predictions, nearbyPlaces }) => {
        this.placePredictions.set(predictions);
        if (nearbyPlaces !== null) {
          this.nearbyPlaceResults.set(nearbyPlaces);
        }
      });

    // Suggest nearby Google Places only while editing a Spot with no linked
    // place, so viewing a Spot never spends Places API quota.
    effect(() => {
      const spot = this.spot();
      if (spot instanceof Spot && !spot.googlePlaceId()) {
        void this._preloadNearbyPlaces();
      }
    });
  }
}

function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;

  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;

  return `${Math.round(km)} km`;
}

function haversineDistanceMeters(
  from: google.maps.LatLngLiteral,
  to: google.maps.LatLngLiteral,
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;

  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const fromLatRad = toRadians(from.lat);
  const toLatRad = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(fromLatRad) *
      Math.cos(toLatRad) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
