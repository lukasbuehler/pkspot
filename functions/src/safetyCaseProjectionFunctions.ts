import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import type {
  SafetyCaseCategory,
  SafetyCaseDecisionType,
  SafetyCaseOutcome,
  SafetyCasePriority,
  SafetyCaseSchema,
  SafetyCaseSubjectSchema,
} from "../../src/db/schemas/SafetyCaseSchema";
import {persistAuthoritativeReporter} from "./reportIdentity";
import {
  SAFETY_CASES,
  SAFETY_CASE_ACCESS_TOKENS,
  SAFETY_CASE_EMAIL_OUTBOX,
  assertAdmin,
  caseAccessTokenDocument,
  complexResolutionAt,
  caseAccessLink,
  caseEmailDocument,
  isRecord,
  legacyCaseId,
  publicReference,
  randomToken,
  sha256,
  targetResolutionAt,
} from "./safetyCaseHelpers";

const db = admin.firestore();

interface LegacyProjection {
  category: SafetyCaseCategory;
  priority: SafetyCasePriority;
  subject: SafetyCaseSubjectSchema;
  summary: string;
  description: string;
}

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const timestampValue = (value: unknown): Timestamp =>
  value instanceof Timestamp ?
    value :
    value instanceof Date ?
      Timestamp.fromDate(value) :
      Timestamp.now();

const categoryForText = (
  reason: string,
  fallback: SafetyCaseCategory,
): SafetyCaseCategory => {
  const normalized = reason.toLowerCase();
  if (normalized.includes("self-harm") || normalized.includes("suicide")) {
    return "self_harm_or_suicide";
  }
  if (
    normalized.includes("child") ||
    normalized.includes("minor") ||
    normalized.includes("underage")
  ) {
    return "child_safety";
  }
  if (
    normalized.includes("sexual") ||
    normalized.includes("porn") ||
    normalized.includes("explicit")
  ) {
    return "sexual_content";
  }
  if (
    normalized.includes("harass") ||
    normalized.includes("hate") ||
    normalized.includes("threat")
  ) {
    return "harassment_or_hate";
  }
  if (
    normalized.includes("privacy") ||
    normalized.includes("dox") ||
    normalized.includes("consent")
  ) {
    return "privacy_or_doxxing";
  }
  if (normalized.includes("impersonat")) return "impersonation";
  if (
    normalized.includes("spam") ||
    normalized.includes("malicious") ||
    normalized.includes("scam")
  ) {
    return "spam_or_malicious_link";
  }
  if (normalized.includes("illegal")) return "illegal_content";
  return fallback;
};

const priorityForCategory = (
  category: SafetyCaseCategory,
): SafetyCasePriority => {
  if (category === "self_harm_or_suicide") return "immediate";
  if (
    category === "child_safety" ||
    category === "sexual_content" ||
    category === "illegal_content"
  ) {
    return "urgent";
  }
  return "standard";
};

