import {
  ChangeDetectionStrategy,
  Component,
  Inject,
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
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import {
  SpotReportSchema,
  SpotReportReason,
} from "../../../db/schemas/SpotReportSchema";
import { MatRadioModule } from "@angular/material/radio";
import { FormsModule } from "@angular/forms";
import { SpotReportsService } from "../../services/firebase/firestore/spot-reports.service.js";
import { AnalyticsService } from "../../services/analytics.service";
@Component({
  selector: "app-spot-report-dialog",
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatRadioModule,
    FormsModule,
  ],
  templateUrl: "./spot-report-dialog.component.html",
  styleUrl: "./spot-report-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotReportDialogComponent {
  isSubmitting = signal(false);

  constructor(
    public dialogRef: MatDialogRef<SpotReportDialogComponent>,
    private _spotReportsService: SpotReportsService,
    private _analytics: AnalyticsService,
    @Inject(MAT_DIALOG_DATA) public data: SpotReportSchema
  ) {}

  onNoClick(): void {
    this.dialogRef.close();
  }

  async submitReport(): Promise<void> {
    if (!this.data.reason || this.isSubmitting()) {
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
