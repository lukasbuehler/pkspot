import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import type {
  SafetyCaseCategory,
  SafetyCaseDecisionType,
  SafetyCaseOutcome,
  SafetyCasePublicView,
  SafetyCaseStatus,
  SafetyCaseSubjectSchema,
  SafetyCaseType,
} from "../../db/schemas/SafetyCaseSchema";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

export interface SubmitSafetyCaseInput {
  case_type: Exclude<SafetyCaseType, "appeal">;
  category: SafetyCaseCategory;
  subject: SafetyCaseSubjectSchema;
  summary: string;
  description: string;
  contact_email?: string;
  locale: string;
}

export interface SubmitSafetyCaseResult {
  case_id: string;
  public_reference: string;
  acknowledged_at: string;
  target_resolution_at: string;
  complex_resolution_at: string;
  email_verification_required: boolean;
}

export interface SafetyCaseListItem {
  id: string;
  public_reference: string;
  case_type: SafetyCaseType;
  category: SafetyCaseCategory;
  priority: "immediate" | "urgent" | "standard" | "low";
  status: SafetyCaseStatus;
  subject: SafetyCaseSubjectSchema;
  summary: string;
  contact_email_verified: boolean;
  acknowledged_at: number;
  target_resolution_at: number;
  complex_resolution_at: number;
  created_at: number;
  updated_at: number;
  assigned_to?: { uid: string; display_name?: string };
  decision?: SafetyCasePublicView["decision"] & {
    hold_path?: string;
    restored_at?: string | number;
  };
  incident_path?: string;
  parent_case_id?: string;
  appeal_case_id?: string;
}

export interface AdminSafetyCaseDetail {
  id: string;
  case: SafetyCasePublicView;
  workflow: SafetyCaseListItem;
  private_intake: {
    submitter_uid?: string;
    contact_email?: string;
    contact_email_verified?: boolean;
    reporter_display_name?: string;
    reporter_profile_picture?: string;
    ip_address?: string;
    ip_hash?: string;
    user_agent?: string;
    origin?: string;
    app_id?: string;
    app_check?: boolean;
    authenticated?: boolean;
  };
  email_delivery: {
    id: string;
    template?: string;
    created_at: number;
    delivery: Record<string, unknown>;
  }[];
}

@Injectable({
  providedIn: "root",
})
export class SafetyCasesService {
  private readonly _functions = inject(FunctionsAdapterService);
  private readonly _platformId = inject(PLATFORM_ID);

  submit(input: SubmitSafetyCaseInput): Promise<SubmitSafetyCaseResult> {
    return this._functions.callPublic<
      SubmitSafetyCaseInput,
      SubmitSafetyCaseResult
    >("submitSafetyCase", input);
  }

  async exchangeAccessLink(
    accessToken: string,
  ): Promise<SafetyCasePublicView> {
    const result = await this._functions.callPublic<
      { access_token: string },
      {
        session_token: string;
        expires_at: string;
        case: SafetyCasePublicView;
      }
    >("exchangeSafetyCaseAccessLink", { access_token: accessToken });
    this._saveSessionToken(
      result.case.public_reference,
      result.session_token,
    );
    return result.case;
  }

  get(publicReference: string): Promise<SafetyCasePublicView> {
    return this._functions.callPublic<
      { public_reference: string; session_token?: string },
      SafetyCasePublicView
    >("getSafetyCaseView", {
      public_reference: publicReference,
      session_token: this._sessionToken(publicReference),
    });
  }

  addMessage(publicReference: string, message: string): Promise<{ ok: true }> {
    return this._functions.callPublic<
      {
        public_reference: string;
        session_token?: string;
        message: string;
      },
      { ok: true }
    >("addSafetyCaseMessage", {
      public_reference: publicReference,
      session_token: this._sessionToken(publicReference),
      message,
    });
  }

  async appeal(
    publicReference: string,
    reason: string,
  ): Promise<{
    case_id: string;
    public_reference: string;
    acknowledged_at?: string;
    already_exists?: boolean;
    session_token?: string;
    session_expires_at?: string;
  }> {
    const result = await this._functions.callPublic<
      {
        public_reference: string;
        session_token?: string;
        reason: string;
      },
      {
        case_id: string;
        public_reference: string;
        acknowledged_at?: string;
        already_exists?: boolean;
        session_token?: string;
        session_expires_at?: string;
      }
    >("appealSafetyCaseDecision", {
      public_reference: publicReference,
      session_token: this._sessionToken(publicReference),
      reason,
    });
    if (result.session_token) {
      this._saveSessionToken(result.public_reference, result.session_token);
    }
    return result;
  }

  async listAdminCases(status?: SafetyCaseStatus): Promise<SafetyCaseListItem[]> {
    const result = await this._functions.callAuthenticatedAppChecked<
      { status?: SafetyCaseStatus; limit: number },
      { cases: SafetyCaseListItem[] }
    >("listSafetyCases", { ...(status ? { status } : {}), limit: 200 });
    return result.cases;
  }

  getAdminCase(publicReference: string): Promise<AdminSafetyCaseDetail> {
    return this._functions.callAuthenticatedAppChecked<
      { public_reference: string },
      AdminSafetyCaseDetail
    >("getAdminSafetyCase", { public_reference: publicReference });
  }

  updateAdminCase(
    publicReference: string,
    input: {
      status?: SafetyCaseStatus;
      message?: string;
      internal_note?: string;
      participant_role?: "submitter" | "subject";
      assign_to_self?: boolean;
    },
  ): Promise<{ ok: true }> {
    return this._functions.callAuthenticatedAppChecked<
      typeof input & { public_reference: string },
      { ok: true }
    >("updateSafetyCase", { public_reference: publicReference, ...input });
  }

  decideAdminCase(
    publicReference: string,
    input: {
      decision_type: SafetyCaseDecisionType;
      outcome: SafetyCaseOutcome;
      public_reason: string;
      policy_basis?: string;
      internal_note?: string;
      independence_limitation?: string;
    },
  ): Promise<{ ok: true; hold_path?: string }> {
    return this._functions.callAuthenticatedAppChecked<
      typeof input & { public_reference: string },
      { ok: true; hold_path?: string }
    >("decideSafetyCase", { public_reference: publicReference, ...input });
  }

  restoreAdminCase(publicReference: string): Promise<{ ok: true }> {
    return this._functions.callAuthenticatedAppChecked<
      { public_reference: string },
      { ok: true }
    >("restoreSafetyCaseDecision", { public_reference: publicReference });
  }

  private _sessionToken(publicReference: string): string | undefined {
    if (!isPlatformBrowser(this._platformId)) return undefined;
    return localStorage.getItem(this._sessionKey(publicReference)) ?? undefined;
  }

  private _saveSessionToken(publicReference: string, token: string): void {
    if (!isPlatformBrowser(this._platformId)) return;
    localStorage.setItem(this._sessionKey(publicReference), token);
  }

  private _sessionKey(publicReference: string): string {
    return `pkspot.safety-case.${publicReference}`;
  }
}
