import {basename} from "node:path";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  isSafetyCaseDecisionType,
  isSafetyCaseOutcome,
  isSafetyCaseStatus,
  type SafetyCaseDecisionSchema,
  type SafetyCaseDecisionType,
  type SafetyCaseReviewerSchema,
  type SafetyCaseSchema,
  type SafetyCaseStatus,
} from "../../src/db/schemas/SafetyCaseSchema";
import {DEFAULT_STORAGE_BUCKET} from "./storageBucket";
import {
  SAFETY_CASES,
  SAFETY_CASE_ACCESS_TOKENS,
  SAFETY_CASE_EMAIL_OUTBOX,
  SAFETY_CASE_HOLDS,
  assertAdmin,
  caseAccessLink,
  caseAccessTokenDocument,
  caseByPublicReference,
  caseEmailDocument,
  cleanPath,
  cleanText,
  createCaseAccessToken,
  isRecord,
  publicSafetyCaseView,
  queueCaseEmail,
  randomToken,
  sha256,
  type SafetyCaseParticipantRole,
  writeCaseEvent,
} from "./safetyCaseHelpers";

const db = admin.firestore();
const ADMIN_CALLABLE_OPTIONS = {enforceAppCheck: true};

type HoldKind = "media" | "spot" | "profile" | "account" | "warning";

interface StoredTreeDocument {
  original_path: string;
  data: admin.firestore.DocumentData;
}

const timestampMillis = (value: unknown): number =>
  value instanceof Timestamp ? value.toMillis() : 0;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

const caseSummary = (
  document: admin.firestore.QueryDocumentSnapshot,
): Record<string, unknown> => {
  const data = document.data() as SafetyCaseSchema;
  return {
    id: document.id,
    public_reference: data.public_reference,
    case_type: data.case_type,
    category: data.category,
    priority: data.priority,
    status: data.status,
    subject: data.subject,
    summary: data.summary,
    contact_email_verified: data.contact_email_verified,
    acknowledged_at: timestampMillis(data.acknowledged_at),
    target_resolution_at: timestampMillis(data.target_resolution_at),
    complex_resolution_at: timestampMillis(data.complex_resolution_at),
    created_at: timestampMillis(data.created_at),
    updated_at: timestampMillis(data.updated_at),
    ...(data.assigned_to ? {assigned_to: data.assigned_to} : {}),
    ...(data.original_reviewer ?
      {original_reviewer: data.original_reviewer} :
      {}),
    ...(data.appeal_reviewer ?
      {appeal_reviewer: data.appeal_reviewer} :
      {}),
    ...(data.decision ? {decision: data.decision} : {}),
    ...(data.incident_path ? {incident_path: data.incident_path} : {}),
    ...(data.parent_case_id ? {parent_case_id: data.parent_case_id} : {}),
    ...(data.appeal_case_id ? {appeal_case_id: data.appeal_case_id} : {}),
    ...(data.appeal_case_ids ? {appeal_case_ids: data.appeal_case_ids} : {}),
    ...(data.appellant_role ? {appellant_role: data.appellant_role} : {}),
  };
};

const collectFirestoreTree = async (
  root: admin.firestore.DocumentReference,
): Promise<StoredTreeDocument[]> => {
  const collected: StoredTreeDocument[] = [];
  const visit = async (
    document: admin.firestore.DocumentReference,
  ): Promise<void> => {
    const snapshot = await document.get();
    if (snapshot.exists) {
      collected.push({
        original_path: document.path,
        data: snapshot.data() ?? {},
      });
    }
    const collections = await document.listCollections();
    for (const collection of collections) {
      const children = await collection.get();
      for (const child of children.docs) {
        await visit(child.ref);
      }
    }
  };
  await visit(root);
  return collected;
};

const storeTree = async (
  holdRef: admin.firestore.DocumentReference,
  documents: StoredTreeDocument[],
): Promise<void> => {
  const writer = db.bulkWriter();
  for (const document of documents) {
    const id = sha256(
      "safety-case-hold-document-v1",
      document.original_path,
    );
    writer.set(holdRef.collection("documents").doc(id), document);
  }
  await writer.close();
};

const deleteTree = async (documents: StoredTreeDocument[]): Promise<void> => {
  const writer = db.bulkWriter();
  [...documents]
    .sort(
      (left, right) =>
        right.original_path.split("/").length -
        left.original_path.split("/").length,
    )
    .forEach((document) => writer.delete(db.doc(document.original_path)));
  await writer.close();
};

const restoreTree = async (
  holdRef: admin.firestore.DocumentReference,
): Promise<void> => {
  const documents = await holdRef.collection("documents").get();
  const writer = db.bulkWriter();
  documents.docs
    .map((document) => document.data() as StoredTreeDocument)
    .sort(
      (left, right) =>
        left.original_path.split("/").length -
        right.original_path.split("/").length,
    )
    .forEach((document) =>
      writer.set(db.doc(document.original_path), document.data),
    );
  await writer.close();
};

const storagePathFromUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  if (!value.startsWith("http")) return value;
  try {
    const url = new URL(value);
    const firebaseMatch = url.pathname.match(/\/o\/([^?]+)/u);
    if (firebaseMatch) return decodeURIComponent(firebaseMatch[1]);
    const directPrefix = `/${DEFAULT_STORAGE_BUCKET}/`;
    if (url.pathname.startsWith(directPrefix)) {
      return decodeURIComponent(url.pathname.slice(directPrefix.length));
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const planStorageHold = async (
  caseId: string,
  sourcePath: string | undefined,
): Promise<
  {original_path: string; hold_path: string} | undefined
> => {
  if (!sourcePath) return undefined;
  const bucket = getStorage().bucket(DEFAULT_STORAGE_BUCKET);
  const source = bucket.file(sourcePath);
  const [exists] = await source.exists();
  if (!exists) return undefined;
  const holdPath =
    `moderation_holds/${caseId}/` +
    `${sha256("safety-case-storage-hold-v1", sourcePath).slice(0, 16)}_` +
    basename(sourcePath);
  return {original_path: sourcePath, hold_path: holdPath};
};

const ensureStorageHoldCopy = async (
  storage: unknown,
): Promise<void> => {
  if (
    !isRecord(storage) ||
    typeof storage["original_path"] !== "string" ||
    typeof storage["hold_path"] !== "string"
  ) {
    return;
  }
  const bucket = getStorage().bucket(DEFAULT_STORAGE_BUCKET);
  const original = bucket.file(storage["original_path"]);
  const held = bucket.file(storage["hold_path"]);
  const [[originalExists], [heldExists]] = await Promise.all([
    original.exists(),
    held.exists(),
  ]);
  if (!heldExists) {
    if (!originalExists) {
      throw new HttpsError(
        "failed-precondition",
        "Media is missing from both its published and held locations.",
      );
    }
    await original.copy(held);
  }
};

const deleteHeldStorageSource = async (
  storage: unknown,
): Promise<void> => {
  if (
    !isRecord(storage) ||
    typeof storage["original_path"] !== "string"
  ) {
    return;
  }
  const original = getStorage()
    .bucket(DEFAULT_STORAGE_BUCKET)
    .file(storage["original_path"]);
  const [exists] = await original.exists();
  if (exists) await original.delete();
};

const restoreStorageHold = async (
  storage: unknown,
): Promise<void> => {
  if (
    !isRecord(storage) ||
    typeof storage["original_path"] !== "string" ||
    typeof storage["hold_path"] !== "string"
  ) {
    return;
  }
  const bucket = getStorage().bucket(DEFAULT_STORAGE_BUCKET);
  const held = bucket.file(storage["hold_path"]);
  const original = bucket.file(storage["original_path"]);
  const [[heldExists], [originalExists]] = await Promise.all([
    held.exists(),
    original.exists(),
  ]);
  if (!heldExists && originalExists) return;
  if (!heldExists) {
    throw new HttpsError(
      "failed-precondition",
      "Held media is missing and cannot be restored.",
    );
  }
  await held.copy(original);
  await held.delete();
};

const finishMediaHold = async (
  holdRef: admin.firestore.DocumentReference,
  holdData: admin.firestore.DocumentData,
): Promise<void> => {
  const targetPath = holdData["target_path"];
  const item = holdData["media_item"];
  if (typeof targetPath !== "string" || !isRecord(item)) {
    throw new HttpsError("failed-precondition", "Media hold is incomplete.");
  }
  const targetRef = db.doc(targetPath);
  const target = await targetRef.get();
  const media = target.data()?.["media"];
  if (!target.exists || !Array.isArray(media)) {
    throw new HttpsError("not-found", "Media target no longer exists.");
  }
  await ensureStorageHoldCopy(holdData["storage"]);
  const filtered = media.filter(
    (candidate) =>
      !isRecord(candidate) || candidate["src"] !== item["src"],
  );
  if (filtered.length !== media.length) {
    await targetRef.update({media: filtered});
  }
  await deleteHeldStorageSource(holdData["storage"]);
  await holdRef.set(
    {state: "held", held_at: Timestamp.now()},
    {merge: true},
  );
};

const applyAccountHold = async (
  holdRef: admin.firestore.DocumentReference,
  holdData: admin.firestore.DocumentData,
  reviewer: SafetyCaseReviewerSchema,
): Promise<void> => {
  const userId = holdData["user_id"];
  const kind = holdData["kind"];
  if (
    typeof userId !== "string" ||
    (kind !== "profile" && kind !== "account")
  ) {
    throw new HttpsError("failed-precondition", "Account hold is incomplete.");
  }
  const userRef = db.doc(`users/${userId}`);
  const publicRef = db.doc(`public_user_profiles/${userId}`);
  await userRef.set(
    {
      moderation_state: {
        status:
          kind === "profile" ?
            "profile_restricted" :
            "contribution_restricted",
        case_id: holdData["case_id"],
        applied_at: Timestamp.now(),
        applied_by: reviewer,
      },
      ...(kind === "profile" ?
        {public_profile_enabled: false, public_search: false} :
        {}),
    },
    {merge: true},
  );
  await publicRef.delete();
  await holdRef.set(
    {state: "held", held_at: Timestamp.now()},
    {merge: true},
  );
};

const finishSpotHold = async (
  holdRef: admin.firestore.DocumentReference,
): Promise<void> => {
  const snapshots = await holdRef.collection("documents").get();
  const documents = snapshots.docs.map(
    (document) => document.data() as StoredTreeDocument,
  );
  if (documents.length === 0) {
    throw new HttpsError("failed-precondition", "Spot hold is incomplete.");
  }
  await deleteTree(documents);
  await holdRef.set(
    {
      state: "held",
      document_count: documents.length,
      held_at: Timestamp.now(),
    },
    {merge: true},
  );
};

const createHold = async (
  caseRef: admin.firestore.DocumentReference,
  caseData: SafetyCaseSchema,
  decisionType: SafetyCaseDecisionType,
  reviewer: SafetyCaseReviewerSchema,
): Promise<string | undefined> => {
  const subject = caseData.subject;
  const holdRef = db.collection(SAFETY_CASE_HOLDS).doc(caseRef.id);
  const existingHold = await holdRef.get();
  const existingData = existingHold.data();
  if (
    existingData?.["state"] === "held" &&
    existingData?.["decision_type"] === decisionType
  ) {
    return holdRef.path;
  }
  if (
    existingData?.["state"] === "preparing" &&
    existingData?.["decision_type"] === decisionType
  ) {
    if (existingData["kind"] === "media") {
      await finishMediaHold(holdRef, existingData);
    } else if (existingData["kind"] === "spot") {
      await finishSpotHold(holdRef);
    } else if (
      existingData["kind"] === "profile" ||
      existingData["kind"] === "account"
    ) {
      await applyAccountHold(holdRef, existingData, reviewer);
    } else {
      throw new HttpsError(
        "failed-precondition",
        "This moderation hold could not be resumed.",
      );
    }
    return holdRef.path;
  }
  const base = {
    case_id: caseRef.id,
    case_reference: caseData.public_reference,
    subject,
    created_at: Timestamp.now(),
    created_by: reviewer,
    decision_type: decisionType,
    state: "preparing",
  };

  if (decisionType === "publish_warning") {
    if (!subject.path || !/^spots\/[^/]+$/u.test(subject.path)) {
      throw new HttpsError(
        "failed-precondition",
        "The case does not identify a Spot.",
      );
    }
    const target = await db.doc(subject.path).get();
    if (!target.exists) {
      throw new HttpsError("not-found", "Spot no longer exists.");
    }
    const data = target.data() ?? {};
    await holdRef.set({
      ...base,
      kind: "warning",
      target_path: subject.path,
      prior_fields: {
        had_public_notice: "public_notice" in data,
        public_notice: data["public_notice"] ?? null,
        had_is_reported: "is_reported" in data,
        is_reported: data["is_reported"] ?? null,
        had_latest_report_at: "latest_report_at" in data,
        latest_report_at: data["latest_report_at"] ?? null,
      },
      state: "held",
      held_at: Timestamp.now(),
    });
    return holdRef.path;
  }

  if (decisionType === "restrict_media") {
    if (!subject.path || !subject.media_src) {
      throw new HttpsError(
        "failed-precondition",
        "The case does not identify target media.",
      );
    }
    const targetRef = db.doc(subject.path);
    const target = await targetRef.get();
    const media = target.data()?.["media"];
    if (!target.exists || !Array.isArray(media)) {
      throw new HttpsError("not-found", "Media target no longer exists.");
    }
    const item = media.find(
      (candidate) =>
        isRecord(candidate) && candidate["src"] === subject.media_src,
    );
    if (!item) {
      throw new HttpsError("not-found", "Reported media is no longer present.");
    }
    const storagePath =
      subject.storage_path ??
      storagePathFromUrl(
        typeof item["src"] === "string" ? item["src"] : undefined,
      );
    const storage = await planStorageHold(caseRef.id, storagePath);
    await holdRef.set({
      ...base,
      kind: "media",
      target_snapshot: target.data(),
      target_path: subject.path,
      media_item: item,
      ...(storage ? {storage} : {}),
    });
    await finishMediaHold(holdRef, (await holdRef.get()).data() ?? {});
    return holdRef.path;
  }

  if (decisionType === "unpublish_spot") {
    if (!subject.path || !/^spots\/[^/]+$/u.test(subject.path)) {
      throw new HttpsError(
        "failed-precondition",
        "The case does not identify a Spot.",
      );
    }
    const spotRef = db.doc(subject.path);
    const documents = await collectFirestoreTree(spotRef);
    if (!documents.some((document) => document.original_path === spotRef.path)) {
      throw new HttpsError("not-found", "Spot no longer exists.");
    }
    await holdRef.set({...base, kind: "spot", root_path: spotRef.path});
    await storeTree(holdRef, documents);
    await finishSpotHold(holdRef);
    return holdRef.path;
  }

  if (
    decisionType === "restrict_profile" ||
    decisionType === "restrict_account"
  ) {
    const userId =
      subject.owner_uid ??
      (subject.path?.match(/^users\/([^/]+)$/u)?.[1]);
    if (!userId) {
      throw new HttpsError(
        "failed-precondition",
        "The case does not identify an account.",
      );
    }
    const userRef = db.doc(`users/${userId}`);
    const publicRef = db.doc(`public_user_profiles/${userId}`);
    const [user, publicProfile] = await Promise.all([
      userRef.get(),
      publicRef.get(),
    ]);
    if (!user.exists) {
      throw new HttpsError("not-found", "Account no longer exists.");
    }
    const kind: HoldKind =
      decisionType === "restrict_profile" ? "profile" : "account";
    await holdRef.set({
      ...base,
      kind,
      user_id: userId,
      user_snapshot: user.data(),
      ...(publicProfile.exists ?
        {public_profile_snapshot: publicProfile.data()} :
        {}),
    });
    await applyAccountHold(holdRef, (await holdRef.get()).data() ?? {}, reviewer);
    return holdRef.path;
  }

  return undefined;
};

const restoreHold = async (
  holdPath: string,
  reviewer: SafetyCaseReviewerSchema,
): Promise<void> => {
  const holdRef = db.doc(holdPath);
  const hold = await holdRef.get();
  const data = hold.data();
  if (!hold.exists || !data) {
    throw new HttpsError("not-found", "Moderation hold not found.");
  }
  if (data["state"] === "restored") return;
  const kind = data["kind"];
  if (kind === "media") {
    const targetPath = data["target_path"];
    const item = data["media_item"];
    if (typeof targetPath !== "string" || !isRecord(item)) {
      throw new HttpsError("failed-precondition", "Media hold is incomplete.");
    }
    await restoreStorageHold(data["storage"]);
    const targetRef = db.doc(targetPath);
    const target = await targetRef.get();
    const media = target.data()?.["media"];
    if (!target.exists || !Array.isArray(media)) {
      throw new HttpsError("not-found", "Media target is missing.");
    }
    if (!media.some((candidate) => isRecord(candidate) &&
      candidate["src"] === item["src"])) {
      await targetRef.update({media: [...media, item]});
    }
  } else if (kind === "spot") {
    await restoreTree(holdRef);
  } else if (kind === "profile" || kind === "account") {
    const userId = data["user_id"];
    if (typeof userId !== "string" || !isRecord(data["user_snapshot"])) {
      throw new HttpsError("failed-precondition", "Account hold is incomplete.");
    }
    const priorState = data["user_snapshot"]["moderation_state"];
    await db.doc(`users/${userId}`).set(
      {
        moderation_state:
          priorState === undefined ? FieldValue.delete() : priorState,
        ...(kind === "profile" ?
          {
            public_profile_enabled:
              data["user_snapshot"]["public_profile_enabled"] ?? false,
            public_search:
              data["user_snapshot"]["public_search"] ?? false,
          } :
          {}),
      },
      {merge: true},
    );
    if (isRecord(data["public_profile_snapshot"])) {
      await db.doc(`public_user_profiles/${userId}`).set(
        data["public_profile_snapshot"],
      );
    }
  } else if (kind === "warning") {
    const targetPath = data["target_path"];
    const prior = data["prior_fields"];
    if (typeof targetPath !== "string" || !isRecord(prior)) {
      throw new HttpsError("failed-precondition", "Warning hold is incomplete.");
    }
    await db.doc(targetPath).set(
      {
        public_notice:
          prior["had_public_notice"] === true ?
            prior["public_notice"] :
            FieldValue.delete(),
        is_reported:
          prior["had_is_reported"] === true ?
            prior["is_reported"] :
            FieldValue.delete(),
        latest_report_at:
          prior["had_latest_report_at"] === true ?
            prior["latest_report_at"] :
            FieldValue.delete(),
      },
      {merge: true},
    );
  } else {
    throw new HttpsError("failed-precondition", "Unsupported hold type.");
  }
  await holdRef.set(
    {
      state: "restored",
      restored_at: Timestamp.now(),
      restored_by: reviewer,
    },
    {merge: true},
  );
};

const contactEmailForCase = async (
  caseRef: admin.firestore.DocumentReference,
): Promise<string | undefined> => {
  const intake = await caseRef.collection("private").doc("intake").get();
  const email = intake.data()?.["contact_email"];
  return typeof email === "string" ? email : undefined;
};

const sendCaseUpdateEmail = async (
  caseRef: admin.firestore.DocumentReference,
  caseData: SafetyCaseSchema,
  role: Exclude<SafetyCaseParticipantRole, "staff">,
  subject: string,
  message: string,
  template: string,
): Promise<void> => {
  const email =
    role === "submitter" ?
      await contactEmailForCase(caseRef) :
      await subjectEmailForCase(caseData);
  if (!email) return;
  const token = await createCaseAccessToken(caseRef.id, email, role);
  const accessLink = caseAccessLink(
    caseData.locale,
    caseData.public_reference,
    token,
  );
  const linkedMessage =
    `${message}\n\nView this private case: ${accessLink}`;
  const linkedHtml =
    `<p>${escapeHtml(message)}</p>` +
    `<p><a href="${accessLink}">View this private case</a></p>`;
  await queueCaseEmail(
    caseRef.id,
    email,
    template,
    subject,
    `${linkedMessage}\n\nCase reference: ${caseData.public_reference}`,
    `${linkedHtml}<p>Case reference: <strong>` +
      `${caseData.public_reference}</strong></p>`,
  );
};

const subjectEmailForCase = async (
  caseData: SafetyCaseSchema,
): Promise<string | undefined> => {
  const uid = caseData.subject.owner_uid;
  if (!uid) return undefined;
  try {
    return (await admin.auth().getUser(uid)).email;
  } catch (error) {
    console.warn("Could not resolve safety-case subject email.", {
      uid,
      error,
    });
    return undefined;
  }
};

export const listSafetyCases = onCall(
  ADMIN_CALLABLE_OPTIONS,
  async (request) => {
    await assertAdmin(request.auth?.uid);
    const input = isRecord(request.data) ? request.data : {};
    const status =
      input["status"] === undefined ? undefined : input["status"];
    if (status !== undefined && !isSafetyCaseStatus(status)) {
      throw new HttpsError("invalid-argument", "Invalid status filter.");
    }
    const limitValue =
      typeof input["limit"] === "number" ?
        Math.min(Math.max(Math.trunc(input["limit"]), 1), 250) :
        100;
    const snapshot = await db
      .collection(SAFETY_CASES)
      .orderBy("updated_at", "desc")
      .limit(250)
      .get();
    const cases = snapshot.docs
      .filter((document) => !status || document.data()["status"] === status)
      .slice(0, limitValue)
      .map(caseSummary);
    return {cases};
  },
);

export const getAdminSafetyCase = onCall(
  ADMIN_CALLABLE_OPTIONS,
  async (request) => {
    await assertAdmin(request.auth?.uid);
    const input = isRecord(request.data) ? request.data : {};
    const reference = cleanText(
      input["public_reference"],
      "public_reference",
      32,
      true,
    );
    if (!reference) {
      throw new HttpsError("invalid-argument", "public_reference is required.");
    }
    const document = await caseByPublicReference(reference);
    const caseData = document.data() as SafetyCaseSchema;
    const [view, intake, outbox] = await Promise.all([
      publicSafetyCaseView({
        caseRef: document.ref,
        caseData,
        role: "staff",
      }),
      document.ref.collection("private").doc("intake").get(),
      db
        .collection(SAFETY_CASE_EMAIL_OUTBOX)
        .where("case_id", "==", document.id)
        .limit(50)
        .get(),
    ]);
    return {
      id: document.id,
      case: view,
      workflow: caseSummary(document),
      private_intake: intake.data() ?? {},
      email_delivery: outbox.docs.map((email) => ({
        id: email.id,
        template: email.data()["template"],
        created_at: timestampMillis(email.data()["created_at"]),
        delivery: email.data()["delivery"] ?? {},
      })),
    };
  },
);

export const updateSafetyCase = onCall(
  ADMIN_CALLABLE_OPTIONS,
  async (request) => {
    const reviewer = await assertAdmin(request.auth?.uid);
    const input = isRecord(request.data) ? request.data : {};
    const reference = cleanText(
      input["public_reference"],
      "public_reference",
      32,
      true,
    );
    if (!reference) {
      throw new HttpsError("invalid-argument", "public_reference is required.");
    }
    const document = await caseByPublicReference(reference);
    const current = document.data() as SafetyCaseSchema;
    const requestedStatus = input["status"];
    const status: SafetyCaseStatus =
      requestedStatus === undefined ?
        current.status :
        isSafetyCaseStatus(requestedStatus) ?
          requestedStatus :
          (() => {
            throw new HttpsError("invalid-argument", "Invalid case status.");
          })();
    const message = cleanText(input["message"], "message", 4000);
    const internalNote = cleanText(
      input["internal_note"],
      "internal_note",
      4000,
    );
    const assignToSelf = input["assign_to_self"] === true;
    const priorStatus = current.status;
    if (
      (status === "resolved" || status === "closed") &&
      !current.decision
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Record a reasoned decision before resolving or closing the case.",
      );
    }
    const update: Record<string, unknown> = {
      status,
      updated_at: Timestamp.now(),
      ...(assignToSelf ? {assigned_to: reviewer} : {}),
    };
    if (status === "closed") update["closed_at"] = Timestamp.now();
    await document.ref.set(update, {merge: true});
    if (status !== priorStatus) {
      await writeCaseEvent(document.ref, {
        type: "status_changed",
        visibility: "participants",
        from_status: priorStatus,
        to_status: status,
        created_by: reviewer,
        message:
          status === "awaiting_information" ?
            "PK Spot needs more information to continue reviewing this case." :
            `The case status changed to ${status.replace(/_/gu, " ")}.`,
      });
    }
    if (assignToSelf) {
      await writeCaseEvent(document.ref, {
        type: "assigned",
        visibility: "staff",
        created_by: reviewer,
      });
    }
    if (message) {
      const visibility =
        input["participant_role"] === "subject" ? "subject" : "submitter";
      await writeCaseEvent(document.ref, {
        type:
          status === "awaiting_information" ?
            "information_requested" :
            "message",
        visibility,
        participant_role: visibility,
        message,
        created_by: reviewer,
      });
      await sendCaseUpdateEmail(
        document.ref,
        current,
        visibility,
        `Update on PK Spot safety case ${reference}`,
        message,
        "case_update",
      );
    }
    if (internalNote) {
      await writeCaseEvent(document.ref, {
        type: "message",
        visibility: "staff",
        message: internalNote,
        created_by: reviewer,
      });
    }
    return {ok: true};
  },
);

export const decideSafetyCase = onCall(
  ADMIN_CALLABLE_OPTIONS,
  async (request) => {
    const reviewer = await assertAdmin(request.auth?.uid);
    const input = isRecord(request.data) ? request.data : {};
    const reference = cleanText(
      input["public_reference"],
      "public_reference",
      32,
      true,
    );
    if (
      !reference ||
      !isSafetyCaseDecisionType(input["decision_type"]) ||
      !isSafetyCaseOutcome(input["outcome"])
    ) {
      throw new HttpsError("invalid-argument", "Invalid case decision.");
    }
    const decisionType = input["decision_type"];
    const outcome = input["outcome"];
    const publicReason = cleanText(
      input["public_reason"],
      "public_reason",
      2000,
      true,
    );
    const policyBasis = cleanText(
      input["policy_basis"],
      "policy_basis",
      500,
    );
    const internalNote = cleanText(
      input["internal_note"],
      "internal_note",
      4000,
    );
    const independenceLimitation = cleanText(
      input["independence_limitation"],
      "independence_limitation",
      1000,
    );
    if (!publicReason) {
      throw new HttpsError("invalid-argument", "A public reason is required.");
    }
    const document = await caseByPublicReference(reference);
    const caseData = document.data() as SafetyCaseSchema;
    if (caseData.status === "closed") {
      throw new HttpsError("failed-precondition", "The case is closed.");
    }
    if (caseData.decision) {
      throw new HttpsError(
        "failed-precondition",
        "This case already has a decision. Use the appeal or restore workflow.",
      );
    }

    if (caseData.case_type === "appeal" && caseData.parent_case_id) {
      const parent = await db.doc(
        `${SAFETY_CASES}/${caseData.parent_case_id}`,
      ).get();
      const originalReviewer =
        (parent.data() as SafetyCaseSchema | undefined)?.original_reviewer;
      if (
        originalReviewer?.uid === reviewer.uid &&
        !independenceLimitation
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Record why a different appeal reviewer was unavailable.",
        );
      }
    }

    const appliesModerationAction =
      outcome === "action_taken" ||
      outcome === "upheld" ||
      outcome === "partially_upheld";
    const contentAction = [
      "publish_warning",
      "restrict_media",
      "unpublish_spot",
      "restrict_profile",
      "restrict_account",
    ].includes(decisionType);
    if (
      caseData.case_type !== "appeal" &&
      contentAction &&
      !appliesModerationAction
    ) {
      throw new HttpsError(
        "invalid-argument",
        "This content action requires an action-taking outcome.",
      );
    }

    let holdPath: string | undefined;
    if (
      caseData.case_type !== "appeal" &&
      appliesModerationAction &&
      [
        "publish_warning",
        "restrict_media",
        "unpublish_spot",
        "restrict_profile",
        "restrict_account",
      ].includes(decisionType)
    ) {
      holdPath = await createHold(
        document.ref,
        caseData,
        decisionType,
        reviewer,
      );
    }
    if (decisionType === "publish_warning" && appliesModerationAction) {
      if (!caseData.subject.path ||
        !/^spots\/[^/]+$/u.test(caseData.subject.path)) {
        throw new HttpsError("failed-precondition", "Spot target is required.");
      }
      await db.doc(caseData.subject.path).set(
        {
          public_notice: {
            type: "other",
            message: publicReason,
            published_at: Timestamp.now(),
            source: "moderator",
            case_reference: reference,
          },
          is_reported: true,
          latest_report_at: Timestamp.now(),
        },
        {merge: true},
      );
    }
    if (decisionType === "release_automated_media") {
      const reviewPath = cleanPath(
        caseData.subject.path,
        "subject.path",
      );
      if (!reviewPath || !/^media_upload_reviews\/[^/]+$/u.test(reviewPath)) {
        throw new HttpsError(
          "failed-precondition",
          "A media review target is required.",
        );
      }
      const review = await db.doc(reviewPath).get();
      if (review.data()?.["status"] !== "approved") {
        throw new HttpsError(
          "failed-precondition",
          "Release the media through the protected media-review action first.",
        );
      }
    }

    const decidedAt = Timestamp.now();
    const decision: SafetyCaseDecisionSchema = {
      type: decisionType,
      outcome,
      public_reason: publicReason,
      ...(policyBasis ? {policy_basis: policyBasis} : {}),
      decided_at: decidedAt,
      decided_by: reviewer,
      ...(holdPath ? {hold_path: holdPath} : {}),
    };

    if (
      caseData.case_type === "appeal" &&
      outcome === "reversed" &&
      caseData.parent_case_id
    ) {
      const parentRef = db.doc(
        `${SAFETY_CASES}/${caseData.parent_case_id}`,
      );
      const parent = await parentRef.get();
      const parentData = parent.data() as SafetyCaseSchema | undefined;
      const parentHold = parentData?.decision?.hold_path;
      if (parentHold) {
        await restoreHold(parentHold, reviewer);
        await parentRef.update({
          "decision.restored_at": decidedAt,
          "decision.restored_by": reviewer,
          updated_at: decidedAt,
        });
        await parentRef.collection("events").doc(
          sha256("safety-case-appeal-restore-event-v1", document.id),
        ).set({
          type: "content_restored",
          visibility: "participants",
          created_by: reviewer,
          message: "The earlier moderation action was reversed and restored.",
          created_at: decidedAt,
        });
      }
    }

    const email = await contactEmailForCase(document.ref);
    const accessToken = email ? randomToken() : undefined;
    const accessLink =
      email && accessToken ?
        caseAccessLink(
          caseData.locale,
          caseData.public_reference,
          accessToken,
        ) :
        undefined;
    const emailText =
      `${publicReason}` +
      (accessLink ? `\n\nView this private case: ${accessLink}` : "") +
      `\n\nCase reference: ${caseData.public_reference}`;
    const emailHtml =
      `<p>${escapeHtml(publicReason)}</p>` +
      (accessLink ?
        `<p><a href="${accessLink}">View this private case</a></p>` :
        "") +
      `<p>Case reference: <strong>${caseData.public_reference}</strong></p>`;
    const notifySubject =
      Boolean(holdPath) ||
      [
        "confirm_automated_media_decision",
        "release_automated_media",
        "confirm_age_assurance_decision",
        "request_age_assurance_retry",
      ].includes(decisionType);
    let subjectEmail: string | undefined;
    if (
      notifySubject &&
      caseData.subject_uid &&
      caseData.subject_uid !== caseData.submitter_uid
    ) {
      try {
        subjectEmail = (
          await admin.auth().getUser(caseData.subject_uid)
        ).email?.toLowerCase();
      } catch (error) {
        console.warn("Could not resolve affected safety-case account email", {
          caseId: document.id,
          subjectUid: caseData.subject_uid,
          error,
        });
      }
    }
    if (subjectEmail === email) subjectEmail = undefined;
    const subjectAccessToken = subjectEmail ? randomToken() : undefined;
    const subjectAccessLink =
      subjectEmail && subjectAccessToken ?
        caseAccessLink(
          caseData.locale,
          caseData.public_reference,
          subjectAccessToken,
        ) :
        undefined;
    const subjectEmailText =
      `PK Spot made a decision affecting your content or account. ` +
      `${publicReason}` +
      (subjectAccessLink ?
        `\n\nView the private decision or appeal it: ${subjectAccessLink}` :
        "") +
      `\n\nCase reference: ${caseData.public_reference}. ` +
      "Reporter-submitted details and identity remain confidential.";
    const subjectEmailHtml =
      "<p>PK Spot made a decision affecting your content or account.</p>" +
      `<p>${escapeHtml(publicReason)}</p>` +
      (subjectAccessLink ?
        `<p><a href="${subjectAccessLink}">View or appeal this decision</a></p>` :
        "") +
      `<p>Case reference: <strong>${caseData.public_reference}</strong></p>` +
      "<p>Reporter-submitted details and identity remain confidential.</p>";
    await db.runTransaction(async (transaction) => {
      const freshCase = await transaction.get(document.ref);
      if (freshCase.data()?.["decision"]) {
        throw new HttpsError(
          "failed-precondition",
          "This case already has a decision.",
        );
      }
      transaction.set(
        document.ref,
        {
          status: "resolved",
          decision,
          resolved_at: decidedAt,
          updated_at: decidedAt,
          ...(caseData.case_type === "appeal" ?
            {
              appeal_reviewer: reviewer,
              ...(independenceLimitation ?
                {independence_limitation: independenceLimitation} :
                {}),
            } :
            {original_reviewer: reviewer}),
        },
        {merge: true},
      );
      transaction.create(
        document.ref.collection("events").doc(
          sha256("safety-case-decision-event-v1", document.id),
        ),
        {
          type: "decision_recorded",
          visibility: "participants",
          created_by: reviewer,
          decision,
          message: publicReason,
          created_at: decidedAt,
        },
      );
      if (internalNote) {
        transaction.create(
          document.ref.collection("events").doc(
            sha256("safety-case-decision-note-v1", document.id),
          ),
          {
            type: "message",
            visibility: "staff",
            created_by: reviewer,
            message: internalNote,
            created_at: decidedAt,
          },
        );
      }
      if (email && accessToken) {
        transaction.create(
          db.doc(
            `${SAFETY_CASE_ACCESS_TOKENS}/` +
              sha256("safety-case-access-v1", accessToken),
          ),
          caseAccessTokenDocument(document.id, email, "submitter"),
        );
        transaction.create(
          db.collection(SAFETY_CASE_EMAIL_OUTBOX).doc(
            sha256("safety-case-decision-email-v1", document.id),
          ),
          caseEmailDocument(
            document.id,
            email,
            "case_decision",
            `Decision on PK Spot safety case ${reference}`,
            emailText,
            emailHtml,
          ),
        );
      }
      if (subjectEmail && subjectAccessToken) {
        transaction.create(
          db.doc(
            `${SAFETY_CASE_ACCESS_TOKENS}/` +
              sha256("safety-case-access-v1", subjectAccessToken),
          ),
          caseAccessTokenDocument(
            document.id,
            subjectEmail,
            "subject",
          ),
        );
        transaction.create(
          db.collection(SAFETY_CASE_EMAIL_OUTBOX).doc(
            sha256("safety-case-subject-decision-email-v1", document.id),
          ),
          caseEmailDocument(
            document.id,
            subjectEmail,
            "case_subject_decision",
            `PK Spot decision affecting your content or account`,
            subjectEmailText,
            subjectEmailHtml,
          ),
        );
      }
      transaction.create(
        db.collection("moderation_actions").doc(
          sha256("safety-case-decision-action-v1", document.id),
        ),
        {
          action_type: "safety_case_decision",
          source_type: "safety_case",
          source_path: document.ref.path,
          source_snapshot: caseData,
          target_type: caseData.subject.type,
          ...(caseData.subject.path ?
            {target_path: caseData.subject.path} :
            {}),
          created_at: decidedAt,
          created_by: reviewer,
          decision,
          ...(internalNote ? {note: internalNote} : {}),
        },
      );
    });
    return {ok: true, hold_path: holdPath};
  },
);

export const restoreSafetyCaseDecision = onCall(
  ADMIN_CALLABLE_OPTIONS,
  async (request) => {
    const reviewer = await assertAdmin(request.auth?.uid);
    const input = isRecord(request.data) ? request.data : {};
    const reference = cleanText(
      input["public_reference"],
      "public_reference",
      32,
      true,
    );
    if (!reference) {
      throw new HttpsError("invalid-argument", "public_reference is required.");
    }
    const document = await caseByPublicReference(reference);
    const caseData = document.data() as SafetyCaseSchema;
    const holdPath = caseData.decision?.hold_path;
    if (!holdPath) {
      throw new HttpsError(
        "failed-precondition",
        "This decision has no reversible hold.",
      );
    }
    await restoreHold(holdPath, reviewer);
    const restoredAt = Timestamp.now();
    await document.ref.update({
      "decision.restored_at": restoredAt,
      "decision.restored_by": reviewer,
      updated_at: restoredAt,
    });
    await writeCaseEvent(document.ref, {
      type: "content_restored",
      visibility: "participants",
      created_by: reviewer,
      message: "The moderation action was restored.",
    });
    return {ok: true};
  },
);
