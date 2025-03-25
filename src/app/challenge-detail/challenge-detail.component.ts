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

@Component({
  selector: "app-challenge-detail",
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDialogModule,
  ],
  templateUrl: "./challenge-detail.component.html",
  styleUrl: "./challenge-detail.component.scss",
})
export class ChallengeDetailComponent {
  public dialogRef: MatDialogRef<ChallengeDetailComponent> =
    inject(MatDialogRef);
  data = inject(MAT_DIALOG_DATA);

  challenge = signal<SpotChallengeSchema | null>(this.data ?? null);

  onNoClick(): void {
    this.dialogRef.close();
  }

  saveChallenge(): void {}
}
