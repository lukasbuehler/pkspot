import { Component, inject, signal } from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatRadioModule } from "@angular/material/radio";
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import {
  UserReportReason,
  UserReportSchema,
} from "../../../db/schemas/UserReportSchema";
import { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import { UserReportsService } from "../../services/firebase/firestore/user-reports.service";

export interface ProfileReportDialogData {
  reportedUser: UserReferenceSchema;
  displayName: string;
  sourcePath?: string;
}

export interface ProfileReportDialogResult {
  reported: true;
  blockUser: boolean;
}

@Component({
  selector: "app-profile-report-dialog",
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title i18n>Report profile</h2>
    <mat-dialog-content>
      <p class="mat-body-medium">
        <ng-container i18n>Tell us what is wrong with</ng-container>
        <strong> {{ data.displayName }}</strong>.
      </p>

      <form [formGroup]="reportForm" class="profile-report-form">
        <mat-radio-group formControlName="reason" class="profile-report-reasons">
          @for (reason of reasons; track reason.value) {
          <mat-radio-button [value]="reason.value">
            {{ reason.label }}
          </mat-radio-button>
          }
        </mat-radio-group>

        <mat-form-field appearance="outline">
          <mat-label i18n>Details</mat-label>
          <textarea
            matInput
            rows="4"
            formControlName="comment"
            maxlength="2000"
          ></textarea>
        </mat-form-field>

        <mat-checkbox formControlName="blockUser" i18n>
          Also block this user after reporting
        </mat-checkbox>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close()" i18n>Cancel</button>
      <button
        mat-flat-button
        color="warn"
        type="button"
        [disabled]="reportForm.invalid || isSubmitting()"
        (click)="submit()"
        i18n
      >
        Report
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .profile-report-form,
      .profile-report-reasons {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .profile-report-form {
        margin-top: 1rem;
      }
    `,
  ],
})
export class ProfileReportDialogComponent {
  private _dialogRef =
    inject<MatDialogRef<ProfileReportDialogComponent>>(MatDialogRef);
  private _fb = inject(FormBuilder);
  private _userReportsService = inject(UserReportsService);

  readonly data = inject<ProfileReportDialogData>(MAT_DIALOG_DATA);
  readonly isSubmitting = signal(false);

  readonly reasons: { value: UserReportReason; label: string }[] = [
    { value: "harassment", label: $localize`Harassment or abuse` },
    { value: "impersonation", label: $localize`Impersonation` },
    {
      value: "unsafe_profile",
      label: $localize`Personal or unsafe profile information`,
    },
    {
      value: "spam_or_malicious_links",
      label: $localize`Spam or malicious links`,
    },
    { value: "other", label: $localize`Something else` },
  ];

  reportForm = this._fb.group({
    reason: this._fb.nonNullable.control<UserReportReason | "">("", [
      Validators.required,
    ]),
    comment: this._fb.nonNullable.control("", [Validators.maxLength(2000)]),
    blockUser: this._fb.nonNullable.control(false),
  });

  close(): void {
    this._dialogRef.close();
  }

  submit(): void {
    if (this.reportForm.invalid || this.isSubmitting()) {
      return;
    }

    const formValue = this.reportForm.getRawValue();
    const reason = formValue.reason;
    if (!this._isReportReason(reason)) {
      return;
    }

    this.isSubmitting.set(true);
    this._userReportsService
      .submitUserReport(
        this.data.reportedUser,
        reason,
        formValue.comment,
        this.data.sourcePath
      )
      .then(() => {
        this._dialogRef.close({
          reported: true,
          blockUser: formValue.blockUser,
        } satisfies ProfileReportDialogResult);
      })
      .catch((error) => {
        console.error("Failed to submit profile report", error);
        this.isSubmitting.set(false);
      });
  }

  private _isReportReason(value: string): value is UserReportSchema["reason"] {
    return this.reasons.some((reason) => reason.value === value);
  }
}
