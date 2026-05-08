import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  output,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
} from "@angular/material/autocomplete";
import { MatFormField, MatSuffix } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { BehaviorSubject, from, merge, of, Subscription } from "rxjs";
import { SpotSchema } from "../../../db/schemas/SpotSchema";
import { AsyncPipe } from "@angular/common";
import { MatDividerModule } from "@angular/material/divider";
import { MatOptionModule } from "@angular/material/core";
import {
  CommunitySearchPreview,
  SearchService,
} from "../../services/search.service";
import { MatInputModule } from "@angular/material/input";
import { LocaleCode } from "../../../db/models/Interfaces";
import { SpotRatingComponent } from "../spot-rating/spot-rating.component";
import {
  SpotTypes,
  SpotTypesIcons,
  SpotTypesNames,
  SpotAccess,
  SpotAccessIcons,
  SpotAccessNames,
  parseSpotType,
  parseSpotAccess,
} from "../../../db/schemas/SpotTypeAndAccess";
import { AmenitiesMap } from "../../../db/schemas/Amenities";
import { getImportantAmenities } from "../../../db/models/Amenities";
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  scan,
  startWith,
  switchMap,
} from "rxjs/operators";

interface SearchSelection {
  type: "place" | "spot" | "community";
  id: string;
  community?: CommunitySearchPreview;
  spot?: SearchSpotPreview;
}

interface SearchSpotHitDocument {
  id: string;
  name?: unknown;
  thumbnail_url?: string;
  rating?: number;
  type?: string;
  access?: string;
  amenities?: AmenitiesMap;
  address?: {
    locality?: string;
    country?: {
      code?: string;
    } | null;
  } | null;
}

interface SearchSpotPreview {
  name?: string;
  slug?: string;
  imageSrc?: string;
  locality?: string;
  rating?: number;
  amenities?: AmenitiesMap;
}

interface SearchSpotHit {
  document: SearchSpotHitDocument;
  preview?: SearchSpotPreview;
}

interface SearchSpotResults {
  hits: SearchSpotHit[];
  found?: number;
}

interface SearchFieldResults {
  communities: CommunitySearchPreview[];
  displayedPlace: google.maps.places.AutocompletePrediction | null;
  displayedPlacePlacement: "top" | "bottom";
  previewPlaceId: string | null;
  previewCommunity: CommunitySearchPreview | null;
  spots: SearchSpotResults | null;
}

interface NamedSearchResultLike {
  name?: unknown;
}

