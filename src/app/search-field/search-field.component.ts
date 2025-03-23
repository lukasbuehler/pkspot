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
import { SpotSchema } from "../../db/schemas/SpotSchema";
import { AsyncPipe } from "@angular/common";
import { MatDividerModule } from "@angular/material/divider";
import { MatOptionModule } from "@angular/material/core";
import { SearchService } from "../services/search.service";
import { MatInputModule } from "@angular/material/input";
import { LocaleCode } from "../../db/models/Interfaces";

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
            this.spotAndPlaceSearchResults$.next(results);
            console.log("results", results);
          });
        } else {
          this.spotAndPlaceSearchResults$.next(null);
        }

        //   this.mapsService
        //     .autocompletePlaceSearch(query, ["geocode"])
        //     .then((results) => {
        //       this.spotAndPlaceSearchResults$.next({
        //         places: results,
        //         spots: null,
        //       });
        //     });
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
}
