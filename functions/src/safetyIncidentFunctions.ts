import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { DEFAULT_STORAGE_BUCKET } from "./storageBucket";

interface CreateSafetyIncidentRequest {
  report_path: string;
}

interface GetModerationMediaPreviewRequest {
  report_path?: string;
  review_id?: string;
}

interface UpdateSafetyIncidentRequest {
  incident_id: string;
  status: "triage" | "contained" | "reported" | "closed";
  classification:
    | "undetermined"
    | "ordinary_harm"
    | "illegal_content"
    | "csea"
    | "imminent_danger";
  uk_link: "unknown" | "yes" | "no";
  retention_state:
    | "triage_hold"
    | "reporting_hold"
    | "legal_hold"
    | "deletion_scheduled"
    | "deleted";
  reporting_route?:
    | "pending"
    | "nca_csea_irp"
    | "ncmec_existing_channel"
    | "uk_police"
    | "emergency_services"
    | "not_required";
  reporting_status?:
    | "not_assessed"
    | "registration_required"
    | "preparing"
    | "submitted"
    | "not_required";
  runbook?: {
    evidence_preserved: boolean;
    access_restricted: boolean;
    context_collected: boolean;
    uk_link_assessed: boolean;
    reporting_route_assessed: boolean;
    external_action_recorded: boolean;
  };
  containment_summary?: string;
  posthog_context?: string;
  external_report_reference?: string;
  reporting_decision_summary?: string;
  notes?: string;
}

const db = admin.firestore();
const RUNBOOK_KEYS = [
  "evidence_preserved",
  "access_restricted",
  "context_collected",
  "uk_link_assessed",
  "reporting_route_assessed",
  "external_action_recorded",
] as const;

const assertAdmin = async (uid: string | undefined): Promise<string> => {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  return uid;
};

const assertReportPath = (path: string): void => {
  if (
    !/^reports\/[^/]+$/.test(path) &&
    !/^media_reports\/[^/]+$/.test(path)
  ) {
    throw new HttpsError("invalid-argument", "Invalid media report path.");
  }
};

const isRestrictedScannerResult = (
  scanner: admin.firestore.DocumentData | undefined,
): boolean =>
  scanner?.["decision"] === "reportable_match" ||
  scanner?.["severity"] === "known_csam_match";

const stringField = (
  value: unknown,
  name: string,
  maxLength: number,
): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || value.length > maxLength) {
    throw new HttpsError("invalid-argument", `Invalid ${name}.`);
  }
  return value.trim();
};

export const createSafetyIncident = onCall<CreateSafetyIncidentRequest>(
  async (request) => {
    const uid = await assertAdmin(request.auth?.uid);
    const reportPath = request.data.report_path;
    assertReportPath(reportPath);

    const reportRef = db.doc(reportPath);
    const report = await reportRef.get();
    if (!report.exists) {
      throw new HttpsError("not-found", "Media report not found.");
    }
    const data = report.data() ?? {};
    const existingPath = data["incident_path"];
    if (
      typeof existingPath === "string" &&
      /^safety_incidents\/[^/]+$/.test(existingPath)
    ) {
      return { incident_path: existingPath };
    }

    const media = data["media"];
    const incidentRef = db.collection("safety_incidents").doc();
    const timestamp = FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
      transaction.create(incidentRef, {
        status: "triage",
        classification: "undetermined",
        uk_link: "unknown",
        retention_state: "triage_hold",
        reporting_route: "pending",
        reporting_status: "not_assessed",
        runbook: {
          evidence_preserved: false,
          access_restricted: false,
          context_collected: false,
          uk_link_assessed: false,
          reporting_route_assessed: false,
          external_action_recorded: false,
        },
        source_report_path: reportPath,
        ...(typeof data["review_path"] === "string"
          ? { review_path: data["review_path"] }
          : {}),
        ...(media &&
        typeof media === "object" &&
        typeof media["storage_path"] === "string"
          ? { storage_path: media["storage_path"] }
          : {}),
        ...(media &&
        typeof media === "object" &&
        typeof media["sha256"] === "string"
          ? { sha256: media["sha256"] }
          : {}),
        ...(data["scanner"] && typeof data["scanner"] === "object"
          ? { scanner: data["scanner"] }
          : {}),
        created_at: timestamp,
        created_by: uid,
        updated_at: timestamp,
        updated_by: uid,
      });
      transaction.update(reportRef, { incident_path: incidentRef.path });
      transaction.create(incidentRef.collection("events").doc(), {
        type: "incident_created",
        created_at: timestamp,
        created_by: uid,
        source_report_path: reportPath,
      });
    });

    return { incident_path: incidentRef.path };
  },
);

