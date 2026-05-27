import { ChangeDetectionStrategy, Component, input, model } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import {
  LocalSpotChallenge,
  SpotChallenge,
} from "../../../../db/models/SpotChallenge";
import { ChallengeDetailComponent } from "../../challenge-detail/challenge-detail.component";
import { ChallengeListComponent } from "../../challenge-list/challenge-list.component";

@Component({
  selector: "app-map-spot-challenges-panel",
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    ChallengeDetailComponent,
    ChallengeListComponent,
  ],
  templateUrl: "./map-spot-challenges-panel.component.html",
  styleUrl: "./map-spot-challenges-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapSpotChallengesPanelComponent {
  spotName = input("");
  spotSlugOrId = input<string | null>(null);
  showAllChallenges = input(false);
  allSpotChallenges = input<SpotChallenge[]>([]);
  mapQueryParams = input<Record<string, string> | null>(null);

  selectedChallenge = model<SpotChallenge | LocalSpotChallenge | null>(null);
  isEditing = model(false);
}
