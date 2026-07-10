import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import type { CommunityInfoCardSchema } from "../../src/db/schemas/CommunityPageSchema";

type CommunityEditDecision = "approve" | "reject";
type CommunityEditStatus = "pending" | "approved" | "rejected";

interface ReviewCommunityEditRequest {
  communityKey?: unknown;
  editId?: unknown;
  decision?: unknown;
  reviewNote?: unknown;
}

interface SaveCommunityKnowledgeRequest {
  communityKey?: unknown;
  communityDisplayName?: unknown;
  communityPath?: unknown;
  cards?: unknown;
}

interface UserReference {
  uid: string;
  display_name?: string;
  profile_picture?: string;
}

interface CommunityEditData {
  target_type?: unknown;
  target_id?: unknown;
  schema_version?: unknown;
  type?: unknown;
  edit_kind?: unknown;
  operation?: unknown;
  data?: unknown;
  status?: unknown;
  approved?: unknown;
  visibility?: unknown;
  review_policy?: unknown;
  user?: unknown;
  timestamp?: unknown;
  timestamp_raw_ms?: unknown;
  community_display_name?: unknown;
  community_path?: unknown;
  legacy_source?: { collection?: unknown; id?: unknown };
}

interface AppliedKnowledgeEdit {
  cards: CommunityInfoCardSchema[];
  prevData:
    | { card: CommunityInfoCardSchema | null }
    | { cards: CommunityInfoCardSchema[] };
}

const CALLABLE_OPTIONS = { cors: true, invoker: "public" as const };
const EDIT_SCHEMA_VERSION = 1;
const MAX_KNOWLEDGE_CARDS = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const timestampMillis = (value: unknown, rawMillis: unknown): number => {
  if (typeof rawMillis === "number" && Number.isFinite(rawMillis)) {
    return rawMillis;
  }
  if (
    isRecord(value) &&
    typeof value["seconds"] === "number" &&
    Number.isFinite(value["seconds"])
  ) {
    return value["seconds"] * 1_000;
  }
  if (
    isRecord(value) &&
    typeof value["toMillis"] === "function"
  ) {
    return (value["toMillis"] as () => number)();
  }
  return Date.now();
};

const userReference = (
  uid: string,
  data: FirebaseFirestore.DocumentData | undefined,
): UserReference => ({
  uid,
  ...(optionalString(data?.["display_name"])
    ? { display_name: optionalString(data?.["display_name"]) }
    : {}),
  ...(optionalString(data?.["profile_picture"])
    ? { profile_picture: optionalString(data?.["profile_picture"]) }
    : {}),
});

const requireAdmin = async (uid: string | undefined): Promise<UserReference> => {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to manage community edits.");
  }
  const userSnap = await admin.firestore().doc(`users/${uid}`).get();
  if (userSnap.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  return userReference(uid, userSnap.data());
};

const requireDocumentId = (value: unknown, fieldName: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    value.includes("/")
  ) {
    throw new HttpsError("invalid-argument", `${fieldName} is invalid.`);
  }
  return value;
};

const isLocalizedText = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).length > 0 &&
  Object.values(value).every((entry) =>
    typeof entry === "string"
      ? entry.trim().length > 0
      : isRecord(entry) && typeof entry["text"] === "string",
  );

const requireKnowledgeCard = (value: unknown): CommunityInfoCardSchema => {
  if (
    !isRecord(value) ||
    typeof value["id"] !== "string" ||
    value["id"].length === 0 ||
    value["id"].length > 160 ||
    !isLocalizedText(value["title"])
  ) {
    throw new HttpsError("invalid-argument", "Community knowledge card is invalid.");
  }
  return value as unknown as CommunityInfoCardSchema;
};

const requireKnowledgeCards = (value: unknown): CommunityInfoCardSchema[] => {
  if (!Array.isArray(value) || value.length > MAX_KNOWLEDGE_CARDS) {
    throw new HttpsError("invalid-argument", "Community knowledge cards are invalid.");
  }
  const cards = value.map(requireKnowledgeCard);
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new HttpsError(
      "invalid-argument",
      "Community knowledge card IDs must be unique.",
    );
  }
  return cards;
};

