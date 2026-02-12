import { Component, EventEmitter, Input, Output } from "@angular/core";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { SpotFilterMode } from "../spot-map/spot-filter-config";

/**
 * Preset filter chip definition for display.
 */
interface PresetFilterChip {
  mode: SpotFilterMode;
  urlParam: string;
  label: string;
  icon: string;
}

/**
 * Horizontally scrollable filter chips bar with preset filters
 * and a "Filters" button for custom filtering.
 */
@Component({
  selector: "app-filter-chips-bar",
  standalone: true,
  imports: [MatChipsModule, MatIconModule],
  templateUrl: "./filter-chips-bar.component.html",
  styleUrl: "./filter-chips-bar.component.scss",
})
export class FilterChipsBarComponent {
  /** Currently selected filter value (matches urlParam) */
  @Input() selectedFilter: string = "";

  /** Whether to show the saved spots chip */
  @Input() showSavedChip: boolean = false;

  /** Whether a custom filter is currently active */
  @Input() customFilterActive: boolean = false;

  /** Emits when a preset filter is selected/deselected */
  @Output() filterChange = new EventEmitter<string>();

  /** Emits when user clicks the "Filters" button */
  @Output() filtersClick = new EventEmitter<void>();

  /** Preset filter chips derived from SPOT_FILTER_CONFIGS */
  readonly presetFilters: PresetFilterChip[] = [
    {
      mode: SpotFilterMode.ForParkour,
      urlParam: "parkour",
      label: $localize`:@@for_parkour_spots_chip_label:For Parkour`,
      icon: "steps",
    },
    {
      mode: SpotFilterMode.Dry,
      urlParam: "dry",
      label: $localize`:@@dry_spots_chip_label:Dry`,
      icon: "roofing",
    },
    {
      mode: SpotFilterMode.Indoor,
      urlParam: "indoor",
      label: $localize`:@@indoor_spots_chip_label:Indoor`,
      icon: "home",
    },
    {
      mode: SpotFilterMode.Lighting,
      urlParam: "lighting",
      label: $localize`:@@lighting_spots_chip_label:Lighting`,
      icon: "lightbulb",
    },
    {
      mode: SpotFilterMode.Water,
      urlParam: "water",
      label: $localize`:@@water_spots_chip_label:Water`,
      icon: "water",
    },
  ];

  /** Label for the filters button */
  readonly filtersLabel = $localize`:@@filters_chip_label:Filters`;
  readonly savedLabel = $localize`:@@saved_spots_chip_label:Saved`;

  onChipChange(value: string): void {
    this.filterChange.emit(value);
  }

  onFiltersClick(): void {
    this.filtersClick.emit();
  }
}
