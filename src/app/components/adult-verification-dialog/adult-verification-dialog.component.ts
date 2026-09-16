import { inject as injectFeatureTelemetry } from "@angular/core";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import {ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal} from "@angular/core";
import {MatButtonModule} from "@angular/material/button";
import {MAT_DIALOG_DATA, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle} from "@angular/material/dialog";
import {MatIcon} from "@angular/material/icon";
import {MatProgressSpinner} from "@angular/material/progress-spinner";
import {Capacitor} from "@capacitor/core";
import {AgeAssuranceService, ExternalVerificationStatus} from "../../services/age-assurance.service";
import {PlatformService} from "../../services/platform.service";

type ProviderId = "google_play" | "apple" | "oneid";
type ProviderState = "available" | "unavailable" | "starting" | "error";

interface ProviderOption {
  id: ProviderId;
  title: string;
  description: string;
  recommended: boolean;
  state: ProviderState;
}

@Component({
  selector: "app-adult-verification-dialog",
  imports: [MatButtonModule, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatIcon, MatProgressSpinner],
  templateUrl: "./adult-verification-dialog.component.html",
  styleUrl: "./adult-verification-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdultVerificationDialogComponent {
  private readonly featureTelemetry = injectFeatureTelemetry(FeatureTelemetryService);

  private readonly ageAssurance = inject(AgeAssuranceService);
  private readonly platform = inject(PlatformService);
  private readonly dialogRef = inject(MatDialogRef<AdultVerificationDialogComponent>);
  private readonly destroyRef = inject(DestroyRef);
  private pollTimer?: ReturnType<typeof setTimeout>;
  private pollUntil = 0;
  private destroyed = false;
  readonly checking = signal(false);
  readonly externalStatus = signal<ExternalVerificationStatus>("idle");
  private readonly _oneIdState = signal<ProviderState>("unavailable");
  private readonly _activeProvider = signal<ProviderId | null>(null);
  private readonly _error = signal<string | null>(null);

  readonly options = computed<ProviderOption[]>(() => {
    const platform = this.platform.getPlatform();
    return [
      {
        id: "google_play",
        title: $localize`Google Play`,
        description: $localize`Use Google Play’s age signal on a supported Android installation.`,
        recommended: true,
        state: this.platform.isNative() && platform === "android" ? "available" : "unavailable",
      },
      {
        id: "apple",
        title: $localize`Apple age range`,
        description: $localize`Ask Apple to share an 18+ range on a supported iPhone or iPad installation.`,
        recommended: true,
        state: this.platform.isNative() && platform === "ios" ? "available" : "unavailable",
      },
      {
        id: "oneid",
        title: $localize`OneID`,
        description: $localize`Use OneID’s privacy-preserving 18+ check when it is available for your account.`,
        recommended: false,
        state: this._oneIdState(),
      },
    ];
  });
  readonly activeProvider = this._activeProvider.asReadonly();
  readonly error = this._error.asReadonly();

  readonly statusMessage = computed(() => {
    switch (this.externalStatus()) {
      case "sandbox_verified":
      case "sandbox_not_verified": return $localize`Sandbox test completed. Your real age eligibility has not changed.`;
      case "pending": return $localize`Complete the check with OneID, then check the result here. You can close this window and return later.`;
      case "processing": return $localize`Your verification is being processed. Please wait a moment.`;
      case "verified": return $localize`OneID confirmed your 18+ result. Your account’s existing participation rules still apply.`;
      case "not_verified": return $localize`OneID could not confirm that you are 18 or older. You can try another available method.`;
      case "cancelled": return $localize`Verification was cancelled. You can start again whenever you are ready.`;
      case "expired": return $localize`This verification expired. Please start a new check.`;
      case "failed": return $localize`Verification could not be completed. Please start a new check.`;
      default: return "";
    }
  });

  constructor() {
    void this.loadOneIdAvailability();
    void this.refreshStatus();
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.pollTimer) clearTimeout(this.pollTimer);
    });
  }

  retry(): void {
    void this.loadOneIdAvailability();
    void this.refreshStatus();
  }

  async refreshStatus(): Promise<void> {
    if (this.checking() || this.destroyed) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.checking.set(true);
    try {
      this.externalStatus.set(await this.ageAssurance.externalVerificationStatus());
      this._error.set(null);
      if (!this.destroyed && ["pending", "processing"].includes(this.externalStatus()) && Date.now() < this.pollUntil) {
        this.pollTimer = setTimeout(() => void this.refreshStatus(), 5000);
      }
    } catch (error) {
      this.featureTelemetry.failure("adult-verification-dialog", "status", error);
      this._error.set($localize`The result could not be checked. Reconnect and check again; your verification may already have completed.`);
    } finally { this.checking.set(false); }
  }

  async start(provider: ProviderId): Promise<void> {
    if (this.activeProvider() !== null ||
      (provider === "oneid" && this.options().find((option) => option.id === provider)?.state === "unavailable")) return;
    this._activeProvider.set(provider);
    this._error.set(null);
    try {
      if (provider === "google_play" || provider === "apple") {
        await this.ageAssurance.recheckNativeAgePolicyForCurrentUser();
        this.dialogRef.close();
        return;
      }
      this._oneIdState.set("starting");
      const attempt = await this.ageAssurance.beginOneIdAgeVerification();
      this.externalStatus.set("pending");
      if (Capacitor.isNativePlatform()) {
        await this.ageAssurance.openOneIdBrowser(attempt.verification_url);
        this.pollUntil = Date.now() + 90_000;
        void this.refreshStatus();
      } else if (typeof window !== "undefined") {
        window.location.assign(attempt.verification_url);
      }
    } catch (caughtFailure) {
      this.featureTelemetry.failure("adult-verification-dialog", "start", caughtFailure);
      this._error.set($localize`Verification could not be started. You can try another method or try again later.`);
      if (provider === "oneid") this._oneIdState.set("error");
    } finally {
      this._activeProvider.set(null);
    }
  }

  private async loadOneIdAvailability(): Promise<void> {
    try {
      const availability = await this.ageAssurance.externalVerificationAvailability();
      this._oneIdState.set(availability.providers.find((provider) => provider.provider === "oneid")?.available ? "available" : "unavailable");
    } catch (error) {
      this.featureTelemetry.failure("adult-verification-dialog", "availability", error);
      this._oneIdState.set("unavailable");
    }
  }
}
