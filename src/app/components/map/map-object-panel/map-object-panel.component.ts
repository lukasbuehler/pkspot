import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { RouterLink } from "@angular/router";
import { LocalSpot, Spot } from "../../../../db/models/Spot";
import { SpotPreviewData } from "../../../../db/schemas/SpotPreviewData";
import { Event as PkEvent } from "../../../../db/models/Event";
import { CommunitySearchPreview } from "../../../services/search.service";
import {
  ChipSelectorComponent,
  ChipSelectorOption,
} from "../../chip-selector/chip-selector.component";
import { SpotListComponent } from "../../spot-list/spot-list.component";
import { MapCommunityListComponent } from "../map-community-list/map-community-list.component";
import { MapEventListComponent } from "../map-event-list/map-event-list.component";
import { MapObjectMode } from "../map-object-mode.model";

@Component({
  selector: "app-map-object-panel",
  imports: [
    ChipSelectorComponent,
    MapCommunityListComponent,
    MapEventListComponent,
    RouterLink,
    SpotListComponent,
  ],
  templateUrl: "./map-object-panel.component.html",
  styleUrl: "./map-object-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapObjectPanelComponent {
  readonly objectTypeLabel = "Map object type";

  mode = input.required<MapObjectMode>();
  objectTypes = input.required<readonly ChipSelectorOption<MapObjectMode>[]>();
  visibleSpots = input<(Spot | LocalSpot)[]>([]);
  highlightedSpots = input<SpotPreviewData[]>([]);
  visibleEvents = input<PkEvent[]>([]);
  visibleCommunities = input<CommunitySearchPreview[]>([]);
  popularCommunities = input<CommunitySearchPreview[]>([]);
  spotListLimit = input<number | undefined>(undefined);
  mapZoom = input<number | null>(null);
  enableSpotListAnimation = input(true);

  modeChange = output<MapObjectMode>();
  spotSelect = output<SpotPreviewData | Spot | LocalSpot>();
  eventSelect = output<PkEvent>();
  communitySelect = output<CommunitySearchPreview>();

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
}