export const getModerationMediaPreview = onCall<GetModerationMediaPreviewRequest>(
  async (request) => {
    await assertAdmin(request.auth?.uid);
    const { report_path: reportPath, review_id: reviewId } = request.data;
    if (typeof reviewId === "string") {
      if (!/^[A-Za-z0-9_-]+$/.test(reviewId) || reportPath !== undefined) {
        throw new HttpsError("invalid-argument", "Invalid media preview target.");
      }
      const review = await db.doc(`media_upload_reviews/${reviewId}`).get();
      const reviewData = review.data() ?? {};
      if (!review.exists) {
        throw new HttpsError("not-found", "Media review not found.");
      }
      if (isRestrictedScannerResult(reviewData["scan_result"])) {
        throw new HttpsError(
          "failed-precondition",
          "Reportable-match media cannot be previewed.",
        );
      }
      const storagePath =
        typeof reviewData["intake_path"] === "string"
          ? reviewData["intake_path"]
          : typeof reviewData["audited_path"] === "string"
            ? reviewData["audited_path"]
            : undefined;
      if (!storagePath) {
        throw new HttpsError("not-found", "Quarantined media was not found.");
      }
      return createSignedPreview(storagePath);
    }

    if (typeof reportPath !== "string") {
      throw new HttpsError("invalid-argument", "Invalid media preview target.");
    }
    assertReportPath(reportPath);
    const report = await db.doc(reportPath).get();
    const reportData = report.data() ?? {};
    const media = reportData["media"];
    const storagePath =
      media && typeof media === "object" ? media["storage_path"] : undefined;
    const scanner =
      reportData["scanner"] && typeof reportData["scanner"] === "object"
        ? reportData["scanner"]
        : media && typeof media === "object"
          ? {
              decision: media["scanner_decision"],
              severity: media["scanner_severity"],
            }
          : undefined;
    if (!report.exists || typeof storagePath !== "string") {
      throw new HttpsError("not-found", "Quarantined media was not found.");
    }
    if (isRestrictedScannerResult(scanner)) {
      throw new HttpsError(
        "failed-precondition",
        "Reportable-match media cannot be previewed.",
      );
    }

    return createSignedPreview(storagePath);
  },
);

const createSignedPreview = async (
  storagePath: string,
): Promise<{ url: string; expires_in_seconds: number }> => {
  const file = getStorage().bucket(DEFAULT_STORAGE_BUCKET).file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError(
      "not-found",
      "The quarantined media file no longer exists.",
    );
  }
  const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
    });
  return { url, expires_in_seconds: 300 };
};

