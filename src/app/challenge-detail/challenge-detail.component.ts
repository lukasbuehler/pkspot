import {
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  model,
  signal,
  WritableSignal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { SpotChallengeSchema } from "../../db/schemas/SpotChallengeSchema";
import { LocaleMapEditFieldComponent } from "../locale-map-edit-field/locale-map-edit-field.component";
import { MediaUpload } from "../media-upload/media-upload.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { SpotId } from "../../db/schemas/SpotSchema";
import { MatIconModule } from "@angular/material/icon";
import { StorageBucket } from "../services/firebase/storage.service";
import { SpotChallengesService } from "../services/firebase/firestore/spot-challenges.service";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { AuthenticationService } from "../services/firebase/authentication.service";
import {
  AnyMedia,
  ExternalVideo,
  StorageImage,
  StorageVideo,
  VideoMedia,
} from "../../db/models/Media";
import { MediaType } from "../../db/models/Interfaces";
import { LocaleMapViewComponent } from "../locale-map-view/locale-map-view.component";
import { makeAnyMediaFromMediaSchema } from "../../scripts/Helpers";
import { VideoComponent } from "../video/video.component";
import { getBestLocale } from "../../scripts/LanguageHelpers";
import { MatChipsModule } from "@angular/material/chips";
import { NgOptimizedImage } from "@angular/common";
import { RouterLink } from "@angular/router";
import {
  ChallengeLabelNames,
  ChallengeParticipantTypeNames,
  LocalSpotChallenge,
  SpotChallenge,
} from "../../db/models/SpotChallenge";
import { Spot } from "../../db/models/Spot";
import { MediaSchema } from "../../db/schemas/Media";
import { MatDividerModule } from "@angular/material/divider";

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
  ],
  templateUrl: "./challenge-detail.component.html",
  styleUrl: "./challenge-detail.component.scss",
})
export class ChallengeDetailComponent {
  private _challengeService = inject(SpotChallengesService);
  private _authService = inject(AuthenticationService);
  private _snackbar = inject(MatSnackBar);
  private locale = inject<string>(LOCALE_ID);

  readonly challengeLabelNames = ChallengeLabelNames;
  readonly challengeLabelIcons = ChallengeLabelNames;
  readonly challengeParticipantTypeNames = ChallengeParticipantTypeNames;
  readonly challengeParticipantTypeIcons = ChallengeParticipantTypeNames;

  isEditing = model<boolean>(false);
  challenge = model<SpotChallenge | LocalSpotChallenge | null>(null);

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
        uid: this._authService.user.uid,
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

  saveChallenge() {
    const spot = this.spot();
    const challenge = this.challenge();

    if (!spot || !challenge) throw new Error("No spot or challenge found!");

    const challengeData = this.challenge()?.getData();

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
    }
    this._challengeService.addChallenge(spot.id, challengeData).then(() => {
      this._snackbar.open($localize`New challenge saved successfully`, "OK", {
        duration: 5000,
      });
      this.hasChanges = false;
      this.isEditing.set(false);
    });
  }
}
