import {
  AfterViewInit,
  Component,
  inject,
  LOCALE_ID,
  signal,
  ChangeDetectionStrategy
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
  ExternalVideo,
  StorageImage,
  AnyMedia,
  StorageVideo,
} from "../../db/models/Media";
import { UserReferenceSchema } from "../../db/schemas/UserSchema";
import { UsersService } from "../services/firebase/firestore/users.service";
import { MediaReportsService } from "../services/firebase/firestore/media-reports.service";
import { AuthenticationService } from "../services/firebase/authentication.service";
import { take } from "rxjs";
import { NotificationOptInService } from "../services/notification-opt-in.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

interface MediaReportDialogData {
  media: AnyMedia;
  spotId?: string;
  context?: "spot" | "event" | "media";
  targetId?: string;
}

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./media-report-dialog.component.scss",
})
export class MediaReportDialogComponent implements AfterViewInit {
  public dialogRef =
    inject<MatDialogRef<MediaReportDialogComponent>>(MatDialogRef);
  public locale = inject<LocaleCode>(LOCALE_ID);
  private _usersService = inject(UsersService);
  private _mediaReportsService = inject(MediaReportsService);
  private _authService = inject(AuthenticationService);
  private _notificationOptIn = inject(NotificationOptInService);
  private _fb = inject(FormBuilder);

  userReference = signal<UserReferenceSchema | null | undefined>(null);
  isSubmitting = signal(false);
  isAuthenticated = signal(false);

  reportForm: FormGroup;
  public dialogData = inject<MediaReportDialogData>(MAT_DIALOG_DATA);
  readonly contextLabel =
    this.dialogData.context === "event" ? "event" : "spot";

  getPreviewSrc(media: AnyMedia): string | null {
    if (media instanceof StorageImage) {
      return media.getSrc(200);
    } else if (media instanceof StorageVideo) {
      return media.getPreviewImageSrc();
    } else if (media instanceof ExternalImage) {
      return media.src;
    }
    return null;
  }

  getVideoPreviewSrc(media: AnyMedia): string | null {
    return media instanceof ExternalVideo ? media.src : null;
  }

  constructor() {
    this.reportForm = this._fb.group({
      reason: ["", Validators.required],
      comment: [""],
    });
    this._authService.authState$
      .pipe(takeUntilDestroyed())
      .subscribe((user) => this.isAuthenticated.set(!!user?.uid));
  }

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

  onNoClick(): void {
    this.dialogRef.close();
  }

  submitReport(): void {
    if (!this.isAuthenticated() || !this.reportForm.valid) {
      return;
    }

    const { reason, comment } = this.reportForm.value;
    this.isSubmitting.set(true);

    this._mediaReportsService
      .submitMediaReport(
        this.dialogData.media,
        reason,
        comment,
        this.locale,
        this.dialogData.spotId,
        this.dialogData.spotId ? "spot" : this.dialogData.context,
        this.dialogData.targetId ?? this.dialogData.spotId
      )
      .then(() => {
        console.log("Media report submitted successfully");
        if (this.isAuthenticated()) {
          this.dialogRef
            .afterClosed()
            .pipe(take(1))
            .subscribe(() => {
              void this._notificationOptIn.maybePrompt("report_updates");
            });
        }
        this.dialogRef.close(true);
      })
      .catch((error: unknown) => {
        console.error("Error submitting media report:", error);
        this.isSubmitting.set(false);
      });
  }
}
