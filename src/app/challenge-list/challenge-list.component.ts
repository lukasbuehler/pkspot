import {
  Component,
  computed,
  input,
  signal,
  Output,
  EventEmitter,
  Input,
  OnChanges,
  SimpleChanges,
  model,
  effect,
} from "@angular/core";
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
import { MatDividerModule } from "@angular/material/divider";

type ChallengeType =
  | SpotChallenge
  | ((SpotChallengePreview & { spot?: Spot }) & { number?: number });
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
    MatDividerModule,
  ],
  templateUrl: "./challenge-list.component.html",
  styleUrl: "./challenge-list.component.scss",
})
export class ChallengeListComponent {
  spot = input<Spot | null>(null);
  challenges = input<
    SpotChallenge[] | (SpotChallengePreview & { spot?: Spot })[]
  >([]);

  showFilterOptions = input<boolean>(false);
  showIndexAsNumber = input<boolean>(false);

  withHrefLink = input(true);
  @Output("challengeClickIndex") challengeClickIndexEvent =
    new EventEmitter<number>();

  readonly challengeLabels = ChallengeLabelValues as string[];
  readonly challengeLabelNames = ChallengeLabelNames as Record<string, string>;
  readonly challengeLabelIcons = ChallengeLabelIcons as Record<string, string>;
  readonly challengeParticipantTypes =
    ChallengeParticipantTypeValues as string[];
  readonly challengeParticipantTypeNames =
    ChallengeParticipantTypeNames as Record<string, string>;
  readonly challengeParticipantTypeIcons =
    ChallengeParticipantTypeIcons as Record<string, string>;

  labelCtrl = new FormControl<string[]>([]);
  participantTypeCtrl = new FormControl<string[]>([]);

  selectedLabels = model<string[]>([]);
  selectedParticipantTypes = model<string[]>([]);

  constructor() {
    effect(() => {
      const selectedLabels: string[] = this.selectedLabels() ?? [];

      this.labelCtrl.setValue(selectedLabels, {
        emitEvent: false,
      });
    });

    effect(() => {
      const selectedParticipantTypes: string[] =
        this.selectedParticipantTypes() ?? [];

      this.participantTypeCtrl.setValue(selectedParticipantTypes, {
        emitEvent: false,
      });
    });

    this.labelCtrl.valueChanges.subscribe((value) => {
      this.selectedLabels.set(value ?? []);
    });
    this.participantTypeCtrl.valueChanges.subscribe((value) => {
      this.selectedParticipantTypes.set(value ?? []);
    });
  }

  filteredChallenges = computed<ChallengeType[]>(() => {
    const challenges = this.challenges();
    const labels = this.selectedLabels();
    const participantTypes = this.selectedParticipantTypes();

    return challenges.filter((challenge) => {
      const c = challenge as SpotChallenge;
      if (
        (labels?.length === this.challengeLabels.length &&
          participantTypes?.length === this.challengeParticipantTypes.length) ||
        (labels?.length === 0 && participantTypes?.length === 0) ||
        !labels ||
        !participantTypes
      ) {
        return true;
      }
      const labelMatch =
        !labels ||
        labels.length === 0 ||
        (Array.isArray(labels)
          ? labels.includes(c.label as string)
          : c.label === labels);
      const participantTypeMatch =
        !participantTypes ||
        participantTypes.length === 0 ||
        (Array.isArray(participantTypes)
          ? participantTypes.includes(c.participantType as string)
          : c.participantType === participantTypes);
      return labelMatch && participantTypeMatch;
    });
  });

  // Helper method to get the display number for a challenge
  getChallengeDisplayNumber(challenge: ChallengeType, index: number): number {
    return (challenge as any).number ?? index;
  }

  onChallengeClick(index: number) {
    this.challengeClickIndexEvent.emit(index);
  }
}
