import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { LocalSpot, Spot } from "../../../../db/models/Spot";
import { SpotPreviewData } from "../../../../db/schemas/SpotPreviewData";
import { Event as PkEvent } from "../../../../db/models/Event";
import { CommunitySearchPreview } from "../../../services/search.service";
import { SeriesDocument } from "../../../services/firebase/firestore/series.service";
import { ChipSelectorOption } from "../../chip-selector/chip-selector.component";
import {
  FilterChipsBarComponent,
  PresetFilterChip,
} from "../../filter-chips-bar/filter-chips-bar.component";
import { SpotListComponent } from "../../spot-list/spot-list.component";
import { MapCommunityListComponent } from "../map-community-list/map-community-list.component";
import { MapEventListComponent } from "../map-event-list/map-event-list.component";
import { MapObjectMode } from "../map-object-mode.model";
import { MatDividerModule } from "@angular/material/divider";

@Component({
  selector: "app-map-object-panel",
  imports: [
    FilterChipsBarComponent,
    MatButtonModule,
    MapCommunityListComponent,
    MapEventListComponent,
    MatIconModule,
    RouterLink,
    SpotListComponent,
    MatDividerModule,
  ],
  host: {
    "[style.--open-progress]": "openProgress()",
  },
  templateUrl: "./map-object-panel.component.html",
  styleUrl: "./map-object-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapObjectPanelComponent {
  readonly objectTypeLabel = "Map object type";
  private readonly _allModeEventLimit = 2;
  private readonly _allModeCommunityLimit = 8;

  mode = input.required<MapObjectMode>();
  objectTypes = input.required<readonly ChipSelectorOption<MapObjectMode>[]>();
  visibleSpots = input<(Spot | LocalSpot)[]>([]);
  highlightedSpots = input<SpotPreviewData[]>([]);
  visibleEvents = input<PkEvent[]>([]);
  eventSeriesById = input<Record<string, SeriesDocument>>({});
  visibleCommunities = input<CommunitySearchPreview[]>([]);
  popularCommunities = input<CommunitySearchPreview[]>([]);
  spotListLimit = input<number | undefined>(undefined);
  mapZoom = input<number | null>(null);
  enableSpotListAnimation = input(true);
  openProgress = input(1);

  modeChange = output<MapObjectMode>();
  spotSelect = output<SpotPreviewData | Spot | LocalSpot>();
  eventSelect = output<PkEvent>();
  communitySelect = output<CommunitySearchPreview>();

  allModeEvents = computed(() =>
    this.visibleEvents().slice(0, this._allModeEventLimit),
  );
  objectTypeFilterChips = computed<readonly PresetFilterChip[]>(() =>
    this.objectTypes().map((option) => ({
      mode: option.value,
      urlParam: option.value,
      label: option.label,
      icon: option.icon,
    })),
  );
  allModeCommunities = computed(() =>
    (this.visibleCommunities().length > 0
      ? this.visibleCommunities()
      : this.popularCommunities()
    ).slice(0, this._allModeCommunityLimit),
  );
  hasMoreSpots = computed(() => {
    const limit = this.spotListLimit();
    if (this.mode() !== "all" || limit === undefined) return false;

    return this.visibleSpotCount() > limit;
  });
  titleCollapsed = computed(() => this.openProgress() < 0.1);
  hidePeekTitles = computed(() => this.openProgress() < 0.2);
  visibleSpotCount = computed(() => {
    const highlightedIds = new Set(
      this.highlightedSpots().flatMap((spot) =>
        spot.id === undefined ? [] : [spot.id],
      ),
    );
    const remainingSpotCount = this.visibleSpots().filter((spot) => {
      if (spot instanceof Spot && highlightedIds.has(spot.id)) return false;
      return true;
    }).length;

    return this.highlightedSpots().length + remainingSpotCount;
  });

  onModeChange(value: string | null): void {
    if (value === null) {
      this.modeChange.emit("all");
      return;
    }

    if (
      value === "all" ||
      value === "spots" ||
      value === "events" ||
      value === "communities"
    ) {
      this.modeChange.emit(value);
    }
  }

  onModeFilterChange(value: string): void {
    this.onModeChange(value || "all");
  }

  showMoreSpots(): void {
    this.modeChange.emit("spots");
  }
}
