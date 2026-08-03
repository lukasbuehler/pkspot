import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  isSafetyCaseCategory,
  isSafetyCaseSubjectType,
  isSafetyCaseType,
  type SafetyCasePriority,
  type SafetyCaseSchema,
  type SafetyCaseSubjectSchema,
} from "../../src/db/schemas/SafetyCaseSchema";
import {
  SAFETY_CASES,
  SAFETY_CASE_ACCESS_TOKENS,
  SAFETY_CASE_APPEAL_WINDOW_MS,
  SAFETY_CASE_EMAIL_OUTBOX,
  SAFETY_CASE_METADATA_RETENTION_MS,
  SAFETY_CASE_RATE_LIMITS,
  SAFETY_CASE_SESSIONS,
  authorizeSafetyCase,
  caseAccessLink,
  caseAccessTokenDocument,
  caseEmailDocument,
  cleanEmail,
  cleanPath,
  cleanText,
  complexResolutionAt,
  createCaseSession,
  isRecord,
  publicReference,
  publicSafetyCaseView,
  randomToken,
  sha256,
  targetResolutionAt,
} from "./safetyCaseHelpers";

const db = admin.firestore();
const PUBLIC_CALLABLE_OPTIONS = {cors: true, invoker: "public" as const};
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const GUEST_CASES_PER_HOUR = 12;
const AUTHENTICATED_CASES_PER_HOUR = 30;
const NETWORK_CASES_PER_HOUR = 60;
const CASES_PER_TARGET_PER_DAY = 5;
const CASES_PER_EMAIL_PER_HOUR = 8;

interface RateLimit {
  key: string;
  maximum: number;
  expiresAt: Timestamp;
}

const requestIp = (request: {
  rawRequest: {ip?: string; socket?: {remoteAddress?: string | null}};
}): string | undefined => {
  const value =
    request.rawRequest.ip ?? request.rawRequest.socket?.remoteAddress;
  return typeof value === "string" && value.length <= 128 ? value : undefined;
};

const header = (
  headers: Record<string, string | string[] | undefined>,
  name: string,
  maximum: number,
): string | undefined => {
  const value = headers[name];
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.length <= maximum ?
    candidate :
    undefined;
};

const rateLimit = (
  namespace: string,
  identity: string,
  windowStart: number,
  maximum: number,
  duration: number,
): RateLimit => ({
  key: sha256(
    "safety-case-rate-limit-v1",
    `${namespace}:${identity}:${windowStart}`,
  ),
  maximum,
  expiresAt: Timestamp.fromMillis(windowStart + duration + DAY_MS),
});

const enforceRateLimits = async (
  transaction: admin.firestore.Transaction,
  limits: RateLimit[],
): Promise<void> => {
  const refs = limits.map((limit) =>
    db.doc(`${SAFETY_CASE_RATE_LIMITS}/${limit.key}`),
  );
  const snapshots = await transaction.getAll(...refs);
  for (const [index, limit] of limits.entries()) {
    const ref = refs[index];
    const current = snapshots[index].data()?.["count"];
    const count = typeof current === "number" ? current : 0;
    if (count >= limit.maximum) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many cases were submitted. Please try again later.",
      );
    }
    transaction.set(
      ref,
      {
        count: count + 1,
        updated_at: Timestamp.now(),
        expires_at: limit.expiresAt,
      },
      {merge: true},
    );
  }
};

const priorityForCategory = (
  category: SafetyCaseSchema["category"],
): SafetyCasePriority => {
  if (category === "self_harm_or_suicide") return "immediate";
  if (
    category === "child_safety" ||
    category === "illegal_content" ||
    category === "sexual_content"
  ) {
    return "urgent";
  }
  return "standard";
};

const cleanLocale = (value: unknown): string => {
  const locale = cleanText(value, "locale", 20);
  return locale && /^[a-z]{2}(?:-[A-Z]{2})?$/u.test(locale) ? locale : "en";
};

const cleanSubject = (value: unknown): SafetyCaseSubjectSchema => {
  if (!isRecord(value) || !isSafetyCaseSubjectType(value["type"])) {
    throw new HttpsError("invalid-argument", "Invalid case subject.");
  }
  const path = cleanPath(value["path"], "subject.path");
  const ownerUid = cleanText(value["owner_uid"], "subject.owner_uid", 128);
  const label = cleanText(value["label"], "subject.label", 240);
  const mediaSrc = cleanText(value["media_src"], "subject.media_src", 2048);
  const storagePath = cleanPath(
    value["storage_path"],
    "subject.storage_path",
  );
  return {
    type: value["type"],
    ...(path ? {path} : {}),
    ...(ownerUid ? {owner_uid: ownerUid} : {}),
    ...(label ? {label} : {}),
    ...(mediaSrc ? {media_src: mediaSrc} : {}),
    ...(storagePath ? {storage_path: storagePath} : {}),
  };
};

