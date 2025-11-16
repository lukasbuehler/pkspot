import {
  AfterViewInit,
  Component,
  inject,
  LOCALE_ID,
  signal,
} from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { LocaleCode } from "../../db/models/Interfaces";
import { MatButtonModule } from "@angular/material/button";
import { MatRadioModule } from "@angular/material/radio";
import { FormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { NgOptimizedImage } from "@angular/common";
import { ExternalImage, StorageImage } from "../../db/models/Media";
import { ProfileButtonComponent } from "../components/profile-button/profile-button.component";
import { UserReferenceSchema } from "../../db/schemas/UserSchema";
import { UsersService } from "../services/firebase/firestore/users.service";

@Component({
  selector: "app-media-report-dialog",
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatButtonModule,
    MatRadioModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    NgOptimizedImage,
    ProfileButtonComponent,
  ],
  templateUrl: "./media-report-dialog.component.html",
  styleUrl: "./media-report-dialog.component.scss",
})
export class MediaReportDialogComponent implements AfterViewInit {
  public dialogRef =
    inject<MatDialogRef<MediaReportDialogComponent>>(MatDialogRef);
  public locale = inject<LocaleCode>(LOCALE_ID);
  private _usersService = inject(UsersService);

  userReference = signal<UserReferenceSchema | null | undefined>(null);

  ngAfterViewInit() {
    // Load user reference from storage or authentication service
    const userId = this.dialogData.media.userId;
    if (userId) {
      console.log("Media userId:", userId);
      this._usersService
        .getUserRefernceById(userId)
        .then((userRef) => {
          console.log("Fetched user reference:", userRef);
          this.userReference.set(userRef);
        })
        .catch((error) => {
          console.error("Error fetching user reference:", error);
        });
    } else {
      console.log(this.dialogData.media);
      console.warn("No userId found for the media.");
    }
  }

  public dialogData: any = inject<{
    media: StorageImage | ExternalImage;
    reason: string;
    comment: string;
  }>(MAT_DIALOG_DATA);

  onNoClick(): void {
    this.dialogRef.close();
  }

  submitReport(): void {
    // Implement report submission logic here

    // TODO

    this.dialogRef.close();
  }
}
