import { Injectable, inject } from "@angular/core";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

interface RestoreCredentialsPlugin {
  createRestoreCredential(options: {
    requestJson: string;
  }): Promise<{
    registrationResponseJson: string;
    cloudBackupEnabled: boolean;
  }>;
  getRestoreCredential(options: {
    requestJson: string;
  }): Promise<{
    authenticationResponseJson: string;
  }>;
  clearRestoreCredential(): Promise<void>;
}

interface BeginRestoreCredentialResponse {
  challenge_id: string;
  request_json: string;
}

interface RestoreCredentialAuthenticationResponse {
  firebase_custom_token: string;
}

const NativeRestoreCredentials = registerPlugin<RestoreCredentialsPlugin>(
  "RestoreCredentials",
);

/**
 * Keeps Android Restore Credentials separate from normal sign-in providers.
 * Retrieval is a best-effort, no-UI operation; provisioning occurs only after
 * an explicit sign-in or sign-up so it never surprises an active user at app
 * launch.
 */
@Injectable({ providedIn: "root" })
export class RestoreCredentialsService {
  private readonly functions = inject(FunctionsAdapterService);
  private readonly provisionInFlight = new Set<string>();
  private restoreAttempted = false;

  async restoreSignedOutSession(): Promise<void> {
    if (!this.isSupported() || this.restoreAttempted) return;
    this.restoreAttempted = true;

    try {
      const begin =
        await this.functions.callUnauthenticated<
          Record<string, never>,
          BeginRestoreCredentialResponse
        >("beginRestoreCredentialAuthentication", {});
      const credential = await NativeRestoreCredentials.getRestoreCredential({
        requestJson: begin.request_json,
      });
      const authentication =
        await this.functions.callUnauthenticated<
          {
            challenge_id: string;
            credential_response_json: string;
          },
          RestoreCredentialAuthenticationResponse
        >("finishRestoreCredentialAuthentication", {
          challenge_id: begin.challenge_id,
          credential_response_json: credential.authenticationResponseJson,
        });
      await FirebaseAuthentication.signInWithCustomToken({
        token: authentication.firebase_custom_token,
      });
      console.info("[Restore Credentials] Restored the signed-in session.");
    } catch (error) {
      // Missing credentials are expected on normal first installs. Never surface
      // this as a sign-in error or include WebAuthn/Firebase payloads in logs.
      console.info(
        "[Restore Credentials] No session restored:",
        this.errorCode(error),
      );
    }
  }

  async provisionAfterUserAction(uid: string): Promise<void> {
    if (
      !this.isSupported() ||
      this.wasProvisioned(uid) ||
      this.provisionInFlight.has(uid)
    ) {
      return;
    }
    this.provisionInFlight.add(uid);
    try {
      const begin =
        await this.functions.callAuthenticatedAppChecked<
          Record<string, never>,
          BeginRestoreCredentialResponse
        >("beginRestoreCredentialRegistration", {});
      const credential =
        await NativeRestoreCredentials.createRestoreCredential({
          requestJson: begin.request_json,
        });
      await this.functions.callAuthenticatedAppChecked<
        {
          challenge_id: string;
          credential_response_json: string;
        },
        { ok: true }
      >("finishRestoreCredentialRegistration", {
        challenge_id: begin.challenge_id,
        credential_response_json: credential.registrationResponseJson,
      });
      this.markProvisioned(uid);
      console.info(
        "[Restore Credentials] Provisioned after an explicit user action.",
      );
    } catch (error) {
      // Provisioning must never turn a successful ordinary sign-in into an
      // error. The next deliberate sign-in can retry after a transient failure.
      console.warn(
        "[Restore Credentials] Provisioning did not complete:",
        this.errorCode(error),
      );
    } finally {
      this.provisionInFlight.delete(uid);
    }
  }

  async clearForSignedOutUser(uid: string): Promise<void> {
    this.clearProvisioned(uid);
    if (!this.isSupported()) return;
    try {
      await NativeRestoreCredentials.clearRestoreCredential();
    } catch (error) {
      // A local clear failure must not prevent the account from being signed
      // out. The server still rejects deleted accounts during restoration.
      console.warn(
        "[Restore Credentials] Could not clear the restore key:",
        this.errorCode(error),
      );
    }
  }

  private isSupported(): boolean {
    return (
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
    );
  }

  private storageKey(uid: string): string {
    return `pkspot.restoreCredentials.provisioned.${uid}`;
  }

  private wasProvisioned(uid: string): boolean {
    try {
      return localStorage.getItem(this.storageKey(uid)) === "1";
    } catch {
      return false;
    }
  }

  private markProvisioned(uid: string): void {
    try {
      localStorage.setItem(this.storageKey(uid), "1");
    } catch {
      // The native key is authoritative; a later user-initiated sign-in can
      // safely retry if this non-sensitive optimization cannot be persisted.
    }
  }

  private clearProvisioned(uid: string): void {
    try {
      localStorage.removeItem(this.storageKey(uid));
    } catch {
      // No action needed when web storage is unavailable.
    }
  }

  private errorCode(error: unknown): string {
    if (!error || typeof error !== "object" || !("code" in error)) {
      return "unknown";
    }
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : "unknown";
  }
}