const reporterSnapshot = async (
  uid: string | undefined,
): Promise<{
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  profilePicture?: string;
}> => {
  if (!uid) return {emailVerified: false};
  const [authResult, profileResult] = await Promise.allSettled([
    admin.auth().getUser(uid),
    db.doc(`users/${uid}`).get(),
  ]);
  const authUser =
    authResult.status === "fulfilled" ? authResult.value : undefined;
  const profile =
    profileResult.status === "fulfilled" ?
      profileResult.value.data() :
      undefined;
  const email =
    typeof authUser?.email === "string" ? authUser.email.toLowerCase() : undefined;
  const displayName =
    typeof profile?.["display_name"] === "string" ?
      profile["display_name"] :
      typeof authUser?.displayName === "string" ?
        authUser.displayName :
        undefined;
  const profilePicture =
    typeof profile?.["profile_picture"] === "string" ?
      profile["profile_picture"] :
      undefined;
  return {
    ...(email ? {email} : {}),
    emailVerified: Boolean(authUser?.emailVerified),
    ...(displayName ? {displayName} : {}),
    ...(profilePicture ? {profilePicture} : {}),
  };
};

const acknowledgementCopy = (
  reference: string,
  accessLink: string | undefined,
): {subject: string; text: string; html: string} => {
  const linkText = accessLink ?
    `\n\nVerify your email and view the case: ${accessLink}` :
    "";
  const linkHtml = accessLink ?
    `<p><a href="${accessLink}">Verify your email and view this case</a></p>` :
    "";
  return {
    subject: `PK Spot safety case ${reference}`,
    text:
      `We received your case. Your reference is ${reference}. ` +
      "We aim to resolve ordinary cases within 7 days, appeals within 14 " +
      `days, and complex cases within 30 days.${linkText}`,
    html:
      `<p>We received your case. Your reference is <strong>${reference}</strong>.</p>` +
      "<p>We aim to resolve ordinary cases within 7 days, appeals within " +
      `14 days, and complex cases within 30 days.</p>${linkHtml}`,
  };
};

