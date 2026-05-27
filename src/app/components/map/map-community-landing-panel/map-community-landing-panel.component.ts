import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { SpotPreviewData } from "../../../../db/schemas/SpotPreviewData";
import { Event as PkEvent } from "../../../../db/models/Event";
import { CommunityLandingPageData } from "../../../services/firebase/firestore/landing-pages.service";
import { MapIslandCommunity } from "../../map-island/map-island.component";
import { CommunityLandingPageComponent } from "../../community-landing-page/community-landing-page.component";

type CommunityExploreMode = "all" | "dry";

@Component({
  selector: "app-map-community-landing-panel",
  imports: [CommunityLandingPageComponent],
  templateUrl: "./map-community-landing-panel.component.html",
  styleUrl: "./map-community-landing-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapCommunityLandingPanelComponent {
  community = input<CommunityLandingPageData | null>(null);
  pendingCommunity = input<MapIslandCommunity | null>(null);
  openProgress = input(1);
  backLabel = input<string | null>(null);
  backTypeLabel = input<string | null>(null);

  back = output<void>();
  closePanel = output<void>();
  selectEvent = output<PkEvent>();
  openCommunityPath = output<string>();
  selectSpot = output<SpotPreviewData>();
  exploreCommunitySpots = output<CommunityExploreMode>();
}