const hasSignedInOnlyCta = (card: CommunityInfoCardSchema): boolean =>
  card.cta?.target === "url" &&
  (card.ctaVisibility === "signed-in" ||
    (card.ctaVisibility !== "public" && card.category === "chat"));

const publicKnowledgeCard = (
  card: CommunityInfoCardSchema,
): CommunityInfoCardSchema => {
  if (!hasSignedInOnlyCta(card)) {
    return card;
  }
  const { cta: _cta, ...publicCard } = card;
  return { ...publicCard, ctaVisibility: "signed-in" };
};

const fullKnowledgeCards = (
  pageData: FirebaseFirestore.DocumentData,
  privateData: FirebaseFirestore.DocumentData | undefined,
): CommunityInfoCardSchema[] => {
  const cardsById = new Map<string, CommunityInfoCardSchema>();
  for (const value of Array.isArray(pageData["infoCards"])
    ? pageData["infoCards"]
    : []) {
    const card = requireKnowledgeCard(value);
    cardsById.set(card.id, card);
  }
  for (const value of Array.isArray(privateData?.["infoCards"])
    ? privateData["infoCards"]
    : []) {
    const privateCard = requireKnowledgeCard(value);
    cardsById.set(privateCard.id, {
      ...cardsById.get(privateCard.id),
      ...privateCard,
    });
  }
  return Array.from(cardsById.values());
};

const applyKnowledgeOperation = (
  edit: CommunityEditData,
  currentCards: CommunityInfoCardSchema[],
): AppliedKnowledgeEdit => {
  if (!isRecord(edit.data)) {
    throw new HttpsError("failed-precondition", "Community edit data is invalid.");
  }

  if (edit.operation === "UPSERT_KNOWLEDGE_CARD") {
    const card = requireKnowledgeCard(edit.data["card"]);
    const cardsById = new Map(currentCards.map((item) => [item.id, item]));
    const previousCard = cardsById.get(card.id) ?? null;
    cardsById.set(card.id, card);
    return {
      cards: Array.from(cardsById.values()),
      prevData: { card: previousCard },
    };
  }

  if (edit.operation === "REPLACE_KNOWLEDGE_CARDS") {
    return {
      cards: requireKnowledgeCards(edit.data["cards"]),
      prevData: { cards: currentCards },
    };
  }

  throw new HttpsError(
    "failed-precondition",
    "Unsupported community knowledge edit operation.",
  );
};

const writeKnowledgeCards = (
  tx: FirebaseFirestore.Transaction,
  pageRef: FirebaseFirestore.DocumentReference,
  privateRef: FirebaseFirestore.DocumentReference,
  cards: CommunityInfoCardSchema[],
): void => {
  tx.update(pageRef, {
    infoCards: cards.map(publicKnowledgeCard),
  });
  tx.set(
    privateRef,
    { infoCards: cards.filter(hasSignedInOnlyCta) },
    { merge: true },
  );
};

const validateCommunityEdit = (
  edit: CommunityEditData,
  communityKey: string,
): void => {
  if (
    edit.target_type !== "community" ||
    edit.target_id !== communityKey ||
    edit.schema_version !== EDIT_SCHEMA_VERSION ||
    edit.type !== "UPDATE" ||
    edit.edit_kind !== "knowledge" ||
    edit.review_policy !== "admin"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Community edit metadata is invalid.",
    );
  }
};