export const submitSafetyCase = onCall(
  PUBLIC_CALLABLE_OPTIONS,
  async (request) => {
    const input = isRecord(request.data) ? request.data : {};
    if (!isSafetyCaseType(input["case_type"]) || input["case_type"] === "appeal") {
      throw new HttpsError(
        "invalid-argument",
        "Use the appeal endpoint to appeal a decision.",
      );
    }
    if (!isSafetyCaseCategory(input["category"])) {
      throw new HttpsError("invalid-argument", "Invalid case category.");
    }
    const caseType = input["case_type"];
    const category = input["category"];
    const summary = cleanText(input["summary"], "summary", 160, true);
    const description = cleanText(
      input["description"],
      "description",
      4000,
      true,
    );
    if (!summary || !description) {
      throw new HttpsError("invalid-argument", "Case details are required.");
    }
    const subject = cleanSubject(input["subject"]);
    const locale = cleanLocale(input["locale"]);
    const uid = request.auth?.uid;
    const reporter = await reporterSnapshot(uid);
    const submittedEmail = cleanEmail(input["contact_email"]);
    const contactEmail = reporter.email ?? submittedEmail;
    if (!uid && !contactEmail) {
      throw new HttpsError(
        "invalid-argument",
        "A contact email is required when submitting without an account.",
      );
    }

    const ipAddress = requestIp(request);
    const userAgent = header(request.rawRequest.headers, "user-agent", 500);
    const origin = header(request.rawRequest.headers, "origin", 300);
    const appId = request.app?.appId;
    const networkIdentity = sha256(
      "safety-case-network-v1",
      ipAddress ?? `${appId ?? "no-app"}:${userAgent ?? "no-user-agent"}`,
    );
    const reporterIdentity = uid ? `uid:${uid}` : `network:${networkIdentity}`;
    const targetIdentity = sha256(
      "safety-case-target-v1",
      subject.path ?? subject.media_src ?? `${subject.type}:${subject.label ?? ""}`,
    );
    const nowMs = Date.now();
    const hourStart = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
    const dayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
    const limits = [
      rateLimit(
        "reporter-hour",
        reporterIdentity,
        hourStart,
        uid ? AUTHENTICATED_CASES_PER_HOUR : GUEST_CASES_PER_HOUR,
        HOUR_MS,
      ),
      rateLimit(
        "reporter-target-day",
        `${reporterIdentity}:${targetIdentity}`,
        dayStart,
        CASES_PER_TARGET_PER_DAY,
        DAY_MS,
      ),
      ...(uid ?
        [
          rateLimit(
            "network-hour",
            networkIdentity,
            hourStart,
            NETWORK_CASES_PER_HOUR,
            HOUR_MS,
          ),
        ] :
        []),
      ...(contactEmail ?
        [
          rateLimit(
            "contact-email-hour",
            sha256(
              "safety-case-contact-email-v1",
              contactEmail.toLowerCase(),
            ),
            hourStart,
            CASES_PER_EMAIL_PER_HOUR,
            HOUR_MS,
          ),
        ] :
        []),
    ];

    const now = Timestamp.now();
    const caseRef = db.collection(SAFETY_CASES).doc();
    const reference = publicReference();
    const accessToken =
      contactEmail && !reporter.emailVerified ? randomToken() : undefined;
    const acknowledgement =
      contactEmail ?
        acknowledgementCopy(
          reference,
          accessToken ?
            caseAccessLink(locale, reference, accessToken) :
            undefined,
        ) :
        undefined;
    const caseData: SafetyCaseSchema = {
      case_type: caseType,
      public_reference: reference,
      category,
      priority: priorityForCategory(category),
      status: "received",
      subject,
      summary,
      description,
      source_paths: [],
      ...(uid ? {submitter_uid: uid} : {}),
      ...(subject.owner_uid ? {subject_uid: subject.owner_uid} : {}),
      contact_email_verified: reporter.emailVerified,
      locale,
      acknowledged_at: now,
      target_resolution_at: targetResolutionAt(caseType, nowMs),
      complex_resolution_at: complexResolutionAt(nowMs),
      created_at: now,
      updated_at: now,
    };

    await db.runTransaction(async (transaction) => {
      await enforceRateLimits(transaction, limits);
      transaction.create(caseRef, caseData);
      transaction.create(caseRef.collection("private").doc("intake"), {
        ...(uid ? {submitter_uid: uid} : {}),
        ...(contactEmail ? {contact_email: contactEmail} : {}),
        contact_email_verified: reporter.emailVerified,
        ...(reporter.displayName ?
          {reporter_display_name: reporter.displayName} :
          {}),
        ...(reporter.profilePicture ?
          {reporter_profile_picture: reporter.profilePicture} :
          {}),
        ...(ipAddress ? {ip_address: ipAddress} : {}),
        ip_hash: networkIdentity,
        ...(userAgent ? {user_agent: userAgent} : {}),
        ...(origin ? {origin} : {}),
        ...(appId ? {app_id: appId} : {}),
        app_check: Boolean(request.app),
        authenticated: Boolean(uid),
        metadata_expires_at: Timestamp.fromMillis(
          nowMs + SAFETY_CASE_METADATA_RETENTION_MS,
        ),
      });
      transaction.create(caseRef.collection("events").doc(), {
        type: "case_created",
        visibility: "participants",
        message: "PK Spot received this case.",
        created_at: now,
      });
      if (contactEmail && acknowledgement) {
        if (accessToken) {
          transaction.create(
            db.doc(
              `${SAFETY_CASE_ACCESS_TOKENS}/` +
                sha256("safety-case-access-v1", accessToken),
            ),
            caseAccessTokenDocument(
              caseRef.id,
              contactEmail,
              "submitter",
            ),
          );
        }
        transaction.create(
          db.collection(SAFETY_CASE_EMAIL_OUTBOX).doc(),
          caseEmailDocument(
            caseRef.id,
            contactEmail,
            "case_acknowledgement",
            acknowledgement.subject,
            acknowledgement.text,
            acknowledgement.html,
          ),
        );
      }
    });

    return {
      case_id: caseRef.id,
      public_reference: reference,
      acknowledged_at: now.toDate().toISOString(),
      target_resolution_at:
        (caseData.target_resolution_at as Timestamp).toDate().toISOString(),
      complex_resolution_at:
        (caseData.complex_resolution_at as Timestamp).toDate().toISOString(),
      email_verification_required: Boolean(contactEmail && !reporter.emailVerified),
    };
  },
);

