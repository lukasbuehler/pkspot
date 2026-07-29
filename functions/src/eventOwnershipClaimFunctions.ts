import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type {
  EventOrganizerSchema,
  EventOwnerSchema,
  EventSchema,
} from "../../src/db/schemas/EventSchema";
import type {
  EventOwnershipClaimAuditSchema,
  EventOwnershipClaimSchema,
  FormerOwnerOutcome,
} from "../../src/db/schemas/EventOwnershipClaimSchema";
import type {
  OrganizationMemberSchema,
  OrganizationReferenceSchema,
  OrganizationSchema,
} from "../../src/db/schemas/OrganizationSchema";
import { createIntent } from "./notificationFunctions";

const CLAIMS = "event_ownership_claims";
const CLAIM_KEYS = "event_ownership_claim_keys";
const CLAIM_AUDITS = "event_ownership_claim_audits";
const CALLABLE_OPTIONS = { cors: true, invoker: "public" as const };

const cleanId = (value: unknown, name: string): string => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(value)
  ) {
    throw new HttpsError("invalid-argument", `${name} is invalid.`);
  }
  return value;
};

const cleanText = (
  value: unknown,
  name: string,
  max: number,
  required = true,
): string | undefined => {
  if (value === undefined || value === null || value === "") {
    if (!required) return undefined;
    throw new HttpsError("invalid-argument", `${name} is required.`);
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${name} must be text.`);
  }
  const cleaned = value.replace(/\s+/gu, " ").trim();
  if (!cleaned || cleaned.length > max) {
    throw new HttpsError("invalid-argument", `${name} is invalid.`);
  }
  return cleaned;
};

const evidenceUrls = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    throw new HttpsError(
      "invalid-argument",
      "Provide between one and five public evidence URLs.",
    );
  }
  return value.map((entry) => {
    const raw = cleanText(entry, "evidence URL", 1_000)!;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      return url.toString();
    } catch {
      throw new HttpsError("invalid-argument", "Evidence URLs must be public HTTP links.");
    }
  });
};

const formerOwnerOutcome = (value: unknown): FormerOwnerOutcome => {
  if (value !== "retain_editor" && value !== "remove_access") {
    throw new HttpsError("invalid-argument", "Invalid former-owner outcome.");
  }
  return value;
};

const requireAdmin = async (uid: string): Promise<void> => {
  const user = await admin.firestore().doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }
};

const requireOrganizationManager = async (
  uid: string,
  organizationId: string,
): Promise<{
  organization: OrganizationSchema;
  reference: OrganizationReferenceSchema;
}> => {
  const [organization, membership] = await Promise.all([
    admin.firestore().doc(`organizations/${organizationId}`).get(),
    admin
      .firestore()
      .doc(`organizations/${organizationId}/members/${uid}`)
      .get(),
  ]);
  const data = organization.data() as OrganizationSchema | undefined;
  const role = (membership.data() as OrganizationMemberSchema | undefined)?.role;
  if (
    !organization.exists ||
    data?.active !== true ||
    (role !== "owner" && role !== "admin")
  ) {
    throw new HttpsError(
      "permission-denied",
      "An active PK Spot organization manager is required.",
    );
  }
  return {
    organization: data,
    reference: {
      id: organizationId,
      name: data.name,
      slug: data.slug || organizationId,
      ...(data.logo_url ? { logo_url: data.logo_url } : {}),
      ...(data.logo_background_color
        ? { logo_background_color: data.logo_background_color }
        : {}),
    },
  };
};

const claimKey = (eventId: string, organizationId: string): string =>
  `${eventId}__${organizationId}`;

const eventOwnerUserIds = async (
  owner: EventOwnerSchema | undefined,
): Promise<string[]> => {
  if (!owner) return [];
  if (owner.type === "user") return [owner.user_id];
  const members = await admin
    .firestore()
    .collection(`organizations/${owner.organization_id}/members`)
    .get();
  return members.docs
    .filter((member) => {
      const role = (member.data() as OrganizationMemberSchema).role;
      return role === "owner" || role === "admin";
    })
    .map((member) => member.id);
};

const notifyClaim = async (
  recipients: readonly string[],
  claimId: string,
  path: string,
  eventName: string,
  title: string,
  message: string,
): Promise<void> => {
  await Promise.all(
    [...new Set(recipients)].map((recipient) =>
      createIntent(`event_claim_${claimId}_${recipient}_${title}`, {
        recipientUid: recipient,
        type: "event_update",
        sourcePath: `${CLAIMS}/${claimId}`,
        sendAfter: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
        path,
        channelId: "event_updates",
        payload: {
          event_name: eventName,
          update_title: title,
          update_message: message,
        },
      }),
    ),
  );
};

export const submitEventOwnershipClaim = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<{ claimId: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to submit a claim.");
    const input = (request.data ?? {}) as Record<string, unknown>;
    const eventId = cleanId(input["eventId"], "eventId");
    const organizationId = cleanId(input["organizationId"], "organizationId");
    const explanation = cleanText(input["explanation"], "explanation", 2_000)!;
    const evidence = evidenceUrls(input["evidenceUrls"]);
    const suggestedOutcome = formerOwnerOutcome(
      input["suggestedFormerOwnerOutcome"],
    );
    const { reference } = await requireOrganizationManager(uid, organizationId);
    const db = admin.firestore();
    const eventRef = db.doc(`events/${eventId}`);
    const claimRef = db.collection(CLAIMS).doc();
    const keyRef = db.doc(`${CLAIM_KEYS}/${claimKey(eventId, organizationId)}`);
    let eventData: EventSchema | undefined;
    await db.runTransaction(async (transaction) => {
      const [eventSnapshot, pendingKey] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(keyRef),
      ]);
      if (!eventSnapshot.exists) throw new HttpsError("not-found", "Event not found.");
      if (pendingKey.exists) {
        throw new HttpsError(
          "already-exists",
          "A pending claim already exists for this event and organization.",
        );
      }
      eventData = eventSnapshot.data() as EventSchema;
      const now = Timestamp.now();
      const claim: EventOwnershipClaimSchema = {
        event_id: eventId,
        event_name: eventData.name,
        organization_id: organizationId,
        organization: reference,
        submitter_id: uid,
        explanation,
        evidence_urls: evidence,
        suggested_former_owner_outcome: suggestedOutcome,
        status: "pending",
        owner_before: eventData.owner ?? null,
        organizer_before: eventData.organizer ?? null,
        time_created: now as unknown as EventOwnershipClaimSchema["time_created"],
        time_updated: now as unknown as EventOwnershipClaimSchema["time_updated"],
      };
      transaction.create(claimRef, claim);
      transaction.create(keyRef, { claim_id: claimRef.id, time_created: now });
    });
    const owners = await eventOwnerUserIds(eventData?.owner);
    await notifyClaim(
      owners,
      claimRef.id,
      `/event-ownership-claims/${claimRef.id}`,
      eventData!.name,
      "Organization ownership claim",
      `${reference.name} requested ownership of this event.`,
    );
    return { claimId: claimRef.id };
  },
);

export const respondToEventOwnershipClaim = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<{ ok: true }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to respond.");
    const input = (request.data ?? {}) as Record<string, unknown>;
    const claimId = cleanId(input["claimId"], "claimId");
    const position = input["position"];
    if (position !== "support" && position !== "contest") {
      throw new HttpsError("invalid-argument", "Invalid response position.");
    }
    const message = cleanText(input["message"], "message", 2_000, false);
    const db = admin.firestore();
    const claimRef = db.doc(`${CLAIMS}/${claimId}`);
    await db.runTransaction(async (transaction) => {
      const claimSnapshot = await transaction.get(claimRef);
      const claim = claimSnapshot.data() as EventOwnershipClaimSchema | undefined;
      if (!claimSnapshot.exists || !claim) throw new HttpsError("not-found", "Claim not found.");
      if (claim.status !== "pending") {
        throw new HttpsError("failed-precondition", "This claim is already final.");
      }
      const owner = claim.owner_before;
      let authorized = owner?.type === "user" && owner.user_id === uid;
      if (owner?.type === "organization") {
        const membership = await transaction.get(
          db.doc(`organizations/${owner.organization_id}/members/${uid}`),
        );
        const role = (membership.data() as OrganizationMemberSchema | undefined)?.role;
        authorized = role === "owner" || role === "admin";
      }
      if (!authorized) throw new HttpsError("permission-denied", "Only the current owner may respond.");
      transaction.update(claimRef, {
        owner_response: {
          position,
          message,
          responded_by: uid,
          responded_at: Timestamp.now(),
        },
        time_updated: Timestamp.now(),
      });
    });
    return { ok: true };
  },
);

export const reviewEventOwnershipClaim = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<{ ok: true }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to review.");
    await requireAdmin(uid);
    const input = (request.data ?? {}) as Record<string, unknown>;
    const claimId = cleanId(input["claimId"], "claimId");
    const approve = input["approve"] === true;
    const transferOwnership = approve && input["transferOwnership"] !== false;
    const linkOrganizer = approve && input["linkOrganizer"] === true;
    const outcome = formerOwnerOutcome(input["formerOwnerOutcome"]);
    const reason = cleanText(input["reason"], "reason", 2_000, false);
    if (!approve && !reason) {
      throw new HttpsError("invalid-argument", "A rejection reason is required.");
    }
    const db = admin.firestore();
    const claimRef = db.doc(`${CLAIMS}/${claimId}`);
    let decidedClaim: EventOwnershipClaimSchema | undefined;
    await db.runTransaction(async (transaction) => {
      const claimSnapshot = await transaction.get(claimRef);
      const claim = claimSnapshot.data() as EventOwnershipClaimSchema | undefined;
      if (!claimSnapshot.exists || !claim) throw new HttpsError("not-found", "Claim not found.");
      if (claim.status !== "pending") {
        throw new HttpsError("failed-precondition", "This claim is already final.");
      }
      const eventRef = db.doc(`events/${claim.event_id}`);
      const eventSnapshot = await transaction.get(eventRef);
      if (!eventSnapshot.exists) throw new HttpsError("not-found", "Event not found.");
      const event = eventSnapshot.data() as EventSchema;
      const ownerAfter: EventOwnerSchema | null = transferOwnership
        ? { type: "organization", organization_id: claim.organization_id }
        : (event.owner ?? null);
      const organizerAfter: EventOrganizerSchema | null = linkOrganizer
        ? { type: "organization", organization: claim.organization }
        : (event.organizer ?? null);
      const now = Timestamp.now();
      if (approve) {
        const eventPatch: Record<string, unknown> = { time_updated: now };
        if (transferOwnership) {
          eventPatch["owner"] = ownerAfter;
        }
        if (linkOrganizer) {
          eventPatch["organizer"] = organizerAfter;
          eventPatch["organizer_name"] = FieldValue.delete();
          eventPatch["organizer_access"] = "view";
        }
        if (transferOwnership || linkOrganizer) {
          transaction.update(eventRef, eventPatch);
        }
        if (transferOwnership && event.owner?.type === "user") {
          const accessRef = db.doc(`events/${claim.event_id}/access/${event.owner.user_id}`);
          if (outcome === "retain_editor") {
            transaction.set(accessRef, {
              user_id: event.owner.user_id,
              role: "collaborator",
              granted_by: uid,
              time_created: now,
              time_updated: now,
            });
          } else {
            transaction.delete(accessRef);
          }
        }
        const auditRef = db.collection(CLAIM_AUDITS).doc();
        const audit: EventOwnershipClaimAuditSchema = {
          claim_id: claimId,
          event_id: claim.event_id,
          organization_id: claim.organization_id,
          owner_before: event.owner ?? null,
          owner_after: ownerAfter,
          organizer_before: event.organizer ?? null,
          organizer_after: organizerAfter,
          former_owner_outcome: outcome,
          decided_by: uid,
          decided_at: now as unknown as EventOwnershipClaimAuditSchema["decided_at"],
        };
        transaction.create(auditRef, audit);
      }
      const decision = {
        transfer_ownership: transferOwnership,
        link_organizer: linkOrganizer,
        former_owner_outcome: outcome,
        reason,
        decided_by: uid,
        decided_at: now,
        owner_after: ownerAfter,
        organizer_after: organizerAfter,
      };
      transaction.update(claimRef, {
        status: approve ? "approved" : "rejected",
        decision,
        time_updated: now,
      });
      transaction.delete(
        db.doc(`${CLAIM_KEYS}/${claimKey(claim.event_id, claim.organization_id)}`),
      );
      decidedClaim = { ...claim, status: approve ? "approved" : "rejected", decision } as EventOwnershipClaimSchema;
    });
    const recipients = [
      decidedClaim!.submitter_id,
      ...(await eventOwnerUserIds(decidedClaim!.owner_before ?? undefined)),
    ];
    await notifyClaim(
      recipients,
      claimId,
      `/events/${decidedClaim!.event_id}`,
      decidedClaim!.event_name,
      approve ? "Ownership claim approved" : "Ownership claim rejected",
      reason ?? (approve ? "PK Spot approved the organization ownership claim." : "PK Spot rejected the claim."),
    );
    return { ok: true };
  },
);
