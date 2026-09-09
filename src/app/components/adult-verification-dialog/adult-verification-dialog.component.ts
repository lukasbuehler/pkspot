import {ChangeDetectionStrategy, Component, computed, inject, signal} from "@angular/core";
import {MatButtonModule} from "@angular/material/button";
import {MAT_DIALOG_DATA, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle} from "@angular/material/dialog";
import {MatIcon} from "@angular/material/icon";
import {MatProgressSpinner} from "@angular/material/progress-spinner";
import {Browser} from "@capacitor/browser";
import {Capacitor} from "@capacitor/core";
import {AgeAssuranceService} from "../../services/age-assurance.service";
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
  private readonly ageAssurance = inject(AgeAssuranceService);
  private readonly platform = inject(PlatformService);
  private readonly dialogRef = inject(MatDialogRef<AdultVerificationDialogComponent>);
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

  constructor() {
    void this.loadOneIdAvailability();
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
      if (Capacitor.isNativePlatform()) {
        await Browser.open({url: attempt.verification_url});
      } else if (typeof window !== "undefined") {
        window.location.assign(attempt.verification_url);
      }
      this.dialogRef.close();
    } catch {
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
    } catch {
      this._oneIdState.set("unavailable");
    }
  }
}