export const exchangeSafetyCaseAccessLink = onCall(
  PUBLIC_CALLABLE_OPTIONS,
  async (request) => {
    const input = isRecord(request.data) ? request.data : {};
    const accessToken = cleanText(
      input["access_token"],
      "access_token",
      160,
      true,
    );
    if (!accessToken) {
      throw new HttpsError("invalid-argument", "access_token is required.");
    }
    const accessRef = db.doc(
      `${SAFETY_CASE_ACCESS_TOKENS}/` +
        sha256("safety-case-access-v1", accessToken),
    );
    const sessionToken = randomToken();
    const sessionRef = db.doc(
      `${SAFETY_CASE_SESSIONS}/` +
        sha256("safety-case-session-v1", sessionToken),
    );
    let caseId = "";
    let publicReferenceValue = "";
    await db.runTransaction(async (transaction) => {
      const access = await transaction.get(accessRef);
      const data = access.data();
      const expiresAt = data?.["expires_at"];
      if (
        !access.exists ||
        !data ||
        data?.["consumed_at"] ||
        !(expiresAt instanceof Timestamp) ||
        expiresAt.toMillis() <= Date.now() ||
        typeof data["case_id"] !== "string" ||
        (data["role"] !== "submitter" && data["role"] !== "subject")
      ) {
        throw new HttpsError(
          "permission-denied",
          "This case access link is invalid or expired.",
        );
      }
      const validData = data as admin.firestore.DocumentData;
      caseId = validData["case_id"];
      const caseRef = db.doc(`${SAFETY_CASES}/${caseId}`);
      const caseSnapshot = await transaction.get(caseRef);
      if (!caseSnapshot.exists) {
        throw new HttpsError("not-found", "Safety case not found.");
      }
      publicReferenceValue = String(
        caseSnapshot.data()?.["public_reference"] ?? "",
      );
      const role = validData["role"] as "submitter" | "subject";
      transaction.update(accessRef, {consumed_at: Timestamp.now()});
      transaction.create(sessionRef, {
        case_id: caseId,
        role,
        created_at: Timestamp.now(),
        expires_at: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
        revoked: false,
      });
      if (role === "submitter") {
        const wasVerified =
          caseSnapshot.data()?.["contact_email_verified"] === true;
        transaction.set(
          caseRef,
          {
            contact_email_verified: true,
            updated_at: Timestamp.now(),
          },
          {merge: true},
        );
        transaction.set(
          caseRef.collection("private").doc("intake"),
          {contact_email_verified: true},
          {merge: true},
        );
        if (!wasVerified) {
          transaction.create(caseRef.collection("events").doc(), {
            type: "contact_verified",
            visibility: "submitter",
            message: "The contact email was verified.",
            created_at: Timestamp.now(),
          });
        }
      }
    });
    const authorized = await authorizeSafetyCase(
      publicReferenceValue,
      undefined,
      sessionToken,
    );
    return {
      session_token: sessionToken,
      expires_at: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      case: await publicSafetyCaseView(authorized),
    };
  },
);

export const getSafetyCaseView = onCall(
  PUBLIC_CALLABLE_OPTIONS,
  async (request) => {
    const input = isRecord(request.data) ? request.data : {};
    const access = await authorizeSafetyCase(
      input["public_reference"],
      request.auth?.uid,
      input["session_token"],
    );
    return publicSafetyCaseView(access);
  },
);

export const addSafetyCaseMessage = onCall(
  PUBLIC_CALLABLE_OPTIONS,
  async (request) => {
    const input = isRecord(request.data) ? request.data : {};
    const access = await authorizeSafetyCase(
      input["public_reference"],
      request.auth?.uid,
      input["session_token"],
    );
    const message = cleanText(input["message"], "message", 4000, true);
    if (!message) {
      throw new HttpsError("invalid-argument", "message is required.");
    }
    if (access.role === "staff") {
      throw new HttpsError(
        "invalid-argument",
        "Use the administrator case endpoint for staff messages.",
      );
    }
    await db.runTransaction(async (transaction) => {
      transaction.create(access.caseRef.collection("events").doc(), {
        type: "message",
        visibility: access.role,
        participant_role: access.role,
        message,
        created_at: Timestamp.now(),
      });
      transaction.update(access.caseRef, {
        status:
          access.caseData.status === "awaiting_information" ?
            "under_review" :
            access.caseData.status,
        updated_at: Timestamp.now(),
      });
    });
    return {ok: true};
  },
);

