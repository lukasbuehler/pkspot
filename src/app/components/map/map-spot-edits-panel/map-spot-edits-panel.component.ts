import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { SpotEdit } from "../../../../db/models/SpotEdit";
import { SpotEditDetailsComponent } from "../../spot-edit-details/spot-edit-details.component";

@Component({
  selector: "app-map-spot-edits-panel",
  imports: [RouterLink, MatButtonModule, MatIconModule, SpotEditDetailsComponent],
  templateUrl: "./map-spot-edits-panel.component.html",
  styleUrl: "./map-spot-edits-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapSpotEditsPanelComponent {
  spotName = input("");
  spotSlugOrId = input<string | null>(null);
  spotId = input<string | null>(null);
  spotEdits = input<readonly SpotEdit[]>([]);
  mapQueryParams = input<Record<string, string> | null>(null);
}
