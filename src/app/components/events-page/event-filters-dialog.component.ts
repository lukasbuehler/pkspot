import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import type { EventListingTier, EventRegionKey } from "../../../db/schemas/EventSchema";
import type {
  EventListingTierFilterOption,
  EventRegionFilterOption,
  EventSeriesFilterOption,
} from "./event-discovery-toolbar.component";

export interface EventFiltersDialogData {
  regions: readonly EventRegionFilterOption[];
  series: readonly EventSeriesFilterOption[];
  listingTiers: readonly EventListingTierFilterOption[];
  selectedRegions: readonly EventRegionKey[];
  selectedSeriesIds: readonly string[];
  selectedListingTiers: readonly EventListingTier[];
}

export interface EventFiltersDialogResult {
  regions: EventRegionKey[];
  seriesIds: string[];
  listingTiers: EventListingTier[];
}

/**
 * Where and by whom: the filters beside the event-type chips. Types stay in the
 * chip row; region, series and organiser are chosen here so the two kinds of
 * filter are not mixed in one line.
 */
@Component({
  selector: "app-event-filters-dialog",
  imports: [MatButtonModule, MatChipsModule, MatDialogModule],
  templateUrl: "./event-filters-dialog.component.html",
  styleUrl: "./event-filters-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventFiltersDialogComponent {
  readonly data = inject<EventFiltersDialogData>(MAT_DIALOG_DATA);
  private readonly _dialogRef = inject(
    MatDialogRef<EventFiltersDialogComponent, EventFiltersDialogResult>,
  );

  /** Under "Organised by", the tiers read as who organises, not "Events". */
  readonly tierLabels: Record<EventListingTier, string> = {
    formal: $localize`:@@events.filters_dialog.tier_formal:Organisers`,
    community: $localize`:@@events.filters_dialog.tier_community:Community`,
  };

  readonly regions = signal<EventRegionKey[]>([...this.data.selectedRegions]);
  readonly seriesIds = signal<string[]>([...this.data.selectedSeriesIds]);
  readonly listingTiers = signal<EventListingTier[]>([
    ...this.data.selectedListingTiers,
  ]);

  setRegions(value: EventRegionKey[] | null): void {
    this.regions.set(value ?? []);
  }

  setSeries(value: string[] | null): void {
    this.seriesIds.set(value ?? []);
  }

  setListingTiers(value: EventListingTier[] | null): void {
    this.listingTiers.set(value ?? []);
  }

  reset(): void {
    this.regions.set([]);
    this.seriesIds.set([]);
    this.listingTiers.set([]);
  }

  apply(): void {
    this._dialogRef.close({
      regions: this.regions(),
      seriesIds: this.seriesIds(),
      listingTiers: this.listingTiers(),
    });
  }
}