export const appealSafetyCaseDecision = onCall(
  PUBLIC_CALLABLE_OPTIONS,
  async (request) => {
    const input = isRecord(request.data) ? request.data : {};
    const access = await authorizeSafetyCase(
      input["public_reference"],
      request.auth?.uid,
      input["session_token"],
    );
    if (access.role === "staff") {
      throw new HttpsError(
        "invalid-argument",
        "Administrators cannot submit participant appeals.",
      );
    }
    const appellantRole = access.role;
    const reason = cleanText(input["reason"], "reason", 4000, true);
    if (!reason || !access.caseData.decision) {
      throw new HttpsError(
        "failed-precondition",
        "Only a decided case can be appealed.",
      );
    }
    const resolvedAt = access.caseData.resolved_at;
    if (
      !(resolvedAt instanceof Timestamp) ||
      resolvedAt.toMillis() + SAFETY_CASE_APPEAL_WINDOW_MS <= Date.now()
    ) {
      throw new HttpsError("failed-precondition", "The appeal window has closed.");
    }
    const existingAppealId =
      access.caseData.appeal_case_ids?.[appellantRole] ??
      (appellantRole === "submitter" ?
        access.caseData.appeal_case_id :
        undefined);
    if (existingAppealId) {
      const existing = await db.doc(
        `${SAFETY_CASES}/${existingAppealId}`,
      ).get();
      const session =
        request.auth?.uid ?
          undefined :
          await createCaseSession(existing.id, "submitter");
      return {
        case_id: existing.id,
        public_reference: existing.data()?.["public_reference"],
        already_exists: true,
        ...(session ?
          {
            session_token: session.token,
            session_expires_at: session.expiresAt.toDate().toISOString(),
          } :
          {}),
      };
    }

    const now = Timestamp.now();
    const appealRef = db.collection(SAFETY_CASES).doc();
    const reference = publicReference();
    const rootCaseId = access.caseData.root_case_id ?? access.caseRef.id;
    const parentIntake = await access.caseRef
      .collection("private")
      .doc("intake")
      .get();
    const parentIntakeData = parentIntake.data();
    const appellantProfile =
      appellantRole === "subject" ?
        await reporterSnapshot(request.auth?.uid) :
        undefined;
    const appellantUid =
      appellantRole === "submitter" ?
        access.caseData.submitter_uid :
        request.auth?.uid ?? access.caseData.subject_uid;
    const contactEmail =
      appellantRole === "submitter" ?
        parentIntakeData?.["contact_email"] :
        appellantProfile?.email;
    const contactEmailVerified =
      appellantRole === "submitter" ?
        access.caseData.contact_email_verified :
        Boolean(appellantProfile?.emailVerified);
    const appealIntake =
      appellantRole === "submitter" && parentIntakeData ?
        parentIntakeData :
        {
          ...(appellantUid ? {submitter_uid: appellantUid} : {}),
          ...(contactEmail ? {contact_email: contactEmail} : {}),
          contact_email_verified: contactEmailVerified,
          ...(appellantProfile?.displayName ?
            {reporter_display_name: appellantProfile.displayName} :
            {}),
          ...(appellantProfile?.profilePicture ?
            {reporter_profile_picture: appellantProfile.profilePicture} :
            {}),
          app_check: Boolean(request.app),
          authenticated: Boolean(request.auth?.uid),
          metadata_expires_at: Timestamp.fromMillis(
            now.toMillis() + SAFETY_CASE_METADATA_RETENTION_MS,
          ),
        };
    const accessToken =
      typeof contactEmail === "string" ? randomToken() : undefined;
    const acknowledgement =
      typeof contactEmail === "string" && accessToken ?
        acknowledgementCopy(
          reference,
          caseAccessLink(
            access.caseData.locale,
            reference,
            accessToken,
          ),
        ) :
        undefined;
    const appeal: SafetyCaseSchema = {
      case_type: "appeal",
      public_reference: reference,
      category:
        access.caseData.category === "automated_media_decision" ||
        access.caseData.category === "age_assurance_decision" ?
          access.caseData.category :
          "content_or_account_decision",
      priority: "standard",
      status: "received",
      subject: access.caseData.subject,
      summary: `Appeal of ${access.caseData.public_reference}`,
      description: reason,
      source_paths: [...access.caseData.source_paths],
      parent_case_id: access.caseRef.id,
      root_case_id: rootCaseId,
      appellant_role: appellantRole,
      ...(appellantUid ? {submitter_uid: appellantUid} : {}),
      contact_email_verified: contactEmailVerified,
      locale: access.caseData.locale,
      acknowledged_at: now,
      target_resolution_at: targetResolutionAt("appeal", now.toMillis()),
      complex_resolution_at: complexResolutionAt(now.toMillis()),
      created_at: now,
      updated_at: now,
    };

    await db.runTransaction(async (transaction) => {
      const freshParent = await transaction.get(access.caseRef);
      const freshData = freshParent.data() as SafetyCaseSchema | undefined;
      const freshAppealId =
        freshData?.appeal_case_ids?.[appellantRole] ??
        (appellantRole === "submitter" ?
          freshData?.appeal_case_id :
          undefined);
      if (freshAppealId) {
        throw new HttpsError(
          "already-exists",
          "An appeal already exists for this decision.",
        );
      }
      transaction.create(appealRef, appeal);
      transaction.create(appealRef.collection("events").doc(), {
        type: "case_created",
        visibility: "participants",
        message: "PK Spot received this appeal.",
        created_at: now,
      });
      transaction.create(appealRef.collection("events").doc(), {
        type: "appeal_created",
        visibility: "participants",
        linked_case_id: access.caseRef.id,
        created_at: now,
      });
      transaction.create(access.caseRef.collection("events").doc(), {
        type: "appeal_created",
        visibility: appellantRole,
        linked_case_id: appealRef.id,
        created_at: now,
      });
      transaction.create(
        appealRef.collection("private").doc("intake"),
        appealIntake,
      );
      if (accessToken && typeof contactEmail === "string" && acknowledgement) {
        transaction.create(
          db.doc(
            `${SAFETY_CASE_ACCESS_TOKENS}/` +
              sha256("safety-case-access-v1", accessToken),
          ),
          caseAccessTokenDocument(
            appealRef.id,
            contactEmail,
            "submitter",
          ),
        );
        transaction.create(
          db.collection(SAFETY_CASE_EMAIL_OUTBOX).doc(),
          caseEmailDocument(
            appealRef.id,
            contactEmail,
            "appeal_acknowledgement",
            acknowledgement.subject,
            acknowledgement.text,
            acknowledgement.html,
          ),
        );
      }
      transaction.update(access.caseRef, {
        [`appeal_case_ids.${appellantRole}`]: appealRef.id,
        ...(appellantRole === "submitter" ?
          {appeal_case_id: appealRef.id} :
          {}),
        updated_at: now,
      });
    });

    const session =
      request.auth?.uid ?
        undefined :
        await createCaseSession(appealRef.id, "submitter");
    return {
      case_id: appealRef.id,
      public_reference: reference,
      acknowledged_at: now.toDate().toISOString(),
      ...(session ?
        {
          session_token: session.token,
          session_expires_at: session.expiresAt.toDate().toISOString(),
        } :
        {}),
    };
  },
);

