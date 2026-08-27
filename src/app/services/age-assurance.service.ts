import { Injectable, inject, signal } from "@angular/core";
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
  openPlayStoreListing(): Promise<void>;
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

export type AgeAssuranceCheckStatus =
  | "idle"
  | "checking"
  | "verified"
  | "self_declared"
  | "guardian_managed"
  | "not_verified"
  | "not_shared"
  | "verification_required"
  | "unavailable"
  | "error";

export interface AgeAssuranceCheckState {
  status: AgeAssuranceCheckStatus;
  uid?: string;
  platform?: "android" | "ios";
  checkedAt?: string;
  errorCode?: number | string;
}

interface SyncedAgePolicy {
  signal: PlatformAgeSignal;
  response: UpdateAgePolicyResponse;
}

interface NativeSyncInFlight {
  uid: string;
  generation: number;
  promise: Promise<AgeAssuranceCheckState>;
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
  private _syncGeneration = 0;
  private _syncInFlight: NativeSyncInFlight | null = null;
  private readonly _checkState = signal<AgeAssuranceCheckState>({
    status: "idle",
  });

  readonly checkState = this._checkState.asReadonly();

  async syncNativeAgePolicyForCurrentUser(): Promise<AgeAssuranceCheckState> {
    return this._syncNativeAgePolicyForCurrentUser(false);
  }

  async recheckNativeAgePolicyForCurrentUser(): Promise<AgeAssuranceCheckState> {
    return this._syncNativeAgePolicyForCurrentUser(true);
  }

  async openPlayStoreListing(): Promise<void> {
    if (
      !Capacitor.isNativePlatform() ||
      Capacitor.getPlatform() !== "android"
    ) {
      return;
    }
    await NativeAgeAssurance.openPlayStoreListing();
  }

  private async _syncNativeAgePolicyForCurrentUser(
    force: boolean,
  ): Promise<AgeAssuranceCheckState> {
    const uid = this._authService.user.uid;
    if (!uid) {
      this._invalidateSyncInFlight();
      this._lastSyncedUid = null;
      if (this._checkState().uid !== undefined) {
        this._checkState.set({ status: "idle" });
      }
      return this._checkState();
    }
    if (!Capacitor.isNativePlatform()) {
      return this._checkState();
    }

    const platform = Capacitor.getPlatform();
    if (platform !== "android" && platform !== "ios") {
      return this._checkState();
    }

    if (this._checkState().uid !== uid) {
      this._invalidateSyncInFlight();
      this._lastSyncedUid = null;
      this._checkState.set({ status: "idle", uid, platform });
    }

    if (!force && this._lastSyncedUid === uid) {
      return this._checkState();
    }

    if (this._syncInFlight?.uid === uid) {
      return this._syncInFlight.promise;
    }

    // Apple's Declared Age Range API may present system UI. Never invoke it
    // from automatic startup synchronization; iOS requests must follow a
    // user-initiated explanation and confirmation in account settings.
    if (!force && platform === "ios") {
      return this._checkState();
    }

    this._checkState.set({ status: "checking", uid, platform });
    const generation = this._syncGeneration;
    const promise = this._performNativeSync(uid, platform);
    this._syncInFlight = { uid, generation, promise };
    try {
      const state = await promise;
      if (!this._isCurrentSync(uid, generation)) {
        return this._checkState();
      }
      this._checkState.set(state);
      if (state.status !== "error") {
        this._lastSyncedUid = uid;
      }
      return state;
    } catch (error) {
      if (!this._isCurrentSync(uid, generation)) {
        return this._checkState();
      }
      console.warn("[AgeAssurance] Failed to sync native age policy", error);
      const state: AgeAssuranceCheckState = {
        status: "error",
        uid,
        platform,
      };
      this._checkState.set(state);
      return state;
    } finally {
      if (this._isCurrentSync(uid, generation)) {
        this._syncInFlight = null;
      }
    }
  }

  private _invalidateSyncInFlight(): void {
    this._syncGeneration += 1;
    this._syncInFlight = null;
  }

  private _isCurrentSync(uid: string, generation: number): boolean {
    return (
      this._syncGeneration === generation &&
      this._authService.user.uid === uid
    );
  }

  private async _performNativeSync(
    uid: string,
    platform: "android" | "ios",
  ): Promise<AgeAssuranceCheckState> {
    const synced =
      platform === "android"
        ? await this._syncRequestBoundAndroidPolicy(uid)
        : await this._syncUnboundCompatibilityPolicy(
            await NativeAgeAssurance.getAgeSignal(),
          );
    return this._checkStateForResult(uid, platform, synced);
  }

  private async _syncRequestBoundAndroidPolicy(
    uid: string,
  ): Promise<SyncedAgePolicy> {
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

    const response =
      await this._functionsAdapter.callAuthenticatedAppChecked<
        UpdateAgePolicyV3Request,
        UpdateAgePolicyResponse
      >("updateAgePolicyV3", {
        challenge_id: challenge.challenge_id,
        challenge_nonce: challenge.challenge_nonce,
        integrity_token: bound.integrityToken,
        signal: this._sanitizeSignalForFunction(bound.signal),
      });
    return { signal: bound.signal, response };
  }

  private async _syncUnboundCompatibilityPolicy(
    signal: PlatformAgeSignal,
  ): Promise<SyncedAgePolicy> {
    const response =
      await this._functionsAdapter.callAuthenticatedAppChecked<
        UpdateAgePolicyV2Request,
        UpdateAgePolicyResponse
      >("updateAgePolicyV2", {
        signal: this._sanitizeSignalForFunction(signal),
      });
    return { signal, response };
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
    const checkState = this._checkState();
    if (checkState.uid === this._authService.user.uid) {
      if (checkState.status === "verified") {
        return true;
      }
      if (
        checkState.status !== "idle" &&
        checkState.status !== "checking" &&
        checkState.status !== "error"
      ) {
        return false;
      }
    }

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

  private _checkStateForResult(
    uid: string,
    platform: "android" | "ios",
    { signal, response }: SyncedAgePolicy,
  ): AgeAssuranceCheckState {
    const checkedAt = response.evaluated_at ?? new Date().toISOString();
    const base = { uid, platform, checkedAt } as const;

    if (response.adult_eligibility === "verified") {
      return { ...base, status: "verified" };
    }
    if (signal.ageSignalsStatus === "verification_required") {
      return { ...base, status: "verification_required" };
    }
    if (
      signal.ageSignalsStatus === "not_shared" ||
      signal.response === "declined"
    ) {
      return { ...base, status: "not_shared" };
    }
    if (!signal.available || signal.response === "unavailable") {
      return {
        ...base,
        status: "unavailable",
        ...(signal.errorCode !== undefined
          ? { errorCode: signal.errorCode }
          : {}),
      };
    }
    if (signal.ageRangeSource === "tier_a") {
      return { ...base, status: "self_declared" };
    }
    if (signal.ageRangeSource === "tier_b") {
      return { ...base, status: "guardian_managed" };
    }
    return { ...base, status: "not_verified" };
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
