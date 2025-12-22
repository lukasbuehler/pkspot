import {
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  model,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { SpotChallengeSchema } from "../../../db/schemas/SpotChallengeSchema";
import { LocaleMapEditFieldComponent } from "../locale-map-edit-field/locale-map-edit-field.component";
import { MediaUpload } from "../media-upload/media-upload.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { MatIconModule } from "@angular/material/icon";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";

import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  AnyMedia,
  ExternalVideo,
  StorageImage,
  StorageVideo,
  VideoMedia,
} from "../../../db/models/Media";
import { MediaType } from "../../../db/models/Interfaces";
import { LocaleMapViewComponent } from "../locale-map-view/locale-map-view.component";
import { makeAnyMediaFromMediaSchema } from "../../../scripts/Helpers";
import { VideoComponent } from "../video/video.component";
import { getBestLocale } from "../../../scripts/LanguageHelpers";
import { MatChipsModule } from "@angular/material/chips";
import { NgOptimizedImage } from "@angular/common";
import { RouterLink } from "@angular/router";
import {
  ChallengeLabelNames,
  ChallengeParticipantTypeNames,
  LocalSpotChallenge,
  SpotChallenge,
  ChallengeLabelTooltips,
} from "../../../db/models/SpotChallenge";
import { Spot } from "../../../db/models/Spot";
import { MediaSchema, StorageBucket } from "../../../db/schemas/Media";
import { MatDividerModule } from "@angular/material/divider";
import {
  ChallengeLabelIcons,
  ChallengeLabelValues,
  ChallengeParticipantTypeIcons,
  ChallengeParticipantTypeValues,
} from "../../../db/schemas/SpotChallengeLabels";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatTimepickerModule } from "@angular/material/timepicker";
import { FormsModule } from "@angular/forms";
import { provideNativeDateAdapter } from "@angular/material/core";
import {
  MatSlideToggleChange,
  MatSlideToggleModule,
} from "@angular/material/slide-toggle";
import { MatSelectModule } from "@angular/material/select";
import { AnalyticsService } from "../../services/analytics.service";

@Component({
  selector: "app-challenge-detail",
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    LocaleMapEditFieldComponent,
    MediaUpload,
    SpotPreviewCardComponent,
    MatIconModule,
    MatSnackBarModule,
    LocaleMapViewComponent,
    VideoComponent,
    MatChipsModule,
    NgOptimizedImage,
    RouterLink,
    MatDividerModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatTimepickerModule,
    FormsModule,
    MatSlideToggleModule,
    MatSelectModule,
  ],
  animations: [],
  providers: [provideNativeDateAdapter()],
  templateUrl: "./challenge-detail.component.html",
  styleUrl: "./challenge-detail.component.scss",
})
export class ChallengeDetailComponent {
  private _challengeService = inject(SpotChallengesService);
  authenticationService = inject(AuthenticationService);
  private _snackbar = inject(MatSnackBar);
  private _analyticsService = inject(AnalyticsService);
  locale = inject<string>(LOCALE_ID);

  Date = Date;
  readonly challengeLabels = ChallengeLabelValues;
  readonly challengeLabelNames = ChallengeLabelNames;
  readonly challengeLabelIcons = ChallengeLabelIcons;
  readonly challengeParticipantTypes = ChallengeParticipantTypeValues;
  readonly challengeParticipantTypeNames = ChallengeParticipantTypeNames;
  readonly challengeParticipantTypeIcons = ChallengeParticipantTypeIcons;
  readonly challengeLabelTooltips = ChallengeLabelTooltips;

  isEditing = model<boolean>(false);
  challenge = model<SpotChallenge | LocalSpotChallenge | null>(null);
  isLocalChallenge = computed<boolean>(() => {
    const challenge = this.challenge();
    if (!challenge) {
      return false;
    }
    return !(challenge instanceof SpotChallenge);
  });

  number = input<number | null>(null);

  userPicture = computed<StorageImage | null>(() => {
    const challenge = this.challenge();
    if (!challenge) {
      return null;
    }
    const user = challenge.user;
    if (!user) {
      return null;
    }
    return new StorageImage(challenge.user.profile_picture!);
  });

  spot = computed<Spot | null>(() => {
    const challenge = this.challenge();
    if (!challenge) {
      return null;
    }
    return challenge.spot;
  });
  videoMedia = signal<VideoMedia | null>(null);

  hasDescription = computed<boolean>(() => {
    const keys = Object.keys(this.challenge()?.descriptionLocaleMap() ?? {});
    return keys.length > 0;
  });

  constructor() {
    effect(() => {
      const media = this.challenge()?.media();

      if (media instanceof StorageVideo || media instanceof ExternalVideo) {
        this.videoMedia.set(media as VideoMedia);
      }
    });
  }

  challengeStorageFolder = StorageBucket.Challenges;

  hasChanges: boolean = false;

