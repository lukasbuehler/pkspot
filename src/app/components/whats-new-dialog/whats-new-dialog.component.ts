import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { APP_LINKS } from "../../shared/app-links";
import { AnalyticsService } from "../../services/analytics.service";
import { ConsentService } from "../../services/consent.service";
import { PlatformService } from "../../services/platform.service";
import { WHATS_NEW_RELEASE, WHATS_NEW_STORAGE_KEY } from "../../services/whats-new";

export interface WhatsNewDialogData {
  /** Set when the user still has to agree to these terms; null for highlights only. */
  consentVersion: string | null;
}

/**
 * "Welcome back" for returning users: what is new in this release, the
 * updated privacy note and agreement when the terms changed, and a quiet
 * store-review invitation on iOS and Android.
 */
@Component({
  selector: "app-whats-new-dialog",
  imports: [MatDialogModule, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: "./whats-new-dialog.component.html",
  styleUrl: "./whats-new-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsNewDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<WhatsNewDialogComponent>);
  private readonly consent = inject(ConsentService);
  private readonly analytics = inject(AnalyticsService);
  readonly data = inject<WhatsNewDialogData>(MAT_DIALOG_DATA);

  readonly needsConsent = this.data.consentVersion !== null;
  private readonly platform = inject(PlatformService).getPlatform();
  /** Store reviews only make sense inside the installed app. */
  readonly review =
    this.platform === "ios"
      ? { url: `${APP_LINKS.appleAppStoreUrl}?action=write-review`, store: "apple" as const }
      : this.platform === "android"
        ? { url: APP_LINKS.googlePlayStoreUrl, store: "google" as const }
        : null;

  continue(): void {
    try {
      localStorage.setItem(WHATS_NEW_STORAGE_KEY, WHATS_NEW_RELEASE);
      if (this.data.consentVersion) localStorage.setItem("acceptedVersion", this.data.consentVersion);
    } catch {
      // Storage can be unavailable; the dialog then shows again next time.
    }
    if (this.data.consentVersion) {
      this.consent.grantConsent();
      this.analytics.trackEvent("Visitor Agreed to Terms", {
        version: this.data.consentVersion,
        method: "whats_new_dialog",
      });
    }
    this.analytics.trackEvent("Whats New Closed", { release: WHATS_NEW_RELEASE, consent: this.needsConsent });
    this.dialogRef.close(true);
  }

  /**
   * Feedback never counts as agreeing. Without pending terms it finishes the
   * screen; with pending terms the contact page (which needs no agreement)
   * closes the dialog and it returns after leaving that page.
   */
  sendFeedback(): void {
    if (!this.needsConsent) this.continue();
  }

  trackReview(): void {
    this.analytics.trackEvent("Whats New Review Clicked", { release: WHATS_NEW_RELEASE, store: this.review?.store });
  }
}
