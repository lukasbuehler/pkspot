import {createHash, randomBytes} from "node:crypto";
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import type {
  SafetyCaseEventSchema,
  SafetyCasePublicView,
  SafetyCaseReviewerSchema,
  SafetyCaseSchema,
} from "../../src/db/schemas/SafetyCaseSchema";

export const SAFETY_CASES = "safety_cases";
export const SAFETY_CASE_ACCESS_TOKENS = "safety_case_access_tokens";
export const SAFETY_CASE_SESSIONS = "safety_case_sessions";
export const SAFETY_CASE_EMAIL_OUTBOX = "safety_case_email_outbox";
export const SAFETY_CASE_RATE_LIMITS = "safety_case_rate_limits";
export const SAFETY_CASE_HOLDS = "safety_case_holds";
export const SAFETY_CASE_APPEAL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
export const SAFETY_CASE_METADATA_RETENTION_MS =
  90 * 24 * 60 * 60 * 1000;

const db = admin.firestore();
const PUBLIC_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type SafetyCaseParticipantRole = "submitter" | "subject" | "staff";

export interface SafetyCaseAccess {
  caseRef: admin.firestore.DocumentReference;
  caseData: SafetyCaseSchema;
  role: SafetyCaseParticipantRole;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const cleanText = (
  value: unknown,
  name: string,
  maximum: number,
  required = false,
): string | undefined => {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new HttpsError("invalid-argument", `${name} is required.`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${name} must be a string.`);
  }
  const cleaned = Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127) ?
        " " :
        character;
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
  if (!cleaned || cleaned.length > maximum) {
    throw new HttpsError(
      "invalid-argument",
      `${name} must contain at most ${maximum} characters.`,
    );
  }
  return cleaned;
};

export const cleanEmail = (value: unknown): string | undefined => {
  const email = cleanText(value, "contact_email", 240)?.toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new HttpsError(
      "invalid-argument",
      "contact_email must be a valid email address.",
    );
  }
  return email;
};

export const cleanPath = (
  value: unknown,
  name: string,
): string | undefined => {
  const path = cleanText(value, name, 500);
  if (path && (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u.test(path))) {
    throw new HttpsError("invalid-argument", `${name} is invalid.`);
  }
  return path;
};

export const sha256 = (namespace: string, value: string): string =>
  createHash("sha256").update(`${namespace}:${value}`).digest("hex");

export const randomToken = (): string => randomBytes(32).toString("base64url");

export const publicReference = (): string => {
  const year = new Date().getUTCFullYear();
  const suffix = Array.from(randomBytes(8))
    .map((byte) => PUBLIC_REFERENCE_ALPHABET[byte % PUBLIC_REFERENCE_ALPHABET.length])
    .join("");
  return `PKS-${year}-${suffix}`;
};

export const targetResolutionAt = (
  caseType: SafetyCaseSchema["case_type"],
  now = Date.now(),
): Timestamp =>
  Timestamp.fromMillis(
    now + (caseType === "appeal" ? 14 : 7) * 24 * 60 * 60 * 1000,
  );

export const complexResolutionAt = (now = Date.now()): Timestamp =>
  Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000);

export const assertAdmin = async (
  uid: string | undefined,
): Promise<SafetyCaseReviewerSchema> => {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }
  const displayName = cleanText(
    user.data()?.["display_name"],
    "display_name",
    160,
  );
  return {
    uid,
    ...(displayName ? {display_name: displayName} : {}),
  };
};

export const isAdmin = async (uid: string | undefined): Promise<boolean> => {
  if (!uid) return false;
  const user = await db.doc(`users/${uid}`).get();
  return user.data()?.["is_admin"] === true;
};

export const caseByPublicReference = async (
  reference: string,
): Promise<admin.firestore.QueryDocumentSnapshot> => {
  const result = await db
    .collection(SAFETY_CASES)
    .where("public_reference", "==", reference)
    .limit(1)
    .get();
  const document = result.docs[0];
  if (!document) {
    throw new HttpsError("not-found", "Safety case not found.");
  }
  return document;
};

export const authorizeSafetyCase = async (
  publicReferenceValue: unknown,
  uid: string | undefined,
  sessionTokenValue: unknown,
): Promise<SafetyCaseAccess> => {
  const reference = cleanText(
    publicReferenceValue,
    "public_reference",
    32,
    true,
  );
  if (!reference) {
    throw new HttpsError("invalid-argument", "public_reference is required.");
  }
  const caseDocument = await caseByPublicReference(reference);
  const caseData = caseDocument.data() as SafetyCaseSchema;
  if (uid && (await isAdmin(uid))) {
    return {caseRef: caseDocument.ref, caseData, role: "staff"};
  }
  if (uid && uid === caseData.submitter_uid) {
    return {caseRef: caseDocument.ref, caseData, role: "submitter"};
  }
  if (uid && uid === caseData.subject_uid) {
    return {caseRef: caseDocument.ref, caseData, role: "subject"};
  }

  const sessionToken = cleanText(
    sessionTokenValue,
    "session_token",
    160,
  );
  if (!sessionToken) {
    throw new HttpsError("permission-denied", "Case access is required.");
  }
  const sessionRef = db.doc(
    `${SAFETY_CASE_SESSIONS}/${sha256("safety-case-session-v1", sessionToken)}`,
  );
  const session = await sessionRef.get();
  const sessionData = session.data();
  const expiresAt = sessionData?.["expires_at"];
  if (
    !session.exists ||
    sessionData?.["case_id"] !== caseDocument.id ||
    sessionData?.["revoked"] === true ||
    !(expiresAt instanceof Timestamp) ||
    expiresAt.toMillis() <= Date.now() ||
    (sessionData?.["role"] !== "submitter" &&
      sessionData?.["role"] !== "subject")
  ) {
    throw new HttpsError("permission-denied", "Case access has expired.");
  }
  await sessionRef.set({last_used_at: Timestamp.now()}, {merge: true});
  return {
    caseRef: caseDocument.ref,
    caseData,
    role: sessionData["role"] as "submitter" | "subject",
  };
};

const toIso = (value: unknown): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(0).toISOString();
};

export const publicSafetyCaseView = async (
  access: SafetyCaseAccess,
): Promise<SafetyCasePublicView> => {
  const subjectView =
    access.role === "subject" ?
      {
        type: access.caseData.subject.type,
      } :
      access.caseData.subject;
  const visibility =
    access.role === "staff" ?
      null :
      access.role === "submitter" ?
        new Set(["submitter", "participants"]) :
        new Set(["subject", "participants"]);
  const events = await access.caseRef
    .collection("events")
    .orderBy("created_at", "asc")
    .limit(250)
    .get();
  const visibleEvents = events.docs
    .filter((event) => {
      const value = event.data()["visibility"];
      return visibility === null || visibility.has(String(value));
    })
    .map((event) => {
      const data = event.data() as SafetyCaseEventSchema;
      return {
        id: event.id,
        type: data.type,
        ...(data.message ? {message: data.message} : {}),
        created_at: toIso(data.created_at),
        ...(data.participant_role ?
          {participant_role: data.participant_role} :
          {}),
      };
    });
  const decision = access.caseData.decision;
  const parentReference = access.caseData.parent_case_id ?
    (
      await db.doc(
        `${SAFETY_CASES}/${access.caseData.parent_case_id}`,
      ).get()
    ).data()?.["public_reference"] :
    undefined;
  const decidedAt =
    decision && "decided_at" in decision ? toIso(decision.decided_at) : "";
  const resolvedAt = access.caseData.resolved_at;
  const appealDeadline =
    resolvedAt instanceof Timestamp ?
      resolvedAt.toMillis() + SAFETY_CASE_APPEAL_WINDOW_MS :
      0;
  const roleAppealId =
    access.role === "staff" ?
      undefined :
      access.caseData.appeal_case_ids?.[access.role] ??
        (access.role === "submitter" ?
          access.caseData.appeal_case_id :
          undefined);

  return {
    public_reference: access.caseData.public_reference,
    case_type: access.caseData.case_type,
    category: access.caseData.category,
    priority: access.caseData.priority,
    status: access.caseData.status,
    subject: subjectView,
    summary:
      access.role === "subject" ?
        "A PK Spot safety case concerns this content or account." :
        access.caseData.summary,
    description:
      access.role === "subject" ?
        "Reporter-submitted details are confidential. Moderator messages and " +
          "the public reason for any decision appear in this timeline." :
        access.caseData.description,
    acknowledged_at: toIso(access.caseData.acknowledged_at),
    target_resolution_at: toIso(access.caseData.target_resolution_at),
    complex_resolution_at: toIso(access.caseData.complex_resolution_at),
    created_at: toIso(access.caseData.created_at),
    updated_at: toIso(access.caseData.updated_at),
    ...(typeof parentReference === "string" ?
      {parent_public_reference: parentReference} :
      {}),
    ...(decision ?
      {
        decision: {
          type: decision.type,
          outcome: decision.outcome,
          public_reason: decision.public_reason,
          ...(decision.policy_basis ?
            {policy_basis: decision.policy_basis} :
            {}),
          decided_at: decidedAt,
          ...(decision.restored_at ?
            {restored_at: toIso(decision.restored_at)} :
            {}),
        },
      } :
      {}),
    events: visibleEvents,
    can_appeal:
      access.role !== "staff" &&
      access.caseData.case_type !== "appeal" &&
      Boolean(decision) &&
      appealDeadline > Date.now() &&
      !roleAppealId,
  };
};

export const queueCaseEmail = async (
  caseId: string,
  to: string,
  template: string,
  subject: string,
  text: string,
  html: string,
): Promise<void> => {
  await db.collection(SAFETY_CASE_EMAIL_OUTBOX).add(caseEmailDocument(
    caseId,
    to,
    template,
    subject,
    text,
    html,
  ));
};

export const caseEmailDocument = (
  caseId: string,
  to: string,
  template: string,
  subject: string,
  text: string,
  html: string,
): admin.firestore.DocumentData => ({
    to: [to],
    message: {subject, text, html},
    case_id: caseId,
    template,
    created_at: Timestamp.now(),
    delivery: {state: "PENDING"},
  });

export const caseAccessTokenDocument = (
  caseId: string,
  email: string,
  role: "submitter" | "subject",
): admin.firestore.DocumentData => ({
  case_id: caseId,
  email_hash: sha256("safety-case-email-v1", email.toLowerCase()),
  role,
  created_at: Timestamp.now(),
  expires_at: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
});

export const caseAccessLink = (
  locale: string,
  reference: string,
  token: string,
): string => {
  const safeLocale = /^[a-z]{2}(?:-[A-Z]{2})?$/u.test(locale) ? locale : "en";
  return `https://pkspot.app/${safeLocale}/safety/cases/` +
    `${encodeURIComponent(reference)}?access=${encodeURIComponent(token)}`;
};

export const createCaseAccessToken = async (
  caseId: string,
  email: string,
  role: "submitter" | "subject",
): Promise<string> => {
  const token = randomToken();
  await db.doc(
    `${SAFETY_CASE_ACCESS_TOKENS}/` +
      sha256("safety-case-access-v1", token),
  ).create(caseAccessTokenDocument(caseId, email, role));
  return token;
};

export const createCaseSession = async (
  caseId: string,
  role: "submitter" | "subject",
): Promise<{token: string; expiresAt: Timestamp}> => {
  const token = randomToken();
  const expiresAt = Timestamp.fromMillis(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  );
  await db.doc(
    `${SAFETY_CASE_SESSIONS}/` +
      sha256("safety-case-session-v1", token),
  ).create({
    case_id: caseId,
    role,
    created_at: Timestamp.now(),
    expires_at: expiresAt,
    revoked: false,
  });
  return {token, expiresAt};
};

export const writeCaseEvent = async (
  caseRef: admin.firestore.DocumentReference,
  event: Omit<SafetyCaseEventSchema, "created_at">,
): Promise<void> => {
  await caseRef.collection("events").add({
    ...event,
    created_at: Timestamp.now(),
  });
};

export const legacyCaseId = (sourcePath: string): string =>
  `legacy_${sha256("safety-case-legacy-v1", sourcePath).slice(0, 40)}`;
