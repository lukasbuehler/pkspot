import { Component, computed, input, signal } from "@angular/core";
import {
  ChallengeLabelNames,
  ChallengeParticipantTypeNames,
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
  ChallengeLabelValues,
  ChallengeParticipantTypeIcons,
  ChallengeParticipantTypeValues,
} from "../../db/schemas/SpotChallengeLabels";
import { MatChipsModule } from "@angular/material/chips";
import { MatMenuModule } from "@angular/material/menu";
import { MatSelectModule } from "@angular/material/select";
import { FormControl, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";

@Component({
  selector: "app-challenge-list",
  imports: [
    NgOptimizedImage,
    RouterLink,
    MatIconModule,
    MatChipsModule,
    MatMenuModule,
    MatSelectModule,

    MatFormFieldModule,
    MatSelectModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  templateUrl: "./challenge-list.component.html",
  styleUrl: "./challenge-list.component.scss",
})
export class ChallengeListComponent {
  spot = input<Spot | null>(null);
  challenges = input<
    SpotChallenge[] | (SpotChallengePreview & { spot?: Spot })[]
  >([]);

  filterOptions = input<boolean>(false);

  readonly challengeLabels = ChallengeLabelValues as string[];
  readonly challengeLabelNames = ChallengeLabelNames as Record<string, string>;
  readonly challengeLabelIcons = ChallengeLabelIcons as Record<string, string>;
  readonly challengeParticipantTypes =
    ChallengeParticipantTypeValues as string[];
  readonly challengeParticipantTypeNames =
    ChallengeParticipantTypeNames as Record<string, string>;
  readonly challengeParticipantTypeIcons =
    ChallengeParticipantTypeIcons as Record<string, string>;

  labelCtrl = new FormControl(this.challengeLabels);
  participantTypeCtrl = new FormControl(this.challengeParticipantTypes);

  private selectedLabels = signal<string[] | null>(this.challengeLabels);
  private selectedParticipantTypes = signal<string[] | null>(
    this.challengeParticipantTypes
  );

  constructor() {
    this.labelCtrl.valueChanges.subscribe((value) => {
      this.selectedLabels.set(value);
    });
    this.participantTypeCtrl.valueChanges.subscribe((value) => {
      this.selectedParticipantTypes.set(value);
    });
  }

  filteredChallenges = computed(() => {
    const challenges = this.challenges();

    const label = this.selectedLabels();
    const participantType = this.selectedParticipantTypes();

    return challenges.filter((challenge) => {
      const labelMatch =
        !label ||
        (Array.isArray(label)
          ? label.includes(challenge.label as string)
          : challenge.label === label);
      const participantTypeMatch =
        !participantType ||
        (Array.isArray(participantType)
          ? participantType.includes(challenge.participantType as string)
          : challenge.participantType === participantType);
      return labelMatch && participantTypeMatch;
    });
  });
}
