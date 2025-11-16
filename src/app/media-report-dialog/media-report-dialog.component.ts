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
import { UserReferenceSchema } from "../../db/schemas/UserSchema";
import { UsersService } from "../services/firebase/firestore/users.service";
import { MediaReportsService } from "../services/firebase/firestore/media-reports.service";
import { AuthenticationService } from "../services/firebase/authentication.service";
import { firstValueFrom } from "rxjs";

@Component({
  selector: "app-media-report-dialog",
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButtonModule,
    MatRadioModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    NgOptimizedImage,
  ],
  templateUrl: "./media-report-dialog.component.html",
  styleUrl: "./media-report-dialog.component.scss",
})
export class MediaReportDialogComponent implements AfterViewInit {
  public dialogRef =
    inject<MatDialogRef<MediaReportDialogComponent>>(MatDialogRef);
  public locale = inject<LocaleCode>(LOCALE_ID);
  private _usersService = inject(UsersService);
  private _mediaReportsService = inject(MediaReportsService);
  private _authService = inject(AuthenticationService);

  userReference = signal<UserReferenceSchema | null | undefined>(null);
  isSubmitting = signal(false);
  isAuthenticated = signal(false);
  reporterEmail = signal("");

  ngAfterViewInit() {
    // Check if user is authenticated
    firstValueFrom(this._authService.authState$).then((user) => {
      this.isAuthenticated.set(!!user?.uid);
    });

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
    if (!this.dialogData.reason) {
      return;
    }

    // For unauthenticated users, email is required
    if (!this.isAuthenticated() && !this.reporterEmail()) {
      console.warn("Email is required for unauthenticated reports");
      return;
    }

    this.isSubmitting.set(true);

    this._mediaReportsService
      .submitMediaReport(
        this.dialogData.media,
        this.dialogData.reason,
        this.dialogData.comment,
        !this.isAuthenticated() ? this.reporterEmail() : undefined,
        this.locale
      )
      .then(() => {
        // Show success message (you can add a snackbar here if desired)
        console.log("Media report submitted successfully");
        this.dialogRef.close(true);
      })
      .catch((error) => {
        console.error("Error submitting media report:", error);
        this.isSubmitting.set(false);
        // Optionally show an error message to the user
      });
  }
}
