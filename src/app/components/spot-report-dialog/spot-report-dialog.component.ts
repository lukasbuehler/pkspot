import { inject as injectFeatureTelemetry } from "@angular/core";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { FormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import type { SpotReportReason } from "../../../db/schemas/SpotReportSchema";
import type { OwnReportSummary } from "../../../db/schemas/ReportLifecycleSchema";
import { SpotReportsService } from "../../services/firebase/firestore/spot-reports.service";
import { AnalyticsService } from "../../services/analytics.service";
import {
  EntityReferenceAutocompleteComponent,
  EntityReferenceOption,
} from "../entity-reference-autocomplete/entity-reference-autocomplete.component";

export interface SpotReportDialogData {
  spotId: string;
  spotName: string;
  report?: OwnReportSummary | null;
}

export interface SpotReportDialogResult {
  reportId?: string;
  created?: boolean;
  withdrawn?: boolean;
}

@Component({
  selector: "app-spot-report-dialog",
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    EntityReferenceAutocompleteComponent,
  ],
  templateUrl: "./spot-report-dialog.component.html",
  styleUrl: "./spot-report-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotReportDialogComponent {
  private readonly featureTelemetry = injectFeatureTelemetry(FeatureTelemetryService);

  readonly data = inject<SpotReportDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<SpotReportDialogComponent>);
  private readonly _spotReportsService = inject(SpotReportsService);
  private readonly _analytics = inject(AnalyticsService);
  readonly isSubmitting = signal(false);
  readonly submissionError = signal(false);
  readonly selectedReasons = signal<string[]>(this.data.report?.reasons ?? []);
  readonly comment = signal(this.data.report?.comment ?? "");
  readonly duplicateSpotId = signal(this.data.report?.duplicateOf?.id ?? "");
  readonly duplicateSpotName = signal(this.data.report?.duplicateOf?.name ?? "");
  readonly excludedSpotIds = [this.data.spotId];
  readonly reasons = [
    {value: "duplicate", label: $localize`Duplicate`},
    {value: "torn down", label: $localize`Torn down`},
    {value: "does not exist", label: $localize`Does not exist`},
    {value: "private", label: $localize`Private Spot`},
    {value: "other", label: $localize`Other`},
  ] as const;

  get isEditing(): boolean {
    return Boolean(this.data.report?.id);
  }

  onNoClick(): void {
    if (!this.isSubmitting()) this.dialogRef.close();
  }

  isReasonSelected(reason: string): boolean {
    return this.selectedReasons().includes(reason);
  }

  toggleReason(reason: string, selected: boolean): void {
    this.selectedReasons.update((reasons) => {
      const next = selected
        ? [...new Set([...reasons, reason])]
        : reasons.filter((value) => value !== reason);
      if (!next.includes("duplicate")) {
        this.duplicateSpotId.set("");
        this.duplicateSpotName.set("");
      }
      return next;
    });
  }

  onDuplicateSpotSelection(selection: EntityReferenceOption | null): void {
    const spot = selection?.spotPreview;
    this.duplicateSpotId.set(spot ? spot.id : "");
    this.duplicateSpotName.set(spot ? selection.label : "");
  }

  canSubmit(): boolean {
    const reasons = this.selectedReasons();
    return reasons.length > 0 &&
      (!reasons.includes("duplicate") || Boolean(this.duplicateSpotId())) &&
      (!reasons.includes("other") || Boolean(this.comment().trim()));
  }

  async submitReport(): Promise<void> {
    if (!this.canSubmit() || this.isSubmitting()) return;
    this._analytics.trackEvent("spot_report_submit_clicked", {
      spot_id: this.data.spotId,
      reasons: this.selectedReasons(),
      editing: this.isEditing,
    });
    this.submissionError.set(false);
    this.isSubmitting.set(true);
    this.dialogRef.disableClose = true;
    try {
      const result = await this._spotReportsService.submitSpotReport({
        spotId: this.data.spotId,
        reasons: this.selectedReasons() as SpotReportReason[],
        comment: this.comment().trim(),
        ...(this.selectedReasons().includes("duplicate") ? {
          duplicateOf: {
            id: this.duplicateSpotId(),
            ...(this.duplicateSpotName() ? {name: this.duplicateSpotName()} : {}),
          },
        } : {}),
      });
      this.dialogRef.close({reportId: result.reportId, created: result.created});
    } catch (error) {
      this.featureTelemetry.failure("spot-report-dialog", "submitReport", error);
      this._analytics.trackEvent("spot_report_submit_failed", {
        spot_id: this.data.spotId,
        reasons: this.selectedReasons(),
      });
      console.error("Could not submit Spot report", error);
      this.submissionError.set(true);
    } finally {
      this.isSubmitting.set(false);
      this.dialogRef.disableClose = false;
    }
  }

  async withdrawReport(): Promise<void> {
    const reportId = this.data.report?.id;
    if (!reportId || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.dialogRef.disableClose = true;
    this.submissionError.set(false);
    try {
      await this._spotReportsService.withdrawOwnSpotReport(this.data.spotId, reportId);
      this.dialogRef.close({withdrawn: true});
    } catch (error) {
      this.featureTelemetry.failure("spot-report-dialog", "withdrawReport", error);
      console.error("Could not withdraw Spot report", error);
      this.submissionError.set(true);
    } finally {
      this.isSubmitting.set(false);
      this.dialogRef.disableClose = false;
    }
  }
}
