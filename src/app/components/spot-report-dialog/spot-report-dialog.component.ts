import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
} from "@angular/material/dialog";
import {
  SpotReportSchema,
  SpotReportReason,
} from "../../../db/schemas/SpotReportSchema";
import { MatRadioModule } from "@angular/material/radio";
import { FormsModule } from "@angular/forms";
import { SpotReportsService } from "../../services/firebase/firestore/spot-reports.service.js";
import { AnalyticsService } from "../../services/analytics.service";
import {
  EntityReferenceAutocompleteComponent,
  EntityReferenceOption,
} from "../entity-reference-autocomplete/entity-reference-autocomplete.component";
@Component({
  selector: "app-spot-report-dialog",
  imports: [
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatRadioModule,
    FormsModule,
    EntityReferenceAutocompleteComponent,
  ],
  templateUrl: "./spot-report-dialog.component.html",
  styleUrl: "./spot-report-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotReportDialogComponent {
  readonly data = inject<SpotReportSchema>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<SpotReportDialogComponent>);
  private readonly _spotReportsService = inject(SpotReportsService);
  private readonly _analytics = inject(AnalyticsService);
  readonly isSubmitting = signal(false);
  readonly duplicateSpotId = signal(this.data.duplicateOf?.id ?? "");
  readonly excludedSpotIds = [this.data.spot.id];

  onNoClick(): void {
    this.dialogRef.close();
  }

  onReasonChange(reason: SpotReportReason | string): void {
    this.data.reason = reason;
    if (reason !== SpotReportReason.Duplicate) {
      this.duplicateSpotId.set("");
      delete this.data.duplicateOf;
    }
  }

  onDuplicateSpotSelection(selection: EntityReferenceOption | null): void {
    const spot = selection?.spotPreview;
    this.duplicateSpotId.set(spot ? selection.id : "");
    if (!selection || !spot) {
      delete this.data.duplicateOf;
      return;
    }

    this.data.duplicateOf = {
      id: spot.id,
      name: selection.label,
    };
  }

  canSubmit(): boolean {
    return Boolean(this.data.reason) &&
      (this.data.reason !== SpotReportReason.Duplicate ||
        Boolean(this.data.duplicateOf?.id));
  }

  async submitReport(): Promise<void> {
    if (!this.canSubmit() || this.isSubmitting()) {
      return;
    }

    this._analytics.trackEvent("spot_report_submit_clicked", {
      spot_id: this.data.spot.id,
      reason: this.data.reason,
    });
    this.isSubmitting.set(true);
    try {
      const reportId = await this._spotReportsService.addSpotReport(this.data);
      this.dialogRef.close({ report: this.data, reportId });
    } catch (error) {
      this._analytics.trackEvent("spot_report_submit_failed", {
        spot_id: this.data.spot.id,
        reason: this.data.reason,
      });
      throw error;
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
