import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";
import type {
  EventCategory,
  EventListingTier,
  EventRegionKey,
} from "../../../db/schemas/EventSchema";
import type { EventsDiscoveryView } from "./event-discovery-view-toggle.component";
import { FilterChipsBarComponent } from "../filter-chips-bar/filter-chips-bar.component";
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

export interface EventListingTierFilterOption {
  id: EventListingTier;
  label: string;
  count: number;
}

export interface EventRegionFilterOption {
  id: EventRegionKey;
  label: string;
  count: number;
}

@Component({
  selector: "app-event-discovery-toolbar",
  imports: [
    FilterChipsBarComponent,
    MatButtonModule,
    MatButtonToggleModule,
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
  readonly listingTierOptions = input<readonly EventListingTierFilterOption[]>(
    [],
  );
  readonly regionOptions = input<readonly EventRegionFilterOption[]>([]);
  readonly regionChips = computed(() => this.regionOptions().filter(region => region.count > 0 || this.selectedRegions().includes(region.id)).map(region => ({
    urlParam: region.id,
    label: `${region.label} ${region.count}`,
  })));

  toggleRegion(value: string): void {
    const region = this.regionOptions().find(option => option.id === value);
    if (region) this.regionToggled.emit(region.id);
  }

  readonly selectedCategories = input<readonly EventCategory[]>([]);
  readonly selectedSeriesIds = input<readonly string[]>([]);
  readonly selectedListingTiers = input<readonly EventListingTier[]>([]);
  readonly selectedRegions = input<readonly EventRegionKey[]>([]);

  readonly detailChips = computed(() => [
    ...this.categoryOptions().filter(option => option.count > 0 || this.selectedCategories().includes(option.id)).map(option => ({
      urlParam: `category:${option.id}`, label: `${option.label} ${option.count}`, icon: option.icon,
    })),
    ...this.seriesOptions().filter(option => option.count > 0 || this.selectedSeriesIds().includes(option.id)).map(option => ({
      urlParam: `series:${option.id}`, label: `${option.label} ${option.count}`, imageSrc: option.logoSrc, imageBackground: option.logoBackground,
    })),
    ...this.listingTierOptions().filter(option => option.count > 0 || this.selectedListingTiers().includes(option.id)).map(option => ({
      urlParam: `tier:${option.id}`, label: `${option.label} ${option.count}`,
    })),
  ]);
  readonly selectedDetails = computed(() => [
    ...this.selectedCategories().map(id => `category:${id}`),
    ...this.selectedSeriesIds().map(id => `series:${id}`),
    ...this.selectedListingTiers().map(id => `tier:${id}`),
  ]);

  toggleDetail(value: string): void {
    const category = this.categoryOptions().find(option => `category:${option.id}` === value);
    if (category) { this.categoryToggled.emit(category.id); return; }
    const series = this.seriesOptions().find(option => `series:${option.id}` === value);
    if (series) { this.seriesToggled.emit(series.id); return; }
    const tier = this.listingTierOptions().find(option => `tier:${option.id}` === value);
    if (tier) this.listingTierToggled.emit(tier.id);
  }

  readonly periodChange = output<EventsListPeriod>();
  readonly categoryToggled = output<EventCategory>();
  readonly seriesToggled = output<string>();
  readonly listingTierToggled = output<EventListingTier>();
  readonly regionToggled = output<EventRegionKey>();
  readonly filtersCleared = output<void>();

  hasFilters(): boolean {
    return (
      !!this.areaKey() ||
      this.selectedCategories().length > 0 ||
      this.selectedSeriesIds().length > 0 ||
      this.selectedListingTiers().length > 0 ||
      this.selectedRegions().length > 0 ||
      !!this.query()
    );
  }
}
