import {
  Component,
  EventEmitter,
  inject,
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
import { AsyncPipe, NgOptimizedImage } from "@angular/common";
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
import {
  AmenitiesMap,
  AmenityIcons,
  GeneralAmenities,
} from "../../../db/schemas/Amenities";

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
    // NgOptimizedImage,
    SpotRatingComponent,
  ],
  templateUrl: "./search-field.component.html",
  styleUrl: "./search-field.component.scss",
})
export class SearchFieldComponent implements OnInit, OnDestroy {
  readonly locale = inject(LOCALE_ID);

  @Output() spotSelected = new EventEmitter<{
    type: "place" | "spot";
    id: string;
  }>();

  private _searchService = inject(SearchService);
  private _spotSearchSubscription?: Subscription;

  spotSearchControl = new FormControl();
  spotAndPlaceSearchResults$ = new BehaviorSubject<{
    places: google.maps.places.AutocompletePrediction[] | null;
    spots: SearchResponse<Partial<SpotSchema & { id: string }>> | null;
  } | null>(null);

  ngOnInit() {
    // subscribe to the spot search control and update the search results
    this._spotSearchSubscription =
      this.spotSearchControl.valueChanges.subscribe((query) => {
        if (query) {
          this._searchService.searchSpotsAndPlaces(query).then((results) => {
            // Limit places to 3 and spots to 5
            if (results.places) {
              results.places = results.places.slice(0, 3);
            }
            if (results.spots && results.spots.hits) {
              results.spots.hits = results.spots.hits.slice(0, 5);
            }
            this.spotAndPlaceSearchResults$.next(results);
            console.log("results", results);
          });
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
    const spotName = spot.name as Record<LocaleCode, string | { text: string }>;
    const nameLocales = Object.keys(spotName);
    const localeToShow: LocaleCode = nameLocales.includes(this.locale)
      ? (this.locale as LocaleCode)
      : (Object.keys(spotName)[0] as LocaleCode);

    if (typeof spotName[localeToShow] === "string") {
      return spotName[localeToShow];
    } else if (typeof spotName[localeToShow] === "object") {
      return spotName[localeToShow].text;
    } else {
      return $localize`Unnamed Spot`;
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
   * Get important amenities to display (only those with true value)
   */
  getImportantAmenities(
    amenities?: AmenitiesMap
  ): { key: keyof AmenitiesMap; icon: string }[] {
    if (!amenities) return [];

    // Get amenities that are explicitly true
    const importantAmenities = GeneralAmenities.filter(
      (key) => amenities[key] === true
    ).map((key) => ({
      key,
      icon: AmenityIcons[key] || "info",
    }));

    return importantAmenities;
  }
}