export const updateSafetyIncident = onCall<UpdateSafetyIncidentRequest>(
  async (request) => {
    const uid = await assertAdmin(request.auth?.uid);
    const {
      incident_id: incidentId,
      status,
      classification,
      uk_link: ukLink,
      retention_state: retentionState,
    } = request.data;
    if (!/^[A-Za-z0-9_-]+$/.test(incidentId)) {
      throw new HttpsError("invalid-argument", "Invalid incident state.");
    }

    const incidentRef = db.doc(`safety_incidents/${incidentId}`);
    const incident = await incidentRef.get();
    if (!incident.exists) {
      throw new HttpsError("not-found", "Safety incident not found.");
    }
    const existing = incident.data() ?? {};
    const reportingRoute =
      request.data.reporting_route ??
      existing["reporting_route"] ??
      "pending";
    const reportingStatus =
      request.data.reporting_status ??
      existing["reporting_status"] ??
      "not_assessed";
    const runbook =
      request.data.runbook ??
      existing["runbook"] ?? {
        evidence_preserved: false,
        access_restricted: false,
        context_collected: false,
        uk_link_assessed: false,
        reporting_route_assessed: false,
        external_action_recorded: false,
      };
    const hasStructuredRunbookInput =
      request.data.reporting_route !== undefined ||
      request.data.reporting_status !== undefined ||
      request.data.runbook !== undefined;
    if (
      !["triage", "contained", "reported", "closed"].includes(status) ||
      ![
        "undetermined",
        "ordinary_harm",
        "illegal_content",
        "csea",
        "imminent_danger",
      ].includes(classification) ||
      !["unknown", "yes", "no"].includes(ukLink) ||
      ![
        "triage_hold",
        "reporting_hold",
        "legal_hold",
        "deletion_scheduled",
        "deleted",
      ].includes(retentionState) ||
      ![
        "pending",
        "nca_csea_irp",
        "ncmec_existing_channel",
        "uk_police",
        "emergency_services",
        "not_required",
      ].includes(reportingRoute) ||
      ![
        "not_assessed",
        "registration_required",
        "preparing",
        "submitted",
        "not_required",
      ].includes(reportingStatus) ||
      !runbook ||
      typeof runbook !== "object" ||
      !RUNBOOK_KEYS.every((key) => typeof runbook[key] === "boolean")
    ) {
      throw new HttpsError("invalid-argument", "Invalid incident state.");
    }

    const containmentSummary = stringField(
      request.data.containment_summary,
      "containment summary",
      2000,
    );
    const posthogContext = stringField(
      request.data.posthog_context,
      "PostHog context",
      5000,
    );
    const externalReportReference = stringField(
      request.data.external_report_reference,
      "external report reference",
      500,
    );
    const reportingDecisionSummary = stringField(
      request.data.reporting_decision_summary,
      "reporting decision summary",
      3000,
    );
    const notes = stringField(request.data.notes, "notes", 5000);
    if (
      hasStructuredRunbookInput &&
      reportingStatus === "submitted" &&
      !externalReportReference
    ) {
      throw new HttpsError(
        "failed-precondition",
        "A submitted external report needs a reference.",
      );
    }
    if (
      hasStructuredRunbookInput &&
      status === "reported" &&
      reportingStatus !== "submitted"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Reported incidents must record a submitted external report.",
      );
    }
    if (
      hasStructuredRunbookInput &&
      status === "closed" &&
      (!containmentSummary ||
        !reportingDecisionSummary ||
        !["submitted", "not_required"].includes(reportingStatus) ||
        !RUNBOOK_KEYS.every((key) => runbook[key]))
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Complete the runbook and decision record before closing.",
      );
    }
    if (
      hasStructuredRunbookInput &&
      retentionState === "deleted" &&
      status !== "closed"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Evidence deletion can only be recorded on a closed incident.",
      );
    }
    if (
      hasStructuredRunbookInput &&
      reportingRoute === "not_required" &&
      !reportingDecisionSummary
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Record why no external report is required.",
      );
    }

    const firstSubmission =
      reportingStatus === "submitted" &&
      incident.data()?.["reporting_status"] !== "submitted";
    const update = {
      status,
      classification,
      uk_link: ukLink,
      retention_state: retentionState,
      reporting_route: reportingRoute,
      reporting_status: reportingStatus,
      runbook,
      ...(containmentSummary
        ? { containment_summary: containmentSummary }
        : {}),
      ...(posthogContext ? { posthog_context: posthogContext } : {}),
      ...(externalReportReference
        ? { external_report_reference: externalReportReference }
        : {}),
      ...(reportingDecisionSummary
        ? { reporting_decision_summary: reportingDecisionSummary }
        : {}),
      ...(notes ? { notes } : {}),
      ...(firstSubmission
        ? { external_reported_at: FieldValue.serverTimestamp() }
        : {}),
      updated_at: FieldValue.serverTimestamp(),
      updated_by: uid,
    };

    const batch = db.batch();
    batch.update(incidentRef, update);
    batch.create(incidentRef.collection("events").doc(), {
      type: "incident_updated",
      state: update,
      created_at: FieldValue.serverTimestamp(),
      created_by: uid,
    });
    await batch.commit();
    return { ok: true };
  },
);
