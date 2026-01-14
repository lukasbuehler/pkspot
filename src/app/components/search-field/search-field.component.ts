import {
  Component,
  EventEmitter,
  inject,
  Input,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  Output,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
} from "@angular/material/autocomplete";
import { MatFormField, MatSuffix } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { BehaviorSubject, Subscription } from "rxjs";
import { SearchResponse } from "typesense/lib/Typesense/Documents";
import { SpotSchema } from "../../../db/schemas/SpotSchema";
import { AsyncPipe } from "@angular/common";
import { MatDividerModule } from "@angular/material/divider";
import { MatOptionModule } from "@angular/material/core";
import { SearchService } from "../../services/search.service";
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
})
export class SearchFieldComponent implements OnInit, OnDestroy {
  readonly locale = inject(LOCALE_ID);

  @Input() appearance: "fill" | "outline" = "fill";

  @Output() spotSelected = new EventEmitter<{
    type: "place" | "spot";
    id: string;
  }>();

  private _searchService = inject(SearchService);
  private _spotSearchSubscription?: Subscription;

  spotSearchControl = new FormControl();
  // Use a loose result type to allow runtime-attached `preview` property
  spotAndPlaceSearchResults$ = new BehaviorSubject<{
    places: google.maps.places.AutocompletePrediction[] | null;
    // Typesense SearchResponse is kept at runtime, but we allow `any` here
    // so the template can access runtime-attached `preview` safely.
    spots: any | null;
  } | null>(null);

  @Input() onlySpots: boolean = false;

  ngOnInit() {
    // subscribe to the spot search control and update the search results
    this._spotSearchSubscription =
      this.spotSearchControl.valueChanges.subscribe((query) => {
        if (query) {
          if (this.onlySpots) {
            this._searchService.searchSpotsOnly(query).then((results) => {
              if (results.spots && results.spots.hits) {
                results.spots.hits = results.spots.hits.slice(0, 5);
              }
              this.spotAndPlaceSearchResults$.next(results);
            });
          } else {
            this._searchService.searchSpotsAndPlaces(query).then((results) => {
              // Limit places to 3 and spots to 5
              if (results.places) {
                results.places = results.places.slice(0, 3);
              }
              if (results.spots && results.spots.hits) {
                results.spots.hits = results.spots.hits.slice(0, 5);
              }
              this.spotAndPlaceSearchResults$.next(results);
            });
          }
        } else {
          this.spotAndPlaceSearchResults$.next(null);
        }
      });
  }

  ngOnDestroy(): void {
    this.spotAndPlaceSearchResults$.complete();
    this._spotSearchSubscription?.unsubscribe();
  }

  optionSelected(event: MatAutocompleteSelectedEvent) {
    console.log("optionSelected:", event);

    this.spotSearchControl.setValue("");

    this.spotSelected.emit(event.option.value);
  }

  getSpotName(spot: Partial<SpotSchema & { id: string }>): string {
    const rawName: any = (spot as any)?.name;

    if (!rawName) return $localize`Unnamed Spot`;

    // If the name is already a string, return it
    if (typeof rawName === "string") return rawName;

    // If the name is an object keyed by locale codes, try to pick the best one
    if (typeof rawName === "object") {
      const nameLocales = Object.keys(rawName);
      if (nameLocales.length === 0) return $localize`Unnamed Spot`;

      const localeToShow: LocaleCode = nameLocales.includes(this.locale)
        ? (this.locale as LocaleCode)
        : (nameLocales[0] as LocaleCode);

      const candidate = rawName[localeToShow];

      if (typeof candidate === "string") return candidate;
      if (candidate && typeof candidate.text === "string")
        return candidate.text;

      // Fallback: try to find any string-ish value in the object
      for (const k of nameLocales) {
        const v = rawName[k];
        if (typeof v === "string") return v;
        if (v && typeof v.text === "string") return v.text;
      }
    }

    return $localize`Unnamed Spot`;
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
