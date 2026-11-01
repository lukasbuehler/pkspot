import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  inject,
  signal,
} from "@angular/core";
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
} from "@angular/material/dialog";
import { Router } from "@angular/router";
import { AnalyticsService } from "../../services/analytics.service";
import { ConsentService } from "../../services/consent.service";
import { recordWelcomeAcceptance } from "../../services/whats-new";
import { WelcomeContentComponent, type WelcomeLinkRequest } from "../welcome-content/welcome-content.component";

@Component({
  selector: "app-welcome-dialog-host",
  imports: [WelcomeContentComponent],
  templateUrl: "./welcome-dialog.component.html",
  styleUrl: "./welcome-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeDialogComponent {
  private _analyticsService = inject(AnalyticsService);
  private _consentService = inject(ConsentService);
  private readonly router = inject(Router);
  readonly continuing = signal(false);

  constructor(
    public dialogRef: MatDialogRef<WelcomeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { version: string }
  ) {}

  onNoClick(): void {
    this.dialogRef.close(false); // Return false to indicate user declined
  }

  agreeAndContinue(): void {
    if (this.continuing()) return;
    this.continuing.set(true);
    try {
      recordWelcomeAcceptance(localStorage, this.data.version);
    } catch (error) {
      this.continuing.set(false);
      throw error;
    }

    // Grant consent through the consent service
    this._consentService.grantConsent();

    this.dialogRef.close(true); // Return true to indicate user agreed

    // Track consent grant with version info
    this._analyticsService.trackEvent("Visitor Agreed to Terms", {
      version: this.data.version,
      method: "welcome_dialog",
    });
  }

  navigate({ event, path }: WelcomeLinkRequest): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void this.router.navigateByUrl(path);
  }
}