export const buildCommunityEditFromLegacySuggestion = (
  suggestionId: string,
  suggestion: FirebaseFirestore.DocumentData,
): FirebaseFirestore.DocumentData | null => {
  const communityKey = optionalString(suggestion["community_key"]);
  const createdBy = suggestion["created_by"];
  if (
    !communityKey ||
    communityKey.includes("/") ||
    !isRecord(createdBy) ||
    !optionalString(createdBy["uid"]) ||
    !isRecord(suggestion["card"])
  ) {
    return null;
  }

  const rawStatus = suggestion["status"];
  const status: CommunityEditStatus =
    rawStatus === "approved" || rawStatus === "rejected"
      ? rawStatus
      : "pending";
  const timestamp = suggestion["created_at"] ?? Timestamp.now();
  const timestampRawMs = timestampMillis(
    timestamp,
    suggestion["created_at_raw_ms"],
  );

  return {
    target_type: "community",
    target_id: communityKey,
    schema_version: EDIT_SCHEMA_VERSION,
    type: "UPDATE",
    edit_kind: "knowledge",
    operation: "UPSERT_KNOWLEDGE_CARD",
    data: { card: suggestion["card"] },
    status,
    approved: status === "approved",
    visibility: status === "approved" ? "public" : "private",
    review_policy: "admin",
    user: createdBy,
    timestamp,
    timestamp_raw_ms: timestampRawMs,
    ...(optionalString(suggestion["community_display_name"])
      ? {
          community_display_name: optionalString(
            suggestion["community_display_name"],
          ),
        }
      : {}),
    ...(optionalString(suggestion["community_path"])
      ? { community_path: optionalString(suggestion["community_path"]) }
      : {}),
    ...(isRecord(suggestion["reviewed_by"])
      ? { reviewed_by: suggestion["reviewed_by"] }
      : {}),
    ...(suggestion["reviewed_at"]
      ? { reviewed_at: suggestion["reviewed_at"] }
      : {}),
    ...(optionalString(suggestion["review_note"])
      ? { review_note: optionalString(suggestion["review_note"]) }
      : {}),
    processing_status:
      status === "pending"
        ? "PENDING_ADMIN_REVIEW"
        : status === "approved"
          ? "APPROVED_ADMIN_REVIEW"
          : "REJECTED_ADMIN_REVIEW",
    legacy_source: {
      collection: "community_card_suggestions",
      id: suggestionId,
    },
  };
};

