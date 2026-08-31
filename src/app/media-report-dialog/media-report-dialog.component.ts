import {
  AfterViewInit,
  computed,
  Component,
  inject,
  LOCALE_ID,
  signal,
  ChangeDetectionStrategy,
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
import { MatCheckboxModule } from "@angular/material/checkbox";
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
import {
  areGuestMediaReportReasons,
  isMediaReportReason,
} from "../../db/schemas/MediaReportPolicy";
import type { MediaReportReason } from "../../db/schemas/MediaReportPolicy";
import type { OwnReportSummary } from "../../db/schemas/ReportLifecycleSchema";

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
    MatCheckboxModule,
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
  selectedReasons = signal<MediaReportReason[]>([]);
  submissionError = signal(false);
  ownReport = signal<OwnReportSummary | null>(null);
  canSubmitReason = computed(
    () =>
      this.selectedReasons().length > 0 &&
      (this.isAuthenticated() || areGuestMediaReportReasons(this.selectedReasons())),
  );

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
      comment: [""],
      duplicateMediaUrl: ["", Validators.maxLength(2_048)],
      reporterEmail: ["", [Validators.email, Validators.maxLength(240)]],
    });
    this._authService.authState$
      .pipe(takeUntilDestroyed())
      .subscribe((user) => {
        this.isAuthenticated.set(!!user?.uid);
        if (user?.uid) void this.loadOwnReport();
      });
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
    if (!this.isSubmitting()) this.dialogRef.close();
  }

  isReasonSelected(reason: MediaReportReason): boolean {
    return this.selectedReasons().includes(reason);
  }

  toggleReason(reason: MediaReportReason, selected: boolean): void {
    this.selectedReasons.update((reasons) => selected
      ? [...new Set([...reasons, reason])]
      : reasons.filter((value) => value !== reason),
    );
    if (reason === "duplicate" && !selected) {
      this.reportForm.controls["duplicateMediaUrl"].setValue("");
    }
  }

  get reportContext(): "spot" | "event" | "media" | undefined {
    return this.dialogData.spotId ? "spot" : this.dialogData.context;
  }

  get reportTargetId(): string | undefined {
    return this.dialogData.targetId ?? this.dialogData.spotId;
  }

  private async loadOwnReport(): Promise<void> {
    try {
      const report = await this._mediaReportsService.getOwnMediaReport(
        this.dialogData.media,
        this.reportContext,
        this.reportTargetId,
      );
      this.ownReport.set(report);
      if (!report) return;
      this.selectedReasons.set(
        report.reasons.filter(isMediaReportReason),
      );
      this.reportForm.controls["comment"].setValue(report.comment);
      this.reportForm.controls["duplicateMediaUrl"].setValue(report.duplicateMedia?.src ?? "");
    } catch (error) {
      console.warn("Could not load existing media report", error);
    }
  }

  submitReport(): void {
    const reasons = this.selectedReasons();
    const comment = String(this.reportForm.controls["comment"].value ?? "").trim();
    if (
      !this.canSubmitReason() || !this.reportForm.valid ||
      (reasons.includes("other") && !comment) ||
      (reasons.includes("duplicate") && !this.duplicateMediaUrl())
    ) {
      return;
    }

    const { reporterEmail } = this.reportForm.value;
    this.isSubmitting.set(true);
    this.submissionError.set(false);
    this.dialogRef.disableClose = true;

    this._mediaReportsService
      .submitMediaReport(
        this.dialogData.media,
        reasons,
        comment,
        !this.isAuthenticated() ? reporterEmail || undefined : undefined,
        this.locale,
        this.dialogData.spotId,
        this.reportContext,
        this.reportTargetId,
        this.duplicateMediaUrl(),
      )
      .then((result) => {
        console.log("Media report submitted successfully");
        if (this.isAuthenticated() && result.created) {
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
        this.submissionError.set(true);
      })
      .finally(() => {
        this.isSubmitting.set(false);
        this.dialogRef.disableClose = false;
      });
  }

  duplicateMediaUrl(): string {
    return String(this.reportForm.controls["duplicateMediaUrl"].value ?? "").trim();
  }

  async withdrawReport(): Promise<void> {
    const reportId = this.ownReport()?.id;
    if (!reportId || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.dialogRef.disableClose = true;
    this.submissionError.set(false);
    try {
      await this._mediaReportsService.withdrawOwnMediaReport(reportId);
      this.dialogRef.close(true);
    } catch (error) {
      console.error("Could not withdraw media report", error);
      this.submissionError.set(true);
    } finally {
      this.isSubmitting.set(false);
      this.dialogRef.disableClose = false;
    }
  }
}
