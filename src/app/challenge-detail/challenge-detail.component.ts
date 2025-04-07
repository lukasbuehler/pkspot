import {
  Component,
  computed,
  effect,
  inject,
  LOCALE_ID,
  signal,
  WritableSignal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
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

@Component({
  selector: "app-challenge-detail",
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDialogModule,
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
  ],
  templateUrl: "./challenge-detail.component.html",
  styleUrl: "./challenge-detail.component.scss",
})
export class ChallengeDetailComponent {
  public dialogRef: MatDialogRef<ChallengeDetailComponent> =
    inject(MatDialogRef);
  data = inject<
    Partial<{
      isEditing?: boolean;
      challenge?: SpotChallengeSchema | null;
    }>
  >(MAT_DIALOG_DATA);
  private _challengeService = inject(SpotChallengesService);
  private _authService = inject(AuthenticationService);
  private _snackbar = inject(MatSnackBar);
  private locale = inject<string>(LOCALE_ID);

  isEditing = signal<boolean>(this.data?.isEditing ?? false);
  challenge = signal<SpotChallengeSchema | null>(this.data?.challenge ?? null);
  challengeMedia = computed<AnyMedia | null>(() => {
    const challenge = this.challenge();
    if (!challenge) {
      return null;
    }

    const media = makeAnyMediaFromMediaSchema(challenge.media);

    return media;
  });
  challengeName = computed<string>(() => {
    const challenge = this.challenge();
    if (!challenge) {
      return "";
    }

    const locale = getBestLocale(Object.keys(challenge.name), this.locale);

    return challenge.name[locale]?.text ?? "";
  });
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

  spot = signal<SpotPreviewData | null>(
    (this.data?.challenge?.spot as SpotPreviewData) ?? null
  );
  videoMedia = signal<VideoMedia | null>(null);

  constructor() {
    effect(() => {
      const challenge = this.challenge();
      if (challenge) {
        this.data.challenge = challenge;
      }
    });

    effect(() => {
      const media = this.challengeMedia();

      if (media instanceof StorageVideo || media instanceof ExternalVideo) {
        this.videoMedia.set(media as VideoMedia);
      }
    });
  }

  challengeStorageFolder = StorageBucket.Challenges;

  hasChanges: boolean = false;

  onNoClick(): void {
    if (!this.hasChanges) {
      this.challenge.set(null);
      this.dialogRef.close();
    }
  }

  validateChallenge(): boolean {
    // check that data.challenge is a valid SpotChallengeSchema

    const challenge = this.challenge();
    if (!challenge) {
      return false;
    } else if (!challenge.spot || !challenge.spot.id) {
      this._snackbar.open(
        $localize`Error creating challenge: A spot is required`,
        "OK",
        {
          duration: 5000,
        }
      );
      return false;
    } else if (
      !challenge.name ||
      Object.keys(challenge.name).length === 0 ||
      challenge.name[0]?.text.trim().length === 0
    ) {
      this._snackbar.open(
        $localize`Error creating challenge: A challenge name is required`,
        "OK",
        {
          duration: 5000,
        }
      );
      return false;
    } else if (!challenge.media || !challenge.media.src) {
      this._snackbar.open(
        $localize`Error creating challenge: An image or video is required`,
        "OK",
        {
          duration: 5000,
        }
      );
      return false;
    }

    return true;
  }

  onNewMedia(media: { src: string; is_sized: boolean; type: MediaType }) {
    this.challenge.update((challenge) => {
      if (!challenge) {
        return challenge;
      }

      challenge.media = {
        src: media.src,
        isInStorage: true,
        type: media.type,
        uid: this._authService.user.uid,
        origin: "user",
      };

      return challenge;
    });
    this.hasChanges = true;
  }

  dismiss() {
    this.hasChanges = false;
    this.dialogRef.close();
  }

  share() {}

  cancel() {
    this.hasChanges = false;
    this.onNoClick();
  }
  saveChallenge() {
    const spot = this.spot();
    const challenge = this.challenge();

    if (!challenge) return;

    if (!challenge.user || !challenge.user.uid) {
      console.error("No user found for challenge! Implementation error.");
      return;
    }

    const { id, name } = spot as { id: SpotId; name: string };
    this.challenge.update((challenge) => {
      if (!challenge) {
        return challenge;
      }
      challenge.spot = { id, name };
      return challenge;
    });

    console.log(this.challenge);

    if (!this.validateChallenge()) {
      return;
    }

    this._challengeService
      .addChallenge(challenge.spot!.id, challenge)
      .then(() => {
        this._snackbar.open($localize`Challenge saved`, "OK", {
          duration: 5000,
        });
        this.hasChanges = false;
        this.dialogRef.close();
      });
  }
}