const ensureCommunityEditExists = async (
  communityKey: string,
  editId: string,
): Promise<FirebaseFirestore.DocumentReference> => {
  const db = admin.firestore();
  const editRef = db.doc(`community_pages/${communityKey}/edits/${editId}`);
  if ((await editRef.get()).exists) {
    return editRef;
  }

  const legacyRef = db.doc(`community_card_suggestions/${editId}`);
  const legacySnap = await legacyRef.get();
  const legacyData = legacySnap.data();
  const migratedData = legacyData
    ? buildCommunityEditFromLegacySuggestion(editId, legacyData)
    : null;
  if (!migratedData || migratedData["target_id"] !== communityKey) {
    throw new HttpsError("not-found", "Community edit was not found.");
  }

  try {
    await editRef.create(migratedData);
  } catch (error) {
    const code = isRecord(error) ? error["code"] : undefined;
    if (code !== 6 && code !== "already-exists") {
      throw error;
    }
  }
  await legacyRef.set(
    {
      migrated_edit_path: editRef.path,
      migrated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return editRef;
};

const syncLegacyDecision = async (
  edit: CommunityEditData,
  editId: string,
  decision: CommunityEditDecision,
  reviewer: UserReference,
): Promise<void> => {
  const legacyId =
    edit.legacy_source?.collection === "community_card_suggestions" &&
    typeof edit.legacy_source.id === "string"
      ? edit.legacy_source.id
      : editId;
  const legacyRef = admin.firestore().doc(`community_card_suggestions/${legacyId}`);
  if (!(await legacyRef.get()).exists) {
    return;
  }
  await legacyRef.set(
    {
      status: decision === "approve" ? "approved" : "rejected",
      reviewed_by: reviewer,
      reviewed_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
};

const reviewCommunityEditImpl = async (
  request: CallableRequest<ReviewCommunityEditRequest>,
): Promise<{ ok: true }> => {
  const reviewer = await requireAdmin(request.auth?.uid);
  const communityKey = requireDocumentId(
    request.data?.communityKey,
    "communityKey",
  );
  const editId = requireDocumentId(request.data?.editId, "editId");
  const decision = request.data?.decision;
  if (decision !== "approve" && decision !== "reject") {
    throw new HttpsError("invalid-argument", "Review decision is invalid.");
  }
  const reviewNote = optionalString(request.data?.reviewNote);
  const editRef = await ensureCommunityEditExists(communityKey, editId);
  const db = admin.firestore();
  const pageRef = db.doc(`community_pages/${communityKey}`);
  const privateRef = pageRef.collection("private_info").doc("link_cards");
  let reviewedEdit: CommunityEditData | undefined;

  await db.runTransaction(async (tx) => {
    const [editSnap, pageSnap, privateSnap] = await Promise.all([
      tx.get(editRef),
      tx.get(pageRef),
      tx.get(privateRef),
    ]);
    if (!editSnap.exists || !pageSnap.exists) {
      throw new HttpsError("not-found", "Community edit or page was not found.");
    }

    const edit = editSnap.data() as CommunityEditData;
    reviewedEdit = edit;
    validateCommunityEdit(edit, communityKey);
    const decidedStatus = decision === "approve" ? "approved" : "rejected";
    if (edit.status === decidedStatus) {
      return;
    }
    if (edit.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        "Community edit is no longer pending.",
      );
    }

    if (decision === "reject") {
      tx.update(editRef, {
        status: "rejected",
        approved: false,
        visibility: "private",
        reviewed_by: reviewer,
        reviewed_at: FieldValue.serverTimestamp(),
        decision_at: FieldValue.serverTimestamp(),
        processing_status: "REJECTED_ADMIN_REVIEW",
        review_note: reviewNote ?? FieldValue.delete(),
      });
      return;
    }

    const currentCards = fullKnowledgeCards(
      pageSnap.data() ?? {},
      privateSnap.data(),
    );
    const applied = applyKnowledgeOperation(edit, currentCards);
    writeKnowledgeCards(tx, pageRef, privateRef, applied.cards);
    tx.update(editRef, {
      status: "approved",
      approved: true,
      visibility: "public",
      reviewed_by: reviewer,
      reviewed_at: FieldValue.serverTimestamp(),
      decision_at: FieldValue.serverTimestamp(),
      processing_status: "APPROVED_ADMIN_REVIEW",
      review_note: reviewNote ?? FieldValue.delete(),
      prevData: applied.prevData,
    });
  });

  if (reviewedEdit) {
    await syncLegacyDecision(reviewedEdit, editId, decision, reviewer);
  }
  return { ok: true };
};

const saveCommunityKnowledgeImpl = async (
  request: CallableRequest<SaveCommunityKnowledgeRequest>,
): Promise<{ ok: true; editId: string }> => {
  const reviewer = await requireAdmin(request.auth?.uid);
  const communityKey = requireDocumentId(
    request.data?.communityKey,
    "communityKey",
  );
  const cards = requireKnowledgeCards(request.data?.cards);
  const communityDisplayName = optionalString(
    request.data?.communityDisplayName,
  );
  const communityPath = optionalString(request.data?.communityPath);
  const db = admin.firestore();
  const pageRef = db.doc(`community_pages/${communityKey}`);
  const privateRef = pageRef.collection("private_info").doc("link_cards");
  const editRef = pageRef.collection("edits").doc();
  const now = Timestamp.now();

  await db.runTransaction(async (tx) => {
    const [pageSnap, privateSnap] = await Promise.all([
      tx.get(pageRef),
      tx.get(privateRef),
    ]);
    if (!pageSnap.exists) {
      throw new HttpsError("not-found", "Community page was not found.");
    }
    const currentCards = fullKnowledgeCards(
      pageSnap.data() ?? {},
      privateSnap.data(),
    );
    writeKnowledgeCards(tx, pageRef, privateRef, cards);
    tx.create(editRef, {
      target_type: "community",
      target_id: communityKey,
      schema_version: EDIT_SCHEMA_VERSION,
      type: "UPDATE",
      edit_kind: "knowledge",
      operation: "REPLACE_KNOWLEDGE_CARDS",
      data: { cards },
      prevData: { cards: currentCards },
      status: "approved",
      approved: true,
      visibility: "public",
      review_policy: "admin",
      user: reviewer,
      timestamp: now,
      timestamp_raw_ms: now.toMillis(),
      reviewed_by: reviewer,
      reviewed_at: now,
      decision_at: now,
      processing_status: "APPROVED_ADMIN_DIRECT",
      ...(communityDisplayName
        ? { community_display_name: communityDisplayName }
        : {}),
      ...(communityPath ? { community_path: communityPath } : {}),
    });
  });

  return { ok: true, editId: editRef.id };
};

export const reviewCommunityEdit = onCall(
  CALLABLE_OPTIONS,
  reviewCommunityEditImpl,
);

export const saveCommunityKnowledge = onCall(
  CALLABLE_OPTIONS,
  saveCommunityKnowledgeImpl,
);
