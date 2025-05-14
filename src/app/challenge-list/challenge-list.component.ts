import { Component, input, Signal } from "@angular/core";
import {
  SpotChallenge,
  SpotChallengePreview,
} from "../../db/models/SpotChallenge";
import { NgOptimizedImage } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ChallengePreviewSchema } from "../../db/schemas/SpotChallengeSchema";
import { Spot } from "../../db/models/Spot";
import { AnyMedia } from "../../db/models/Media";
import { SpotId } from "../../db/schemas/SpotSchema";
import { MatIconModule } from "@angular/material/icon";
import {
  ChallengeLabelIcons,
  ChallengeParticipantTypeIcons,
} from "../../db/schemas/SpotChallengeLabels";

@Component({
  selector: "app-challenge-list",
  imports: [NgOptimizedImage, RouterLink, MatIconModule],
  templateUrl: "./challenge-list.component.html",
  styleUrl: "./challenge-list.component.scss",
})
export class ChallengeListComponent {
  spot = input<Spot | null>(null);
  challenges = input<
    SpotChallenge[] | (SpotChallengePreview & { spot?: Spot })[]
  >([]);

  readonly challengeLabelIcons = ChallengeLabelIcons;
  // readonly challengeParticipantTypes = ChallengeParticipantTypeValues;
  // readonly challengeParticipantTypeNames = ChallengeParticipantTypeNames;
  readonly challengeParticipantTypeIcons = ChallengeParticipantTypeIcons;
}
