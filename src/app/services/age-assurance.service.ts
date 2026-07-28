import { Injectable, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PLATFORM_ID } from "@angular/core";
import {
  AgeParticipationState,
  AgeAssuranceConfidence,
  AgeEvidenceStrength,
  PkSpotAgeBand,
} from "../../db/schemas/UserSchema";
import {
  PlatformAgeSignal,
  isAgeParticipationAllowed,
} from "./age-policy";
import { AuthenticationService } from "./firebase/authentication.service";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { environment } from "../../environments/environment.default";

interface AgeAssurancePlugin {
  getAgeSignal(): Promise<PlatformAgeSignal>;
  getBoundAgeSignal(input: {
    uid: string;
    challengeId: string;
    challengeNonce: string;
  }): Promise<{
    signal: PlatformAgeSignal;
    integrityToken: string;
  }>;
}

interface UpdateAgePolicyV2Request {
  signal: Record<string, unknown>;
}

interface BeginAgeAssuranceResponse {
  challenge_id: string;
  challenge_nonce: string;
  platform: "android";
}

interface UpdateAgePolicyV3Request {
  challenge_id: string;
  challenge_nonce: string;
  integrity_token: string;
  signal: Record<string, unknown>;
}

interface UpdateAgePolicyResponse {
  ok: true;
  participation_state: AgeParticipationState;
  adult_eligibility: "verified" | "not_verified";
  evidence_strength?: AgeEvidenceStrength;
  age_band?: PkSpotAgeBand;
  confidence?: AgeAssuranceConfidence;
  evaluated_at?: string;
  verified_at?: string;
}

const NativeAgeAssurance = registerPlugin<AgeAssurancePlugin>("AgeAssurance");

@Injectable({
  providedIn: "root",
})
export class AgeAssuranceService {
  static readonly mockPolicyStateStorageKey = "pkspot.mockAgePolicyState.v1";

  private _functionsAdapter = inject(FunctionsAdapterService);
  private _authService = inject(AuthenticationService);
  private _platformId = inject(PLATFORM_ID);
  private _lastSyncedUid: string | null = null;
  private _syncInFlight = false;

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
      if (Capacitor.getPlatform() === "android") {
        await this._syncRequestBoundAndroidPolicy(uid);
      } else {
        const signal = await NativeAgeAssurance.getAgeSignal();
        await this._syncUnboundCompatibilityPolicy(signal);
      }
      this._lastSyncedUid = uid;
    } catch (error) {
      console.warn("[AgeAssurance] Failed to sync native age policy", error);
    } finally {
      this._syncInFlight = false;
    }
  }

  private async _syncRequestBoundAndroidPolicy(uid: string): Promise<void> {
    const challenge =
      await this._functionsAdapter.callAuthenticatedAppChecked<
        Record<string, never>,
        BeginAgeAssuranceResponse
      >("beginAgeAssuranceV3", {});
    const bound = await NativeAgeAssurance.getBoundAgeSignal({
      uid,
      challengeId: challenge.challenge_id,
      challengeNonce: challenge.challenge_nonce,
    });

    await this._functionsAdapter.callAuthenticatedAppChecked<
      UpdateAgePolicyV3Request,
      UpdateAgePolicyResponse
    >("updateAgePolicyV3", {
      challenge_id: challenge.challenge_id,
      challenge_nonce: challenge.challenge_nonce,
      integrity_token: bound.integrityToken,
      signal: this._sanitizeSignalForFunction(bound.signal),
    });
  }

  private async _syncUnboundCompatibilityPolicy(
    signal: PlatformAgeSignal,
  ): Promise<void> {
    await this._functionsAdapter.callAuthenticatedAppChecked<
      UpdateAgePolicyV2Request,
      UpdateAgePolicyResponse
    >("updateAgePolicyV2", {
      signal: this._sanitizeSignalForFunction(signal),
    });
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

  hasVerifiedAdultEligibility(): boolean {
    const policy = this._authService.user.data?.data?.age_policy;
    return (
      policy?.adult_eligibility === "verified" &&
      policy.assurance?.status === "active" &&
      policy.assurance?.client_integrity ===
        "play_integrity_request_bound"
    );
  }

  adultEvidenceStrength(): AgeEvidenceStrength {
    return (
      this._authService.user.data?.data?.age_policy?.assurance
        ?.evidence_strength ?? "unknown"
    );
  }

  getRestrictionMessage(): string {
    return $localize`Public contributions are unavailable for this account right now. You can still browse spots and manage private saved or visited spots.`;
  }

  getContributionStatusMessage(): string {
    return $localize`Public contributions are unavailable for this account right now. You can still browse spots and manage private saved or visited spots. Depending on the app store age-safety signal, parent or guardian consent may be needed before public contributions are available.`;
  }

  private _sanitizeSignalForFunction(
    signal: PlatformAgeSignal,
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
      ageSignalsStatus: signal.ageSignalsStatus,
      ageRangeSource: signal.ageRangeSource,
      ageRangeDeclaration: signal.ageRangeDeclaration,
      significantChangeStatus: signal.significantChangeStatus,
      requiredRegulatoryFeatures: signal.requiredRegulatoryFeatures,
      errorCode: signal.errorCode,
    };
  }

  private _getMockPolicyState(): AgeParticipationState | null {
    if (environment.production || !isPlatformBrowser(this._platformId)) {
      return null;
    }

    const raw = localStorage.getItem(
      AgeAssuranceService.mockPolicyStateStorageKey,
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