const legacyProjection = (
  sourcePath: string,
  data: admin.firestore.DocumentData,
): LegacyProjection => {
  const reason = stringValue(data["reason"]) ?? "Safety concern";
  const comment = stringValue(data["comment"]) ?? "";
  const spotMatch = sourcePath.match(
    /^spots\/([^/]+)\/reports\/[^/]+$/u,
  );
  if (spotMatch) {
    const spot = isRecord(data["spot"]) ? data["spot"] : {};
    const label =
      stringValue(spot["name"]) ?? `Spot ${spotMatch[1]}`;
    const category = categoryForText(reason, "unsafe_place_or_access");
    return {
      category,
      priority: priorityForCategory(category),
      subject: {
        type: "spot",
        path: `spots/${spotMatch[1]}`,
        label,
      },
      summary: `Report about ${label}`,
      description: comment || reason,
    };
  }

  if (/^user_reports\/[^/]+$/u.test(sourcePath)) {
    const reportedUser = isRecord(data["reportedUser"]) ?
      data["reportedUser"] :
      {};
    const uid = stringValue(reportedUser["uid"]);
    const label =
      stringValue(reportedUser["display_name"]) ??
      (uid ? `User ${uid}` : "Profile");
    const category = categoryForText(
      reason,
      reason === "unsafe_profile" ? "other_safety" : "harassment_or_hate",
    );
    return {
      category,
      priority: priorityForCategory(category),
      subject: {
        type: "profile",
        ...(uid ? {path: `users/${uid}`, owner_uid: uid} : {}),
        label,
      },
      summary: `Report about ${label}`,
      description: comment || reason,
    };
  }

  const media = isRecord(data["media"]) ? data["media"] : {};
  const context = stringValue(data["context"]);
  const targetId =
    stringValue(data["targetId"]) ?? stringValue(data["spotId"]);
  const reviewPath = stringValue(data["review_path"]);
  const source = stringValue(data["source"]);
  const category =
    source === "scanner" ?
      "automated_media_decision" :
      categoryForText(reason, "media_consent");
  const targetPath =
    reviewPath ??
    (context === "event" && targetId ?
      `events/${targetId}` :
      targetId ?
        `spots/${targetId}` :
        undefined);
  return {
    category,
    priority: priorityForCategory(category),
    subject: {
      type: source === "scanner" ? "media" : context === "event" ? "event" : "media",
      ...(targetPath ? {path: targetPath} : {}),
      ...(stringValue(media["userId"]) ?
        {owner_uid: stringValue(media["userId"])} :
        {}),
      ...(stringValue(media["src"]) ?
        {media_src: stringValue(media["src"])} :
        {}),
      ...(stringValue(media["storage_path"]) ?
        {storage_path: stringValue(media["storage_path"])} :
        {}),
      label: source === "scanner" ? "Automated media review" : "Reported media",
    },
    summary:
      source === "scanner" ?
        "Automated media review" :
        "Report about uploaded media",
    description: comment || reason,
  };
};

const acknowledgementCopy = (
  reference: string,
  accessLinkValue: string | undefined,
): {subject: string; text: string; html: string} => ({
  subject: `PK Spot safety case ${reference}`,
  text:
    `We received your report. Your reference is ${reference}.` +
    (accessLinkValue ?
      `\n\nVerify your email and view the case: ${accessLinkValue}` :
      ""),
  html:
    `<p>We received your report. Your reference is <strong>${reference}</strong>.</p>` +
    (accessLinkValue ?
      `<p><a href="${accessLinkValue}">Verify your email and view the case</a></p>` :
      ""),
});

const retainedOriginalPayload = (
  sourceData: admin.firestore.DocumentData,
): admin.firestore.DocumentData => {
  const copy = {...sourceData};
  const submission = sourceData["submission"];
  if (isRecord(submission)) {
    copy["submission"] = {
      ...(stringValue(submission["channel"]) ?
        {channel: stringValue(submission["channel"])} :
        {}),
      authenticated: submission["authenticated"] === true,
      app_check: submission["app_check"] === true,
      contact_email_verified:
        submission["contact_email_verified"] === true,
    };
  }
  return copy;
};

