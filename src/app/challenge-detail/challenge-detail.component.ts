import { Component, inject, signal, WritableSignal } from "@angular/core";
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
import { LocalSpot, Spot } from "../../db/models/Spot";
import { MatIconModule } from "@angular/material/icon";
import { StorageFolder } from "../services/firebase/storage.service";

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
  ],
  templateUrl: "./challenge-detail.component.html",
  styleUrl: "./challenge-detail.component.scss",
})
export class ChallengeDetailComponent {
  public dialogRef: MatDialogRef<ChallengeDetailComponent> =
    inject(MatDialogRef);
  data = inject<{
    challenge: Partial<SpotChallengeSchema> | null;
    spot: Spot | LocalSpot | null;
  }>(MAT_DIALOG_DATA);

  challangeStorageFolder = StorageFolder.Challanges;

  onNoClick(): void {
    this.data.challenge = null;
    this.dialogRef.close();
  }

  saveChallenge(): void {}
}