  validateChallenge(): boolean {
    // check that data.challenge is a valid SpotChallengeSchema

    // const challenge = this.challenge();
    // if (!challenge) {
    //   return false;
    // } else if (!challenge.spot || !challenge.spot.id) {
    //   this._snackbar.open(
    //     $localize`Error creating challenge: A spot is required`,
    //     "OK",
    //     {
    //       duration: 5000,
    //     }
    //   );
    //   return false;
    // } else if (
    //   !challenge.name ||
    //   Object.keys(challenge.name).length === 0 ||
    //   challenge.name[0]?.text.trim().length === 0
    // ) {
    //   this._snackbar.open(
    //     $localize`Error creating challenge: A challenge name is required`,
    //     "OK",
    //     {
    //       duration: 5000,
    //     }
    //   );
    //   return false;
    // } else if (!challenge.media || !challenge.media.src) {
    //   this._snackbar.open(
    //     $localize`Error creating challenge: An image or video is required`,
    //     "OK",
    //     {
    //       duration: 5000,
    //     }
    //   );
    //   return false;
    // }

    return true;
  }

  onNewMedia(newMedia: { src: string; is_sized: boolean; type: MediaType }) {
    this.challenge.update((challenge) => {
      if (!challenge) {
        return challenge;
      }

      const media: MediaSchema = {
        src: newMedia.src,
        isInStorage: true,
        type: newMedia.type,
        uid: this.authenticationService.user.uid,
        origin: "user",
      };

      challenge.media.set(makeAnyMediaFromMediaSchema(media));

      return challenge;
    });
  }

  backToSpot() {
    this.isEditing.set(false);
    this.challenge.set(null);
  }

  share() {}

  startEdit() {
    this.isEditing.set(true);
  }

  cancelEdit() {
    this.isEditing.set(false);

    if (!(this.challenge() instanceof SpotChallenge)) {
      // this is a local challenge, that wasn't saved so we can just delete it
      this.challenge.set(null);
    }
  }

  getImageSrc(media: AnyMedia): string {
    if (media instanceof StorageImage) {
      return media.getSrc(800);
    } else {
      return "";
    }
  }

  saveChallenge() {
    const spot = this.spot();
    const challenge = this.challenge();

    console.log(challenge);

    if (!spot || !challenge) throw new Error("No spot or challenge found!");

    if (!challenge.media()) {
      this._snackbar.open(
        $localize`Challenge media is required!`,
        $localize`I'll add media!`,
        {
          duration: 5000,
        }
      );
      return;
    }

    const challengeData = challenge.getData();

    if (!challengeData) throw new Error("Could not get challenge Data!");

    if (!challengeData.user || !challengeData.user.uid) {
      throw new Error("No user found for challenge! Implementation error.");
    }

    if (!this.validateChallenge()) {
      console.error("Challenge validation failed");
    }

    if (challenge instanceof SpotChallenge) {
      // update the challenge
      this._challengeService
        .updateChallenge(spot.id, challenge.id, challengeData)
        .then(() => {
          this._snackbar.open($localize`Challenge updated successfully`, "OK", {
            duration: 5000,
          });
          this.hasChanges = false;
          this.isEditing.set(false);
        });
    } else {
      // create a new challenge

      this._challengeService
        .addChallenge(spot.id, challengeData)
        .then((newChallengeId) => {
          this._snackbar.open(
            $localize`New challenge saved successfully`,
            "OK",
            {
              duration: 5000,
            }
          );
          this.hasChanges = false;
          this.isEditing.set(false);

          // make this challenge a SpotChallenge instead of a LocalSpotChallenge
          this.challenge.set(
            new SpotChallenge(newChallengeId, challengeData, spot, this.locale)
          );
        });
    }
  }

  async shareChallenge() {
    const spot = this.spot();
    const challenge = this.challenge();

    if (!spot) {
      console.error("No spot found to share");
      return;
    }
    if (!challenge) {
      console.error("No challenge found to share");
      return;
    }
    if (!(challenge instanceof SpotChallenge)) {
      console.error("Challenge is not a SpotChallenge");
      return;
    }

    // Build domain-agnostic share link without locale prefix
    const { buildAbsoluteUrlNoLocale } = await import(
      "../../../scripts/Helpers"
    );
    // TODO use slug instead of id if available
    const link = buildAbsoluteUrlNoLocale(`/map/${spot.id}/c/${challenge.id}`);

    if (navigator["share"]) {
      try {
        const shareData = {
          title: "Challenge: " + spot.name(),
          text: `PK Spot: ${spot.name()}`,
          url: link,
        };

        await navigator["share"](shareData);
      } catch (err) {
        console.error("Couldn't share this challenge");
        console.error(err);
      }
    } else {
      navigator.clipboard.writeText(
        `${spot.name()} Challenge - PK Spot \n${link}`
      );
      this._snackbar.open(
        $localize`Link to challenge copied to clipboard`,
        "Dismiss",
        {
          duration: 3000,
          horizontalPosition: "center",
          verticalPosition: "top",
        }
      );
    }

    this._analyticsService.trackEvent("Share Challenge", { spotId: spot.id });
  }

  onReleaseDateToggleChange(event: MatSlideToggleChange) {
    const challenge = this.challenge();
    if (!challenge) {
      throw new Error("No challenge found");
    }

    if (event.checked) {
      // it was switched on
      challenge.releaseDate = new Date();
    } else {
      // release date was switched off
      challenge.releaseDate = null;
    }
  }
}