export const projectLegacySafetyCase = async (
  sourceRef: admin.firestore.DocumentReference,
  sourceData: admin.firestore.DocumentData,
  options: {legacyImport: boolean; notify: boolean},
): Promise<{caseId: string; created: boolean}> => {
  const caseId = legacyCaseId(sourceRef.path);
  const caseRef = db.doc(`${SAFETY_CASES}/${caseId}`);
  if ((await caseRef.get()).exists) {
    return {caseId, created: false};
  }
  const projection = legacyProjection(sourceRef.path, sourceData);
  const submittedReporter = isRecord(sourceData["user"]) ?
    sourceData["user"] :
    undefined;
  const reporter = await persistAuthoritativeReporter(
    sourceRef,
    submittedReporter,
  );
  const createdAt = timestampValue(sourceData["createdAt"]);
  const now = Timestamp.now();
  const reference = publicReference();
  const locale = stringValue(sourceData["locale"]) ?? "en";
  const caseData: SafetyCaseSchema = {
    case_type: "report",
    public_reference: reference,
    category: projection.category,
    priority: projection.priority,
    status:
      sourceData["status"] === "resolved" ||
      sourceData["status"] === "dismissed" ?
        "resolved" :
        "received",
    subject: projection.subject,
    summary: projection.summary,
    description: projection.description,
    source_paths: [sourceRef.path],
    ...(reporter.uid && reporter.uid !== "system_media_scanner" ?
      {submitter_uid: reporter.uid} :
      {}),
    ...(projection.subject.owner_uid ?
      {subject_uid: projection.subject.owner_uid} :
      {}),
    contact_email_verified: reporter.email_verified === true,
    locale,
    acknowledged_at: createdAt,
    target_resolution_at: targetResolutionAt(
      "report",
      createdAt.toMillis(),
    ),
    complex_resolution_at: complexResolutionAt(createdAt.toMillis()),
    created_at: createdAt,
    updated_at: now,
    ...(options.legacyImport ? {legacy_import: true} : {}),
    ...(typeof sourceData["incident_path"] === "string" ?
      {incident_path: sourceData["incident_path"]} :
      {}),
  };
  const shouldNotify =
    options.notify &&
    Boolean(reporter.email) &&
    sourceData["source"] !== "scanner";
  const accessToken =
    shouldNotify && reporter.email_verified !== true ?
      randomToken() :
      undefined;
  const acknowledgement =
    shouldNotify && reporter.email ?
      acknowledgementCopy(
        reference,
        accessToken ?
          caseAccessLink(locale, reference, accessToken) :
          undefined,
      ) :
      undefined;
  try {
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(caseRef);
      if (existing.exists) return;
      transaction.create(caseRef, caseData);
      transaction.create(caseRef.collection("private").doc("intake"), {
        ...(reporter.uid ? {submitter_uid: reporter.uid} : {}),
        ...(reporter.email ? {contact_email: reporter.email} : {}),
        contact_email_verified: reporter.email_verified === true,
        ...(reporter.display_name ?
          {reporter_display_name: reporter.display_name} :
          {}),
        ...(reporter.profile_picture ?
          {reporter_profile_picture: reporter.profile_picture} :
          {}),
        ...(isRecord(sourceData["submission"]) ?
          sourceData["submission"] :
          {}),
        authenticated: Boolean(reporter.uid),
        app_check:
          isRecord(sourceData["submission"]) &&
          sourceData["submission"]["app_check"] === true,
        original_payload: retainedOriginalPayload(sourceData),
      });
      transaction.create(caseRef.collection("events").doc(), {
        type: options.legacyImport ? "legacy_imported" : "case_created",
        visibility: "participants",
        message: options.legacyImport ?
          "This historical report was added to the safety case system." :
          "PK Spot received this report.",
        created_at: now,
      });
      if (reporter.email && acknowledgement) {
        if (accessToken) {
          transaction.create(
            db.doc(
              `${SAFETY_CASE_ACCESS_TOKENS}/` +
                sha256("safety-case-access-v1", accessToken),
            ),
            caseAccessTokenDocument(
              caseId,
              reporter.email,
              "submitter",
            ),
          );
        }
        transaction.create(
          db.collection(SAFETY_CASE_EMAIL_OUTBOX).doc(),
          caseEmailDocument(
            caseId,
            reporter.email,
            "legacy_report_acknowledgement",
            acknowledgement.subject,
            acknowledgement.text,
            acknowledgement.html,
          ),
        );
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /already exists|ALREADY_EXISTS/u.test(error.message)
    ) {
      return {caseId, created: false};
    }
    throw error;
  }

  return {caseId, created: true};
};

export const onSpotReportSafetyCaseCreate = onDocumentCreated(
  "spots/{spotId}/reports/{reportId}",
  async (event) => {
    if (!event.data) return;
    await projectLegacySafetyCase(event.data.ref, event.data.data(), {
      legacyImport: false,
      notify: true,
    });
  },
);

export const onRootReportSafetyCaseCreate = onDocumentCreated(
  "reports/{reportId}",
  async (event) => {
    if (!event.data) return;
    await projectLegacySafetyCase(event.data.ref, event.data.data(), {
      legacyImport: false,
      notify: true,
    });
  },
);

export const onLegacyMediaReportSafetyCaseCreate = onDocumentCreated(
  "media_reports/{reportId}",
  async (event) => {
    if (!event.data) return;
    await projectLegacySafetyCase(event.data.ref, event.data.data(), {
      legacyImport: false,
      notify: true,
    });
  },
);

export const onUserReportSafetyCaseCreate = onDocumentCreated(
  "user_reports/{reportId}",
  async (event) => {
    if (!event.data) return;
    await projectLegacySafetyCase(event.data.ref, event.data.data(), {
      legacyImport: false,
      notify: true,
    });
  },
);

