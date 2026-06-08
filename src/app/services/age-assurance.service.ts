import { Injectable, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PLATFORM_ID } from "@angular/core";
import {
  AgeParticipationState,
  UserAgePolicySchema,
} from "../../db/schemas/UserSchema";
import {
  PlatformAgeSignal,
  buildAgePolicyFromSignal,
  isAgeParticipationAllowed,
} from "./age-policy";
import { AuthenticationService } from "./firebase/authentication.service";
import { environment } from "../../environments/environment";

type AgeAssurancePlugin = {
  getAgeSignal(): Promise<PlatformAgeSignal>;
};

const NativeAgeAssurance = registerPlugin<AgeAssurancePlugin>("AgeAssurance");

@Injectable({
  providedIn: "root",
})
export class AgeAssuranceService {
  static readonly mockPolicyStateStorageKey = "pkspot.mockAgePolicyState.v1";

  private _functions = inject(Functions, { optional: true });
  private _authService = inject(AuthenticationService);
  private _platformId = inject(PLATFORM_ID);
  private _lastSyncedUid: string | null = null;
  private _syncInFlight = false;

  private _updateAgePolicyCallable = this._functions
    ? httpsCallable<
        { policy: UserAgePolicySchema; signal?: Record<string, unknown> },
        { ok: true }
      >(this._functions, "updateAgePolicy")
    : null;

  async syncNativeAgePolicyForCurrentUser(): Promise<void> {
    const uid = this._authService.user.uid;
    if (!uid || !Capacitor.isNativePlatform() || this._syncInFlight) {
      return;
    }

    if (this._lastSyncedUid === uid) {
      return;
    }

    this._syncInFlight = true;
    try {
      const signal = await NativeAgeAssurance.getAgeSignal();
      console.log("[AgeAssurance] Native age signal", signal);
      const policy = buildAgePolicyFromSignal(signal);
      if (!this._updateAgePolicyCallable) {
        console.warn("[AgeAssurance] Functions unavailable; policy not synced");
        return;
      }

      await this._updateAgePolicyCallable({
        policy,
        signal: this._sanitizeSignalForFunction(signal),
      });
      this._lastSyncedUid = uid;
    } catch (error) {
      console.warn("[AgeAssurance] Failed to sync native age policy", error);
    } finally {
      this._syncInFlight = false;
    }
  }

  canParticipatePublicly(): boolean {
    const mockState = this._getMockPolicyState();
    if (mockState) {
      return isAgeParticipationAllowed(mockState);
    }

    const state =
      this._authService.user.data?.data?.age_policy?.participation_state;
    return isAgeParticipationAllowed(state);
  }

  getRestrictionMessage(): string {
    return $localize`Public contributions are unavailable for this account right now. You can still browse spots and manage private saved or visited spots.`;
  }

  getContributionStatusMessage(): string {
    return $localize`Public contributions are unavailable for this account right now. You can still browse spots and manage private saved or visited spots. Depending on the app store age-safety signal, parent or guardian consent may be needed before public contributions are available.`;
  }

  private _sanitizeSignalForFunction(
    signal: PlatformAgeSignal
  ): Record<string, unknown> {
    return {
      platform: signal.platform,
      source: signal.source,
      available: signal.available,
      userStatus: signal.userStatus,
      ageLower: signal.ageLower,
      ageUpper: signal.ageUpper,
      isEligibleForAgeFeatures: signal.isEligibleForAgeFeatures,
      response: signal.response,
      requiredRegulatoryFeatures: signal.requiredRegulatoryFeatures,
      errorCode: signal.errorCode,
    };
  }

  private _getMockPolicyState(): AgeParticipationState | null {
    if (environment.production || !isPlatformBrowser(this._platformId)) {
      return null;
    }

    const raw = localStorage.getItem(
      AgeAssuranceService.mockPolicyStateStorageKey
    );
    if (!raw) {
      return null;
    }

    const allowedStates: AgeParticipationState[] = [
      "allowed",
      "read_only_age_restricted",
      "needs_age_signal",
      "needs_parental_consent",
      "age_signal_declined_required",
      "platform_signal_unavailable",
    ];
    return allowedStates.includes(raw as AgeParticipationState)
      ? (raw as AgeParticipationState)
      : null;
  }
}