@Component({
  selector: "app-search-field",
  imports: [
    MatFormField,
    MatInputModule,
    MatIconModule,
    MatAutocompleteTrigger,
    MatAutocomplete,
    ReactiveFormsModule,
    MatDividerModule,
    MatOptionModule,
    MatSuffix,
    AsyncPipe,
    SpotRatingComponent,
  ],
  templateUrl: "./search-field.component.html",
  styleUrl: "./search-field.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchFieldComponent implements OnInit, OnDestroy {
  readonly locale = inject(LOCALE_ID);

  appearance = input<"fill" | "outline">("fill");

  spotSelected = output<SearchSelection>();
  placePreviewChange = output<string | null>();
  communityPreviewChange = output<CommunitySearchPreview | null>();

  private _searchService = inject(SearchService);
  private _spotSearchSubscription?: Subscription;
  private readonly _minSearchQueryLength = 2;
  private _lastPreviewPlaceId: string | null = null;
  private _lastPreviewCommunityKey: string | null = null;
  private readonly _locationLikePlaceTypes = new Set([
    "geocode",
    "country",
    "administrative_area_level_1",
    "administrative_area_level_2",
    "administrative_area_level_3",
    "administrative_area_level_4",
    "administrative_area_level_5",
    "locality",
    "postal_town",
    "sublocality",
    "sublocality_level_1",
    "sublocality_level_2",
    "sublocality_level_3",
    "sublocality_level_4",
    "sublocality_level_5",
    "neighborhood",
    "postal_code",
    "route",
    "street_address",
    "intersection",
    "plus_code",
  ]);
  private readonly _nonLocationPlaceTypes = new Set([
    "establishment",
    "point_of_interest",
    "premise",
    "subpremise",
  ]);

  spotSearchControl = new FormControl<string | SearchSelection>("");
  spotAndPlaceSearchResults$ = new BehaviorSubject<SearchFieldResults | null>(
    null
  );

  onlySpots = input(false);

  ngOnInit() {
    // Debounce and cancel stale lookups to reduce API usage. Each search
    // (communities, spots, places) is fired independently and merged into
    // a running state — results show up as soon as they arrive instead of
    // waiting for the slowest (Google Places) to finish.
    this._spotSearchSubscription = this.spotSearchControl.valueChanges
      .pipe(
        map((value) => (typeof value === "string" ? value : "")),
        map((value) => value.trim()),
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          if (query.length < this._minSearchQueryLength) {
            return of(null);
          }

          const onlySpots = this.onlySpots();

          const communities$ = onlySpots
            ? of<{ kind: "communities"; data: CommunitySearchPreview[] }>({
                kind: "communities",
                data: [],
              })
            : from(this._searchService.searchCommunities(query)).pipe(
                map((data) => ({ kind: "communities" as const, data })),
                catchError(() =>
                  of({ kind: "communities" as const, data: [] })
                )
              );

          const spots$ = from(this._searchService.searchSpots(query)).pipe(
            map((data) => ({ kind: "spots" as const, data })),
            catchError(() =>
              of({
                kind: "spots" as const,
                data: { hits: [], found: 0 },
              })
            )
          );

          const places$ = onlySpots
            ? of<{
                kind: "places";
                data: google.maps.places.AutocompletePrediction[];
              }>({ kind: "places", data: [] })
            : from(this._searchService.searchPlaces(query)).pipe(
                map((data) => ({ kind: "places" as const, data })),
                catchError(() => of({ kind: "places" as const, data: [] }))
              );

          type Update =
            | { kind: "communities"; data: CommunitySearchPreview[] }
            | { kind: "spots"; data: { hits: any[]; found: number } }
            | {
                kind: "places";
                data: google.maps.places.AutocompletePrediction[];
              };

          interface PartialState {
            query: string;
            communitiesLoaded: boolean;
            communities: CommunitySearchPreview[];
            spotsLoaded: boolean;
            spots: SearchSpotResults | null;
            placesLoaded: boolean;
            places: google.maps.places.AutocompletePrediction[];
          }

          const initial: PartialState = {
            query,
            communitiesLoaded: onlySpots,
            communities: [],
            spotsLoaded: false,
            spots: null,
            placesLoaded: onlySpots,
            places: [],
          };

          return merge(communities$, spots$, places$).pipe(
            scan<Update, PartialState>((state, update) => {
              switch (update.kind) {
                case "communities":
                  return {
                    ...state,
                    communitiesLoaded: true,
                    communities: update.data,
                  };
                case "spots":
                  return {
                    ...state,
                    spotsLoaded: true,
                    spots: update.data,
                  };
                case "places":
                  return {
                    ...state,
                    placesLoaded: true,
                    places: update.data,
                  };
              }
            }, initial),
            startWith(initial),
            map((state) => this.buildResults(state))
          );
        })
      )
      .subscribe((results) => {
        this.spotAndPlaceSearchResults$.next(results);
        this.emitPlacePreviewChange(results?.previewPlaceId ?? null);
        this.emitCommunityPreviewChange(results?.previewCommunity ?? null);
      });
  }

  private buildResults(state: {
    query: string;
    communitiesLoaded: boolean;
    communities: CommunitySearchPreview[];
    spotsLoaded: boolean;
    spots: SearchSpotResults | null;
    placesLoaded: boolean;
    places: google.maps.places.AutocompletePrediction[];
  }): SearchFieldResults {
    const communities = state.communities.slice(0, 3);
    const hasCommunityHits = communities.length > 0;

    // Suppress Google Place row if a community matched. While communities
    // are still loading, also suppress to avoid a flash of "place then
    // community" when both end up matching.
    const placeAllowed = state.communitiesLoaded && !hasCommunityHits;
    const rawDisplayedPlace = placeAllowed ? (state.places[0] ?? null) : null;
    const displayedPlace = rawDisplayedPlace;

    const rawSpotHits = state.spots?.hits ?? [];
    const spotResults: SearchSpotResults | null = state.spots
      ? { ...state.spots, hits: rawSpotHits.slice(0, 5) }
      : null;
    const hasSpotHits = (spotResults?.hits?.length ?? 0) > 0;

    const previewCommunity =
      hasCommunityHits && communities[0].boundsCenter
        ? communities[0]
        : null;

    return {
      communities,
      displayedPlace,
      displayedPlacePlacement:
        displayedPlace &&
        hasSpotHits &&
        !this.isGoodLocationMatch(displayedPlace, state.query)
          ? "bottom"
          : "top",
      previewPlaceId:
        displayedPlace && this.isLocationLikePlace(displayedPlace)
          ? displayedPlace.place_id
          : null,
      previewCommunity,
      spots: spotResults,
    };
  }

  ngOnDestroy(): void {
    this.emitPlacePreviewChange(null);
    this.emitCommunityPreviewChange(null);
    this.spotAndPlaceSearchResults$.complete();
    this._spotSearchSubscription?.unsubscribe();
  }

  optionSelected(event: MatAutocompleteSelectedEvent) {
    console.log("optionSelected:", event);

    this.emitPlacePreviewChange(null);
    this.emitCommunityPreviewChange(null);
    this.spotSearchControl.setValue("");

    this.spotSelected.emit(event.option.value as SearchSelection);
  }

  private emitPlacePreviewChange(placeId: string | null): void {
    if (this._lastPreviewPlaceId === placeId) {
      return;
    }

    this._lastPreviewPlaceId = placeId;
    this.placePreviewChange.emit(placeId);
  }

  private emitCommunityPreviewChange(
    community: CommunitySearchPreview | null
  ): void {
    const key = community?.communityKey ?? null;
    if (this._lastPreviewCommunityKey === key) {
      return;
    }

    this._lastPreviewCommunityKey = key;
    this.communityPreviewChange.emit(community);
  }

  private isLocationLikePlace(
    place: google.maps.places.AutocompletePrediction
  ): boolean {
    const placeTypes = (place.types ?? []).map((type) => type.toLowerCase());

    if (placeTypes.length === 0) {
      return false;
    }

    if (placeTypes.some((type) => this._nonLocationPlaceTypes.has(type))) {
      return false;
    }

    return placeTypes.some((type) => this._locationLikePlaceTypes.has(type));
  }

  private isGoodLocationMatch(
    place: google.maps.places.AutocompletePrediction,
    query: string
  ): boolean {
    if (!this.isLocationLikePlace(place)) {
      return false;
    }

    const normalizedQuery = this.normalizeSearchText(query);
    if (normalizedQuery.length < this._minSearchQueryLength) {
      return false;
    }

    const mainText = this.normalizeSearchText(
      place.structured_formatting?.main_text || place.description || ""
    );
    const description = this.normalizeSearchText(place.description || "");

    if (
      mainText === normalizedQuery ||
      description === normalizedQuery ||
      mainText.startsWith(normalizedQuery) ||
      description.startsWith(normalizedQuery)
    ) {
      return true;
    }

    const queryTokens = normalizedQuery
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 1);

    return (
      queryTokens.length > 0 &&
      queryTokens.every(
        (token) =>
          mainText.includes(token) || description.includes(token)
      )
    );
  }

  private normalizeSearchText(text: string): string {
    return text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  getSpotName(spot: NamedSearchResultLike | null | undefined): string {
    const rawName = spot?.name;

    if (!rawName) return $localize`Unnamed Spot`;

    // If the name is already a string, return it
    if (typeof rawName === "string") return rawName;

    // If the name is an object keyed by locale codes, try to pick the best one
    if (typeof rawName === "object") {
      const localizedNames = rawName as Record<string, unknown>;
      const nameLocales = Object.keys(localizedNames);
      if (nameLocales.length === 0) return $localize`Unnamed Spot`;

      const localeToShow: LocaleCode = nameLocales.includes(this.locale)
        ? (this.locale as LocaleCode)
        : (nameLocales[0] as LocaleCode);

      const candidate = localizedNames[localeToShow];

      if (typeof candidate === "string") return candidate;
      if (
        candidate &&
        typeof candidate === "object" &&
        "text" in candidate &&
        typeof candidate.text === "string"
      ) {
        return candidate.text;
      }

      // Fallback: try to find any string-ish value in the object
      for (const k of nameLocales) {
        const v = localizedNames[k];
        if (typeof v === "string") return v;
        if (
          v &&
          typeof v === "object" &&
          "text" in v &&
          typeof v.text === "string"
        ) {
          return v.text;
        }
      }
    }

    return $localize`Unnamed Spot`;
  }

  getPositiveSpotRating(hit: SearchSpotHit): number | null {
    const rating = hit.preview?.rating ?? hit.document.rating ?? null;

    if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0) {
      return null;
    }

    return rating;
  }

  /**
   * Build a short locality/region/country description for a community result.
   * Example: "London, England, United Kingdom" or "Switzerland".
   */
  getCommunitySubtitle(community: CommunitySearchPreview): string {
    const parts: string[] = [];
    if (community.scope === "locality") {
      if (community.regionName) parts.push(community.regionName);
      if (community.countryName) parts.push(community.countryName);
    } else if (community.scope === "region") {
      if (community.countryName) parts.push(community.countryName);
    }
    return parts.join(", ");
  }

  getCommunityIcon(community: CommunitySearchPreview): string {
    switch (community.scope) {
      case "country":
        return "public";
      case "region":
        return "map";
      case "locality":
        return "location_city";
      default:
        return "groups";
    }
  }

  /**
   * Maps Google Places types to Material Design icons
   * Returns the appropriate icon name based on place type
   */
  getPlaceIcon(placeTypes: string[] | undefined): string {
    if (!placeTypes || placeTypes.length === 0) {
      return "location_on";
    }

    const type = placeTypes[0].toLowerCase();

    // Map common Google Places types to Material icons
    const typeIconMap: Record<string, string> = {
      // Countries and regions
      country: "public",
      // Administrative areas
      administrative_area_level_1: "map",
      administrative_area_level_2: "location_city",
      administrative_area_level_3: "location_city",
      administrative_area_level_4: "location_city",
      administrative_area_level_5: "location_city",
      // Cities and towns
      locality: "location_city",
      // Streets and postal
      route: "directions",
      street_address: "home",
      postal_code: "mail",
      // Landmarks and attractions
      point_of_interest: "star",
      establishment: "business",
      // Default
      default: "location_on",
    };

    return typeIconMap[type] || typeIconMap["default"];
  }

  /**
   * Get the localized name for a spot type
   */
  getSpotTypeIcon(typeString?: string): string {
    if (!typeString) return SpotTypesIcons[SpotTypes.Other];
    const type = parseSpotType(typeString);
    return SpotTypesIcons[type];
  }

  /**
   * Get the localized name for a spot type
   */
  getSpotTypeName(typeString?: string): string {
    if (!typeString) return SpotTypesNames[SpotTypes.Other];
    const type = parseSpotType(typeString);
    return SpotTypesNames[type];
  }

  /**
   * Get the localized name for a spot access type
   */
  getSpotAccessIcon(accessString?: string): string {
    if (!accessString) return SpotAccessIcons[SpotAccess.Other];
    const access = parseSpotAccess(accessString);
    return SpotAccessIcons[access];
  }

  /**
   * Get the localized name for a spot access type
   */
  getSpotAccessName(accessString?: string): string {
    if (!accessString) return SpotAccessNames[SpotAccess.Other];
    const access = parseSpotAccess(accessString);
    return SpotAccessNames[access];
  }
  /**
   * Get important amenities to display using the centralized logic
   * shared with the Spot model's importantAmenitiesArray.
   */
  getSpotImportantAmenities(
    amenities?: AmenitiesMap,
    spotType?: string
  ): { name?: string; icon?: string }[] {
    if (!amenities) return [];
    return getImportantAmenities(amenities, spotType);
  }
}