const decisionForModerationAction = (
  actionType: unknown,
): {
  type: SafetyCaseDecisionType;
  outcome: SafetyCaseOutcome;
  reason: string;
} | undefined => {
  if (actionType === "close_report") {
    return {
      type: "close_without_action",
      outcome: "no_action",
      reason: "The report was reviewed and no further action was required.",
    };
  }
  if (actionType === "publish_spot_warning" || actionType === "keep_warning") {
    return {
      type: "publish_warning",
      outcome: "action_taken",
      reason: "The report was reviewed and a warning was retained or published.",
    };
  }
  if (actionType === "delete_media") {
    return {
      type: "restrict_media",
      outcome: "action_taken",
      reason: "The reported media was removed.",
    };
  }
  if (actionType === "delete_spot" || actionType === "resolve_duplicate_spot") {
    return {
      type: "unpublish_spot",
      outcome: "action_taken",
      reason: actionType === "resolve_duplicate_spot" ?
        "The duplicate Spot was merged into the canonical Spot." :
        "The reported Spot was removed.",
    };
  }
  return undefined;
};

export const onModerationActionSafetyCaseCreate = onDocumentCreated(
  "moderation_actions/{actionId}",
  async (event) => {
    if (!event.data) return;
    const action = event.data.data();
    const sourcePath = stringValue(action["source_path"]);
    const mapped = decisionForModerationAction(action["action_type"]);
    if (!sourcePath || !mapped) return;
    const sourceSnapshot = isRecord(action["source_snapshot"]) ?
      action["source_snapshot"] :
      {};
    const sourceRef = db.doc(sourcePath);
    const projection = await projectLegacySafetyCase(
      sourceRef,
      sourceSnapshot,
      {legacyImport: false, notify: false},
    );
    const caseRef = db.doc(`${SAFETY_CASES}/${projection.caseId}`);
    const caseSnapshot = await caseRef.get();
    const caseData = caseSnapshot.data() as SafetyCaseSchema | undefined;
    if (!caseData || caseData.decision) return;
    const createdBy = isRecord(action["created_by"]) ?
      action["created_by"] :
      {};
    const reviewerUid = stringValue(createdBy["uid"]);
    if (!reviewerUid) return;
    const reviewer = {
      uid: reviewerUid,
      ...(stringValue(createdBy["display_name"]) ?
        {display_name: stringValue(createdBy["display_name"])} :
        {}),
    };
    const decidedAt = timestampValue(action["created_at"]);
    const decision = {
      type: mapped.type,
      outcome: mapped.outcome,
      public_reason: mapped.reason,
      decided_at: decidedAt,
      decided_by: reviewer,
    };
    const email = (
      await caseRef.collection("private").doc("intake").get()
    ).data()?.["contact_email"];
    const shouldEmail =
      typeof email === "string" && caseData.legacy_import !== true;
    const accessToken = shouldEmail ? randomToken() : undefined;
    const accessLink =
      shouldEmail && accessToken ?
        caseAccessLink(
          caseData.locale,
          caseData.public_reference,
          accessToken,
        ) :
        undefined;
    const emailText =
      `${mapped.reason}` +
      (accessLink ? `\n\nView this private case: ${accessLink}` : "");
    const emailHtml =
      `<p>${mapped.reason}</p>` +
      (accessLink ?
        `<p><a href="${accessLink}">View this private case</a></p>` :
        "");
    await db.runTransaction(async (transaction) => {
      const freshCase = await transaction.get(caseRef);
      if (freshCase.data()?.["decision"]) return;
      transaction.set(
        caseRef,
        {
          status: "resolved",
          decision,
          original_reviewer: reviewer,
          resolved_at: decidedAt,
          updated_at: decidedAt,
        },
        {merge: true},
      );
      transaction.create(
        caseRef.collection("events").doc(
          sha256("safety-case-legacy-action-v1", event.data!.ref.path),
        ),
        {
          type: "decision_recorded",
          visibility: "participants",
          message: mapped.reason,
          decision,
          created_by: reviewer,
          created_at: decidedAt,
        },
      );
      if (shouldEmail && accessToken && typeof email === "string") {
        transaction.create(
          db.doc(
            `${SAFETY_CASE_ACCESS_TOKENS}/` +
              sha256("safety-case-access-v1", accessToken),
          ),
          caseAccessTokenDocument(caseRef.id, email, "submitter"),
        );
        transaction.create(
          db.collection(SAFETY_CASE_EMAIL_OUTBOX).doc(
            sha256("safety-case-legacy-decision-email-v1", event.data!.ref.path),
          ),
          caseEmailDocument(
            caseRef.id,
            email,
            "legacy_report_decision",
            `Decision on PK Spot safety case ${caseData.public_reference}`,
            emailText,
            emailHtml,
          ),
        );
      }
    });
  },
);

