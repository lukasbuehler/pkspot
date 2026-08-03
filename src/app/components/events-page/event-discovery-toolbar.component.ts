import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import type { EventCategory } from "../../../db/schemas/EventSchema";
import type { EventsDiscoveryView } from "./event-discovery-view-toggle.component";
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
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatIconModule,
  ],
  templateUrl: "./event-discovery-toolbar.component.html",
  styleUrl: "./event-discovery-toolbar.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDiscoveryToolbarComponent {
  readonly query = input("");
  readonly view = input.required<EventsDiscoveryView>();
  readonly period = input<EventsListPeriod>("upcoming");
  readonly areaKey = input("");
  readonly categoryOptions = input<readonly EventCategoryFilterOption[]>([]);
  readonly seriesOptions = input<readonly EventSeriesFilterOption[]>([]);
  readonly selectedCategories = input<readonly EventCategory[]>([]);
  readonly selectedSeriesIds = input<readonly string[]>([]);

  readonly periodChange = output<EventsListPeriod>();
  readonly categoryToggled = output<EventCategory>();
  readonly seriesToggled = output<string>();
  readonly filtersCleared = output<void>();

  hasFilters(): boolean {
    return (
      !!this.areaKey() ||
      this.selectedCategories().length > 0 ||
      this.selectedSeriesIds().length > 0 ||
      !!this.query()
    );
  }
}
