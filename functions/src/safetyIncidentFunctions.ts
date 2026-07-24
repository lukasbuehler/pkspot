import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { DEFAULT_STORAGE_BUCKET } from "./storageBucket";

interface CreateSafetyIncidentRequest {
  report_path: string;
}

interface GetModerationMediaPreviewRequest {
  report_path: string;
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
  containment_summary?: string;
  posthog_context?: string;
  external_report_reference?: string;
  notes?: string;
}

const db = admin.firestore();

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
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
      transaction.create(incidentRef, {
        status: "triage",
        classification: "undetermined",
        uk_link: "unknown",
        retention_state: "triage_hold",
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
    const reportPath = request.data.report_path;
    assertReportPath(reportPath);

    const report = await db.doc(reportPath).get();
    const media = report.data()?.["media"];
    const storagePath =
      media && typeof media === "object" ? media["storage_path"] : undefined;
    if (!report.exists || typeof storagePath !== "string") {
      throw new HttpsError("not-found", "Quarantined media was not found.");
    }

    const [url] = await getStorage()
      .bucket(DEFAULT_STORAGE_BUCKET)
      .file(storagePath)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 5 * 60 * 1000,
      });
    return { url, expires_in_seconds: 300 };
  },
);

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
    if (
      !/^[A-Za-z0-9_-]+$/.test(incidentId) ||
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
      ].includes(retentionState)
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
    const notes = stringField(request.data.notes, "notes", 5000);
    const update = {
      status,
      classification,
      uk_link: ukLink,
      retention_state: retentionState,
      ...(containmentSummary
        ? { containment_summary: containmentSummary }
        : {}),
      ...(posthogContext ? { posthog_context: posthogContext } : {}),
      ...(externalReportReference
        ? { external_report_reference: externalReportReference }
        : {}),
      ...(notes ? { notes } : {}),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by: uid,
    };

    const incidentRef = db.doc(`safety_incidents/${incidentId}`);
    if (!(await incidentRef.get()).exists) {
      throw new HttpsError("not-found", "Safety incident not found.");
    }

    const batch = db.batch();
    batch.update(incidentRef, update);
    batch.create(incidentRef.collection("events").doc(), {
      type: "incident_updated",
      state: update,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      created_by: uid,
    });
    await batch.commit();
    return { ok: true };
  },
);