export const backfillSafetyCases = onCall(
  {enforceAppCheck: true, timeoutSeconds: 540},
  async (request) => {
    await assertAdmin(request.auth?.uid);
    const input = isRecord(request.data) ? request.data : {};
    const dryRun = input["dry_run"] !== false;
    const [reports, mediaReports, userReports, actions] = await Promise.all([
      db.collectionGroup("reports").get(),
      db.collection("media_reports").get(),
      db.collection("user_reports").get(),
      db.collection("moderation_actions").get(),
    ]);
    const reportDocuments = new Map(
      [...reports.docs, ...mediaReports.docs, ...userReports.docs].map(
        (document) => [document.ref.path, document],
      ),
    );
    for (const action of actions.docs) {
      const sourcePath = stringValue(action.data()["source_path"]);
      const sourceSnapshot = action.data()["source_snapshot"];
      if (sourcePath && isRecord(sourceSnapshot) &&
        !reportDocuments.has(sourcePath)) {
        reportDocuments.set(
          sourcePath,
          {
            ref: db.doc(sourcePath),
            data: () => sourceSnapshot,
          } as admin.firestore.QueryDocumentSnapshot,
        );
      }
    }
    let existing = 0;
    let created = 0;
    for (const document of reportDocuments.values()) {
      const caseRef = db.doc(`${SAFETY_CASES}/${legacyCaseId(document.ref.path)}`);
      if ((await caseRef.get()).exists) {
        existing += 1;
        continue;
      }
      if (!dryRun) {
        const result = await projectLegacySafetyCase(
          document.ref,
          document.data(),
          {legacyImport: true, notify: false},
        );
        if (result.created) created += 1;
      } else {
        created += 1;
      }
    }
    return {
      dry_run: dryRun,
      reports_scanned: reportDocuments.size,
      existing,
      would_create: dryRun ? created : 0,
      created: dryRun ? 0 : created,
      moderation_actions_scanned: actions.size,
    };
  },
);

export const aggregateSafetyCaseMetrics = onSchedule(
  "every day 03:20",
  async () => {
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const cases = await db
      .collection(SAFETY_CASES)
      .where("updated_at", ">=", Timestamp.fromDate(start))
      .where("updated_at", "<", Timestamp.fromDate(end))
      .get();
    const counts: Record<string, number> = {};
    let resolved = 0;
    let reversedAppeals = 0;
    let overdue = 0;
    let totalResolutionMs = 0;
    for (const document of cases.docs) {
      const data = document.data() as SafetyCaseSchema;
      counts[data.case_type] = (counts[data.case_type] ?? 0) + 1;
      if (data.status === "resolved" || data.status === "closed") {
        resolved += 1;
        const createdAt = timestampValue(data.created_at).toMillis();
        const resolvedAt = timestampValue(data.resolved_at).toMillis();
        totalResolutionMs += Math.max(0, resolvedAt - createdAt);
      }
      if (
        data.case_type === "appeal" &&
        data.decision?.outcome === "reversed"
      ) {
        reversedAppeals += 1;
      }
      if (
        data.status !== "resolved" &&
        data.status !== "closed" &&
        timestampValue(data.target_resolution_at).toMillis() < Date.now()
      ) {
        overdue += 1;
      }
    }
    const day = start.toISOString().slice(0, 10);
    await db.doc(`safety_case_metrics_daily/${day}`).set({
      day,
      counts,
      resolved,
      reversed_appeals: reversedAppeals,
      overdue,
      average_resolution_ms:
        resolved > 0 ? Math.round(totalResolutionMs / resolved) : 0,
      generated_at: Timestamp.now(),
    });
  },
);
