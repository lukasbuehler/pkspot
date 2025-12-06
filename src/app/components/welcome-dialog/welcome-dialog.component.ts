import { Component, Inject, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogModule,
} from "@angular/material/dialog";
import { RouterLink } from "@angular/router";
import { AnalyticsService } from "../../services/analytics.service";
import { ConsentService } from "../../services/consent.service";

@Component({
  selector: "app-welcome-dialog",
  imports: [MatDialogModule, MatButtonModule, RouterLink],
  templateUrl: "./welcome-dialog.component.html",
  styleUrl: "./welcome-dialog.component.scss",
})
export class WelcomeDialogComponent {
  private _analyticsService = inject(AnalyticsService);
  private _consentService = inject(ConsentService);

  constructor(
    public dialogRef: MatDialogRef<WelcomeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { version: string }
  ) {}

  onNoClick(): void {
    this.dialogRef.close(false); // Return false to indicate user declined
  }

  agreeAndContinue() {
    // store the accepted version of the terms of service in browser local storage
    localStorage.setItem("acceptedVersion", this.data.version);

    // Grant consent through the consent service
    this._consentService.grantConsent();

    this.dialogRef.close(true); // Return true to indicate user agreed
    this._analyticsService.trackEvent("Visitor Agreed to Terms");
  }
}