export const cleanupSafetyCaseSecurityMetadata = onSchedule(
  "every day 02:40",
  async () => {
    const now = Timestamp.now();
    const [intakes, accessTokens, sessions, limits] = await Promise.all([
      db
        .collectionGroup("private")
        .where("metadata_expires_at", "<=", now)
        .limit(200)
        .get(),
      db
        .collection(SAFETY_CASE_ACCESS_TOKENS)
        .where("expires_at", "<=", now)
        .limit(250)
        .get(),
      db
        .collection(SAFETY_CASE_SESSIONS)
        .where("expires_at", "<=", now)
        .limit(250)
        .get(),
      db
        .collection(SAFETY_CASE_RATE_LIMITS)
        .where("expires_at", "<=", now)
        .limit(250)
        .get(),
    ]);
    const batch = db.batch();
    for (const intake of intakes.docs) {
      batch.update(intake.ref, {
        ip_address: admin.firestore.FieldValue.delete(),
        ip_hash: admin.firestore.FieldValue.delete(),
        user_agent: admin.firestore.FieldValue.delete(),
        origin: admin.firestore.FieldValue.delete(),
        app_id: admin.firestore.FieldValue.delete(),
        metadata_expires_at: admin.firestore.FieldValue.delete(),
      });
    }
    [...accessTokens.docs, ...sessions.docs, ...limits.docs].forEach((document) =>
      batch.delete(document.ref),
    );
    await batch.commit();
    console.info("Cleaned expired safety-case security metadata", {
      intakesMinimised: intakes.size,
      accessTokensDeleted: accessTokens.size,
      sessionsDeleted: sessions.size,
      rateLimitsDeleted: limits.size,
    });
  },
);
