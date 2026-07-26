import {
  ChangeDetectionStrategy,
  Component,
  input,
  OnChanges,
  output,
  SimpleChanges,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatChipsModule } from "@angular/material/chips";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { debounceTime, distinctUntilChanged } from "rxjs/operators";
import type { EventCategory } from "../../../db/schemas/EventSchema";
import {
  EntityReferenceAutocompleteComponent,
  type EntityReferenceOption,
} from "../entity-reference-autocomplete/entity-reference-autocomplete.component";

export type EventsDiscoveryView = "list" | "calendar";
export type EventsListPeriod = "upcoming" | "past";

export interface EventCategoryFilterOption {
  id: EventCategory;
  label: string;
  icon: string;
  count: number;
}

export interface EventSeriesFilterOption {
  id: string;
  label: string;
  count: number;
  logoSrc?: string;
  logoBackground: string;
}

@Component({
  selector: "app-event-discovery-toolbar",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    EntityReferenceAutocompleteComponent,
  ],
  templateUrl: "./event-discovery-toolbar.component.html",
  styleUrl: "./event-discovery-toolbar.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDiscoveryToolbarComponent implements OnChanges {
  readonly query = input("");
  readonly view = input.required<EventsDiscoveryView>();
  readonly period = input<EventsListPeriod>("upcoming");
  readonly areaKey = input("");
  readonly categoryOptions = input<readonly EventCategoryFilterOption[]>([]);
  readonly seriesOptions = input<readonly EventSeriesFilterOption[]>([]);
  readonly selectedCategories = input<readonly EventCategory[]>([]);
  readonly selectedSeriesIds = input<readonly string[]>([]);

  readonly queryChange = output<string>();
  readonly viewChange = output<EventsDiscoveryView>();
  readonly periodChange = output<EventsListPeriod>();
  readonly areaChange = output<EntityReferenceOption | null>();
  readonly categoryToggled = output<EventCategory>();
  readonly seriesToggled = output<string>();
  readonly filtersCleared = output<void>();

  readonly queryControl = new FormControl("", { nonNullable: true });

  constructor() {
    this.queryControl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.queryChange.emit(value.trim()));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["query"]) {
      const query = this.query();
      if (query !== this.queryControl.value) {
        this.queryControl.setValue(query, { emitEvent: false });
      }
    }
  }

  hasFilters(): boolean {
    return (
      !!this.areaKey() ||
      this.selectedCategories().length > 0 ||
      this.selectedSeriesIds().length > 0 ||
      !!this.query()
    );
  }
}
