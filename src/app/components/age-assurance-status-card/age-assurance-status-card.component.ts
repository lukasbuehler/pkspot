import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { PlatformService } from "../../services/platform.service";
import { AgeAssuranceInfoDialogComponent } from "../age-assurance-info-dialog/age-assurance-info-dialog.component";

@Component({
  selector: "app-age-assurance-status-card",
  imports: [MatButtonModule, MatIcon, MatProgressSpinner],
  templateUrl: "./age-assurance-status-card.component.html",
  styleUrl: "./age-assurance-status-card.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgeAssuranceStatusCardComponent {
  readonly ageAssurance = inject(AgeAssuranceService);
  private readonly _platform = inject(PlatformService);
  private readonly _dialog = inject(MatDialog);
  private readonly _storeOpenFailed = signal(false);

  readonly isAndroidApp =
    this._platform.isNative() && this._platform.getPlatform() === "android";
  readonly isChecking = computed(
    () => this.ageAssurance.checkState().status === "checking",
  );
  readonly showPlayStoreAction = computed(() => {
    if (!this.isAndroidApp) return false;
    const status = this.ageAssurance.checkState().status;
    return (
      status === "idle" ||
      status === "not_shared" ||
      status === "verification_required" ||
      status === "unavailable" ||
      status === "error"
    );
  });
  readonly statusText = computed(() => {
    const state = this.ageAssurance.checkState();
    const status = state.status;
    const isGooglePlay =
      state.platform === "android" ||
      (state.platform === undefined && this.isAndroidApp);
    switch (status) {
      case "checking":
        return isGooglePlay
          ? $localize`Checking the age signal with Google Play…`
          : $localize`Checking the mobile platform age signal…`;
      case "verified":
        return $localize`Google Play supplied an independently checked 18+ result. Adult eligibility is active.`;
      case "self_declared":
        return $localize`Google Play shared an 18+ range based on an age entered on the Google Account. Because it was not independently checked, it cannot unlock a public profile.`;
      case "guardian_managed":
        return $localize`Google Play reports a guardian-managed age range. A parent can manage age sharing in Family Link.`;
      case "not_verified":
        return isGooglePlay
          ? $localize`Google Play shared an age result, but it does not establish independently checked 18+ eligibility.`
          : $localize`The mobile platform shared an age result, but it does not establish independently checked 18+ eligibility.`;
      case "not_shared":
        return $localize`Google Play is not sharing an age range with PK Spot. Enable “Share age range” for PK Spot in Google Play, then check again.`;
      case "verification_required":
        return $localize`Google Play requires you to confirm your age or set up supervision. Open Google Play, complete its instructions, then check again.`;
      case "unavailable":
        return isGooglePlay
          ? $localize`The age signal is currently unavailable. Make sure PK Spot was installed from Google Play and that the Play Store is up to date, then try again.`
          : $localize`The mobile platform age signal is currently unavailable. Please try again later.`;
      case "error":
        return isGooglePlay
          ? $localize`PK Spot could not securely check the Google Play age signal. Please try again.`
          : $localize`PK Spot could not securely check the mobile platform age signal. Please try again.`;
      case "idle":
        if (this.ageAssurance.hasVerifiedAdultEligibility()) {
          return $localize`Independently checked 18+ eligibility is available.`;
        }
        switch (this.ageAssurance.adultEvidenceStrength()) {
          case "self_declared":
            return $localize`A self-declared age range is stored, but it does not unlock a public profile.`;
          case "guardian_managed":
            return $localize`The platform reports a guardian-managed age range.`;
          case "independently_checked":
          case "verified_identity":
            return $localize`The available evidence does not currently establish 18+ eligibility.`;
          case "unknown":
            return $localize`No independently checked 18+ result is stored.`;
        }
    }
  });
  readonly playStoreInstructions = computed(() => {
    if (this.ageAssurance.checkState().status === "verification_required") {
      return $localize`Google controls the verification flow. Visit the Play Store and complete any age-confirmation prompt it shows.`;
    }
    return $localize`On PK Spot’s Play Store page, open the three-dot menu and enable “Share age range”. You can also use Play Store profile → Settings → Family → Age range sharing.`;
  });

  async recheck(): Promise<void> {
    this._storeOpenFailed.set(false);
    await this.ageAssurance.recheckNativeAgePolicyForCurrentUser();
  }

  async openPlayStore(): Promise<void> {
    this._storeOpenFailed.set(false);
    try {
      await this.ageAssurance.openPlayStoreListing();
    } catch (error) {
      console.warn("Could not open PK Spot in Google Play", error);
      this._storeOpenFailed.set(true);
    }
  }

  openInfo(): void {
    this._dialog.open(AgeAssuranceInfoDialogComponent, {
      width: "min(680px, calc(100vw - 32px))",
      maxWidth: "100vw",
      maxHeight: "calc(100vh - 32px)",
      autoFocus: false,
    });
  }

  readonly storeOpenFailed = this._storeOpenFailed.asReadonly();
}
