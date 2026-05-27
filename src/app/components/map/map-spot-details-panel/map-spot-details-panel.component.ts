import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
} from "@angular/core";
import {
  LocalSpotChallenge,
  SpotChallenge,
} from "../../../../db/models/SpotChallenge";
import { LocalSpot, Spot } from "../../../../db/models/Spot";
import { SpotDetailsComponent } from "../../spot-details/spot-details.component";
import { PendingSpotPanel } from "../map-panel-view.model";

@Component({
  selector: "app-map-spot-details-panel",
  imports: [SpotDetailsComponent],
  templateUrl: "./map-spot-details-panel.component.html",
  styleUrl: "./map-spot-details-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapSpotDetailsPanelComponent {
  pendingSpot = input<PendingSpotPanel | null>(null);
  spot = input<Spot | LocalSpot | null>(null);
  isEditing = input(false);
  pendingVoteCount = input(0);
  openProgress = input(1);
  mapQueryParams = input<Record<string, string> | null>(null);

  challenge = model<SpotChallenge | LocalSpotChallenge | null>(null);

  isEditingChange = output<boolean>();
  dismiss = output<void>();
  addBoundsClick = output<void>();
  focusClick = output<void>();
  saveClick = output<Spot | LocalSpot>();
}
