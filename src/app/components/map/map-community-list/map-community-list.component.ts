import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { CommunitySearchPreview } from "../../../services/search.service";

@Component({
  selector: "app-map-community-list",
  imports: [MatIconModule],
  templateUrl: "./map-community-list.component.html",
  styleUrl: "./map-community-list.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapCommunityListComponent {
  communities = input<readonly CommunitySearchPreview[]>([]);
  selectCommunity = output<CommunitySearchPreview>();

  onSelect(community: CommunitySearchPreview): void {
    this.selectCommunity.emit(community);
  }

  subtitle(community: CommunitySearchPreview): string {
    return [
      community.localityName,
      community.regionName,
      community.countryName ?? community.countryCode,
    ]
      .filter(Boolean)
      .join(", ");
  }
}
