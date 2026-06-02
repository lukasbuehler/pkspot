import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { countries } from "../../../../scripts/Countries";
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
    const parts: string[] = [];

    if (community.scope === "locality") {
      if (community.regionName) parts.push(community.regionName);
      if (community.countryName) parts.push(community.countryName);
    } else if (community.scope === "region") {
      if (community.countryName) parts.push(community.countryName);
    }

    return parts.join(", ");
  }

  flagEmoji(community: CommunitySearchPreview): string {
    if (community.scope !== "country") {
      return "";
    }

    const countryCode = String(community.countryCode ?? "")
      .trim()
      .toUpperCase();
    return countryCode ? (countries[countryCode]?.emoji ?? "") : "";
  }

  fallbackIcon(community: CommunitySearchPreview): string {
    switch (community.scope) {
      case "country":
        return "public";
      case "region":
        return "map";
      case "locality":
        return "location_city";
      default:
        return "groups";
    }
  }
}
