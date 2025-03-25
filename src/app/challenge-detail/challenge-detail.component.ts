import {
  Component,
  computed,
  inject,
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
import { LocalSpot, Spot, SpotId } from "../../db/models/Spot";
import { MatIconModule } from "@angular/material/icon";
import { StorageFolder } from "../services/firebase/storage.service";
import { SpotChallengesService } from "../services/firebase/firestore/spot-challenges.service";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { Media, OtherMedia, SizedStorageSrc } from "../../db/models/Interfaces";
import { AuthenticationService } from "../services/firebase/authentication.service";

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
  ],
  templateUrl: "./challenge-detail.component.html",
  styleUrl: "./challenge-detail.component.scss",
})
export class ChallengeDetailComponent {
  public dialogRef: MatDialogRef<ChallengeDetailComponent> =
    inject(MatDialogRef);
  challenge = inject<Partial<SpotChallengeSchema> | null>(MAT_DIALOG_DATA);
  private _challengeService = inject(SpotChallengesService);
  private _authService = inject(AuthenticationService);
  private _snackbar = inject(MatSnackBar);

  spot = signal<SpotPreviewData | null>(
    (this.challenge?.spot as SpotPreviewData) ?? null
  );

  challengeStorageFolder = StorageFolder.Challenges;

  hasChanges: boolean = false;

  onNoClick(): void {
    if (!this.hasChanges) {
      this.challenge = null;
      this.dialogRef.close();
    }
  }

  validateChallenge(): boolean {
    // check that data.challenge is a valid SpotChallengeSchema

    const challenge = this.challenge as SpotChallengeSchema;
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

  onNewMedia(media: Media) {
    this.challenge!.media = media;
    this.hasChanges = true;
  }

  cancel() {
    this.hasChanges = false;
    this.onNoClick();
  }
  saveChallenge() {
    const spot = this.spot();
    if (!this.challenge) return;

    if (!this.challenge.user || !this.challenge.user.uid) {
      console.error("No user found for challenge! Implementation error.");
      return;
    }

    const { id, name } = spot as { id: SpotId; name: string };
    this.challenge.spot = { id, name };

    console.log(this.challenge);

    if (!this.validateChallenge()) {
      return;
    }

    this._challengeService
      .addChallenge(
        this.challenge!.spot!.id,
        this.challenge as SpotChallengeSchema
      )
      .then(() => {
        this._snackbar.open($localize`Challenge saved`, "OK", {
          duration: 5000,
        });
        this.hasChanges = false;
        this.dialogRef.close();
      });
  }
}
