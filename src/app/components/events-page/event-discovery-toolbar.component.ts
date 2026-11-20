import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
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
import { eventDateRangeLabel, type EventDateRange } from "./event-date-range";
import {
  EventFiltersDialogComponent,
  type EventFiltersDialogData,
  type EventFiltersDialogResult,
} from "./event-filters-dialog.component";
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
  readonly selectedCategories = input<readonly EventCategory[]>([]);
  readonly selectedSeriesIds = input<readonly string[]>([]);
  readonly selectedListingTiers = input<readonly EventListingTier[]>([]);
  readonly selectedRegions = input<readonly EventRegionKey[]>([]);
  readonly dateRange = input<EventDateRange | null>(null);
  /** Date windows only make sense for the upcoming list. */
  readonly showDateRange = computed(
    () => this.view() === "list" && this.period() === "upcoming",
  );

  private readonly _dialog = inject(MatDialog);

  /**
   * The row holds event types. Region, series and organiser live in the
   * Filter dialog; once chosen they also show here, so they can be removed
   * with one tap.
   */
  readonly detailChips = computed(() => [
    ...this.categoryOptions().map(option => ({
      urlParam: `category:${option.id}`, label: `${option.label} ${option.count}`, icon: option.icon,
    })),
    ...this.seriesOptions()
      .filter(option => this.selectedSeriesIds().includes(option.id))
      .map(option => ({
        urlParam: `series:${option.id}`, label: option.label, imageSrc: option.logoSrc, imageBackground: option.logoBackground,
      })),
    ...this.listingTierOptions()
      .filter(option => this.selectedListingTiers().includes(option.id))
      .map(option => ({ urlParam: `tier:${option.id}`, label: option.label, icon: "groups" })),
    ...this.regionOptions()
      .filter(option => this.selectedRegions().includes(option.id))
      .map(region => ({ urlParam: `region:${region.id}`, label: region.label, icon: "public" })),
    ...this.activeDateRanges().map(range => ({
      urlParam: `date:${range}`, label: eventDateRangeLabel(range), icon: "date_range",
    })),
  ]);
  private readonly activeDateRanges = computed(() => {
    const range = this.dateRange();
    return range && this.showDateRange() ? [range] : [];
  });
  /** Whether the Filter dialog has anything to offer. */
  readonly hasDialogFilters = computed(
    () =>
      this.showDateRange() ||
      this.seriesOptions().length > 0 ||
      this.listingTierOptions().length > 0 ||
      this.regionOptions().length > 0,
  );
  readonly dialogFiltersActive = computed(
    () =>
      this.activeDateRanges().length > 0 ||
      this.selectedSeriesIds().length > 0 ||
      this.selectedListingTiers().length > 0 ||
      this.selectedRegions().length > 0,
  );
  readonly selectedDetails = computed(() => [
    ...this.selectedCategories().map(id => `category:${id}`),
    ...this.selectedSeriesIds().map(id => `series:${id}`),
    ...this.selectedListingTiers().map(id => `tier:${id}`),
    ...this.selectedRegions().map(id => `region:${id}`),
    ...this.activeDateRanges().map(range => `date:${range}`),
  ]);

  toggleDetail(value: string): void {
    const category = this.categoryOptions().find(option => `category:${option.id}` === value);
    if (category) { this.categoryToggled.emit(category.id); return; }
    const series = this.seriesOptions().find(option => `series:${option.id}` === value);
    if (series) { this.seriesToggled.emit(series.id); return; }
    const tier = this.listingTierOptions().find(option => `tier:${option.id}` === value);
    if (tier) { this.listingTierToggled.emit(tier.id); return; }
    const region = this.regionOptions().find(option => `region:${option.id}` === value);
    if (region) { this.regionToggled.emit(region.id); return; }
    if (value.startsWith("date:")) this.dateRangeCleared.emit();
  }

  openFilters(): void {
    const data: EventFiltersDialogData = {
      regions: this.regionOptions(),
      series: this.seriesOptions(),
      listingTiers: this.listingTierOptions(),
      selectedRegions: this.selectedRegions(),
      selectedSeriesIds: this.selectedSeriesIds(),
      selectedListingTiers: this.selectedListingTiers(),
      showDateRange: this.showDateRange(),
      selectedDateRange: this.dateRange(),
    };
    this._dialog
      .open<EventFiltersDialogComponent, EventFiltersDialogData, EventFiltersDialogResult>(
        EventFiltersDialogComponent,
        { data, width: "min(520px, calc(100vw - 32px))", autoFocus: "dialog" },
      )
      .afterClosed()
      .subscribe((result) => {
        // One output, so the page applies every change in a single navigation.
        if (result) this.dialogFiltersApplied.emit(result);
      });
  }

  readonly periodChange = output<EventsListPeriod>();
  readonly categoryToggled = output<EventCategory>();
  readonly seriesToggled = output<string>();
  readonly listingTierToggled = output<EventListingTier>();
  readonly regionToggled = output<EventRegionKey>();
  readonly filtersCleared = output<void>();
  readonly dateRangeCleared = output<void>();
  readonly dialogFiltersApplied = output<EventFiltersDialogResult>();

  hasFilters(): boolean {
    return (
      !!this.areaKey() ||
      this.selectedCategories().length > 0 ||
      this.selectedSeriesIds().length > 0 ||
      this.selectedListingTiers().length > 0 ||
      this.selectedRegions().length > 0 ||
      this.activeDateRanges().length > 0 ||
      !!this.query()
    );
  }
}
