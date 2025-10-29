import { Component, Inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
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
@Component({
  selector: "app-spot-report-dialog",
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatRadioModule,
    FormsModule,
  ],
  templateUrl: "./spot-report-dialog.component.html",
  styleUrl: "./spot-report-dialog.component.scss",
})
export class SpotReportDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<SpotReportDialogComponent>,
    private _spotReportsService: SpotReportsService,
    @Inject(MAT_DIALOG_DATA) public data: SpotReportSchema
  ) {}

  onNoClick(): void {
    this.dialogRef.close();
  }

  submitReport() {
    this._spotReportsService.addSpotReport(this.data);
  }
}
