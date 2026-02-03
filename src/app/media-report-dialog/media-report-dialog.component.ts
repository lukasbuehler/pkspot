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
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { NgOptimizedImage } from "@angular/common";
import {
  ExternalImage,
  StorageImage,
  AnyMedia,
  StorageVideo,
} from "../../db/models/Media";
import { UserReferenceSchema } from "../../db/schemas/UserSchema";
import { UsersService } from "../services/firebase/firestore/users.service";
import { MediaReportsService } from "../services/firebase/firestore/media-reports.service";
import { AuthenticationService } from "../services/firebase/authentication.service";
import { firstValueFrom } from "rxjs";
import { isEmailValid } from "../../scripts/Helpers";

@Component({
  selector: "app-media-report-dialog",
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButtonModule,
    MatRadioModule,
    ReactiveFormsModule,
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
  private _fb = inject(FormBuilder);

  userReference = signal<UserReferenceSchema | null | undefined>(null);
  isSubmitting = signal(false);
  isAuthenticated = signal(false);

  reportForm: FormGroup;
  public dialogData: any = inject<{
    media: AnyMedia;
    spotId?: string;
  }>(MAT_DIALOG_DATA);

  getPreviewSrc(media: AnyMedia): string | null {
    if (media instanceof StorageImage) {
      return media.getSrc(200);
    } else if (media instanceof StorageVideo) {
      return media.getPreviewImageSrc();
    } else {
      return media.src;
    }
  }

  constructor() {
    this.reportForm = this._fb.group({
      reason: ["", Validators.required],
      comment: [""],
      reporterEmail: [""],
    });
  }

  ngAfterViewInit() {
    // Check if user is authenticated
    firstValueFrom(this._authService.authState$).then((user) => {
      this.isAuthenticated.set(!!user?.uid);
      // Update email field validators based on auth status
      const emailControl = this.reportForm.get("reporterEmail");
      if (!user?.uid) {
        // Unauthenticated: email is required and must be valid
        emailControl?.setValidators([
          Validators.required,
          Validators.pattern(
            /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/
          ),
        ]);
      } else {
        // Authenticated: email not required
        emailControl?.clearValidators();
      }
      emailControl?.updateValueAndValidity();
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

  onNoClick(): void {
    this.dialogRef.close();
  }

  submitReport(): void {
    if (!this.reportForm.valid) {
      return;
    }

    const { reason, comment, reporterEmail } = this.reportForm.value;
    this.isSubmitting.set(true);

    this._mediaReportsService
      .submitMediaReport(
        this.dialogData.media,
        reason,
        comment,
        !this.isAuthenticated() ? reporterEmail : undefined,
        this.locale,
        this.dialogData.spotId
      )
      .then(() => {
        console.log("Media report submitted successfully");
        this.dialogRef.close(true);
      })
      .catch((error: unknown) => {
        console.error("Error submitting media report:", error);
        this.isSubmitting.set(false);
      });
  }
}
