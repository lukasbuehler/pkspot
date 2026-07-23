import * as admin from "firebase-admin";
import {
  Timestamp,
  type DocumentData,
  type Transaction,
} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import type {
  EventAttendanceEligibilitySchema,
  EventOwnerSchema,
  EventSchema,
} from "../../src/db/schemas/EventSchema";
import type {
  CancelEventRegistrationRequest,
  CancelEventRegistrationResponse,
  EventAdmissionStateSchema,
  EventRegistrationSchema,
  RegisterForEventRequest,
  RegisterForEventResponse,
} from "../../src/db/schemas/EventRegistrationSchema";
import type {
  OrganizationMemberSchema,
} from "../../src/db/schemas/OrganizationSchema";
import type {UserSchema} from "../../src/db/schemas/UserSchema";

const CALLABLE_OPTIONS = {cors: true, invoker: "public" as const};
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const ACTIVE_ORGANIZATION_ROLES = new Set([
  "owner",
  "admin",
  "reviewer",
  "member",
]);
const MANAGER_ORGANIZATION_ROLES = new Set(["owner", "admin"]);

type EventAccessData = { role?: unknown };

const eventIdFrom = (value: unknown): string => {
  if (typeof value !== "string" || !EVENT_ID_PATTERN.test(value)) {
    throw new HttpsError("invalid-argument", "A valid eventId is required.");
  }
  return value;
};

const optionalUserIdFrom = (value: unknown, fallback: string): string => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || !EVENT_ID_PATTERN.test(value)) {
    throw new HttpsError("invalid-argument", "A valid userId is required.");
  }
  return value;
};

const timestampMillis = (value: unknown): number | null => {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: () => number; seconds?: number };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.seconds === "number") return candidate.seconds * 1_000;
  }
  return null;
};

const eventIsPublished = (event: EventSchema): boolean =>
  event.publication_state !== undefined ?
    event.publication_state === "published" :
    event.published !== false;

const normalizedCounts = (
  data: DocumentData | undefined,
): Pick<EventAdmissionStateSchema, "registered" | "waitlisted"> => ({
  registered:
    typeof data?.["registered"] === "number" && data["registered"] >= 0 ?
      Math.trunc(data["registered"]) :
      0,
  waitlisted:
    typeof data?.["waitlisted"] === "number" && data["waitlisted"] >= 0 ?
      Math.trunc(data["waitlisted"]) :
      0,
});

const organizationRole = async (
  transaction: Transaction,
  organizationId: string,
  uid: string,
): Promise<string | null> => {
  const membership = await transaction.get(
    admin.firestore().doc(`organizations/${organizationId}/members/${uid}`),
  );
  const role = (
    membership.data() as OrganizationMemberSchema | undefined
  )?.role;
  return typeof role === "string" ? role : null;
};

const ownerAllowsManagement = async (
  transaction: Transaction,
  owner: EventOwnerSchema | undefined,
  uid: string,
): Promise<boolean> => {
  if (!owner) return false;
  if (owner.type === "user") return owner.user_id === uid;
  const role = await organizationRole(
    transaction,
    owner.organization_id,
    uid,
  );
  return role !== null && MANAGER_ORGANIZATION_ROLES.has(role);
};

const organizationAllowsAttendance = async (
  transaction: Transaction,
  organizationId: string,
  uid: string,
): Promise<boolean> => {
  const role = await organizationRole(transaction, organizationId, uid);
  return role !== null && ACTIVE_ORGANIZATION_ROLES.has(role);
};

const eventAccess = async (
  transaction: Transaction,
  eventId: string,
  uid: string,
): Promise<EventAccessData | null> => {
  const access = await transaction.get(
    admin.firestore().doc(`events/${eventId}/access/${uid}`),
  );
  return access.exists ? (access.data() as EventAccessData) : null;
};

const viewerCanReadEvent = async (
  transaction: Transaction,
  eventId: string,
  event: EventSchema,
  uid: string,
  isAdmin: boolean,
): Promise<boolean> => {
  if (isAdmin || (await ownerAllowsManagement(transaction, event.owner, uid))) {
    return true;
  }
  const access = await eventAccess(transaction, eventId, uid);
  if (access?.role === "viewer" || access?.role === "collaborator") return true;
  if (!eventIsPublished(event)) return false;
  if ((event.visibility ?? "public") !== "private") return true;
  return (
    event.viewer_policy?.audience === "organization_members" &&
    (await organizationAllowsAttendance(
      transaction,
      event.viewer_policy.organization_id,
      uid,
    ))
  );
};

const viewerMeetsEligibility = async (
  transaction: Transaction,
  eventId: string,
  eligibility: EventAttendanceEligibilitySchema | undefined,
  uid: string,
  isAdmin: boolean,
  canManage: boolean,
): Promise<boolean> => {
  if (!eligibility || eligibility.type === "everyone") return true;
  if (isAdmin || canManage) return true;
  if (eligibility.type === "organization_members") {
    return organizationAllowsAttendance(
      transaction,
      eligibility.organization_id,
      uid,
    );
  }
  const access = await eventAccess(transaction, eventId, uid);
  return access?.role === "viewer" || access?.role === "collaborator";
};

const assertUserMayParticipate = (user: UserSchema | undefined): void => {
  const state = user?.age_policy?.participation_state ?? "allowed";
  if (state !== "allowed" && state !== "platform_signal_unavailable") {
    throw new HttpsError(
      "permission-denied",
      "This account cannot register for events.",
    );
  }
};

const promoteAvailableWaiters = async (eventId: string): Promise<number> => {
  const db = admin.firestore();
  let totalPromoted = 0;
  // Each transaction remains comfortably below Firestore's write limit while
  // still draining unusually large queues after registration becomes unlimited.
  for (let page = 0; page < 25; page += 1) {
    const promoted = await db.runTransaction(async (transaction) => {
      const eventRef = db.doc(`events/${eventId}`);
      const stateRef = db.doc(`events/${eventId}/admission/state`);
      const [eventSnapshot, stateSnapshot] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(stateRef),
      ]);
      if (!eventSnapshot.exists || !stateSnapshot.exists) return 0;
      const event = eventSnapshot.data() as EventSchema;
      if (
        event.attendance?.admission !== "registration" ||
        event.lifecycle_status === "cancelled"
      ) {
        return 0;
      }
      const counts = normalizedCounts(stateSnapshot.data());
      const capacity = event.attendance.capacity;
      const available =
        capacity === undefined ?
          counts.waitlisted :
          Math.max(0, capacity - counts.registered);
      const limit = Math.min(available, counts.waitlisted, 200);
      if (limit <= 0) return 0;

      const waitlist = await transaction.get(
        db
          .collection(`events/${eventId}/registrations`)
          .where("status", "==", "waitlisted")
          .orderBy("waitlisted_at", "asc")
          .limit(limit),
      );
      if (waitlist.empty) return 0;
      const now = Timestamp.now();
      for (const registration of waitlist.docs) {
        transaction.update(registration.ref, {
          status: "registered",
          registered_at: now,
          time_updated: now,
        });
      }
      transaction.set(stateRef, {
        registered: counts.registered + waitlist.size,
        waitlisted: Math.max(0, counts.waitlisted - waitlist.size),
        time_updated: now,
      });
      return waitlist.size;
    });
    totalPromoted += promoted;
    if (promoted < 200) break;
  }
  return totalPromoted;
};

export const registerForEvent = onCall<RegisterForEventRequest>(
  CALLABLE_OPTIONS,
  async (request): Promise<RegisterForEventResponse> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to register.");
    const eventId = eventIdFrom(request.data?.eventId);
    const db = admin.firestore();

    return db.runTransaction(async (transaction) => {
      const eventRef = db.doc(`events/${eventId}`);
      const userRef = db.doc(`users/${uid}`);
      const stateRef = db.doc(`events/${eventId}/admission/state`);
      const registrationRef = db.doc(`events/${eventId}/registrations/${uid}`);
      const [eventSnapshot, userSnapshot, stateSnapshot, registrationSnapshot] =
        await Promise.all([
          transaction.get(eventRef),
          transaction.get(userRef),
          transaction.get(stateRef),
          transaction.get(registrationRef),
        ]);
      if (!eventSnapshot.exists) {
        throw new HttpsError("not-found", "Event not found.");
      }

      const event = eventSnapshot.data() as EventSchema;
      const user = userSnapshot.data() as UserSchema | undefined;
      assertUserMayParticipate(user);
      const isAdmin = user?.is_admin === true;
      const canManage = await ownerAllowsManagement(
        transaction,
        event.owner,
        uid,
      );
      if (
        !(await viewerCanReadEvent(
          transaction,
          eventId,
          event,
          uid,
          isAdmin,
        ))
      ) {
        throw new HttpsError(
          "permission-denied",
          "You cannot open this event.",
        );
      }
      if (!eventIsPublished(event)) {
        throw new HttpsError(
          "failed-precondition",
          "Draft events do not accept registrations.",
        );
      }
      if (event.lifecycle_status === "cancelled") {
        throw new HttpsError(
          "failed-precondition",
          "Cancelled events do not accept registrations.",
        );
      }
      const eventStart = timestampMillis(event.start);
      if (!eventStart || eventStart <= Date.now()) {
        throw new HttpsError(
          "failed-precondition",
          "Registration has closed for this event.",
        );
      }
      if (event.attendance?.admission !== "registration") {
        throw new HttpsError(
          "failed-precondition",
          "This event does not use registration.",
        );
      }
      if (
        !(await viewerMeetsEligibility(
          transaction,
          eventId,
          event.attendance.eligibility,
          uid,
          isAdmin,
          canManage,
        ))
      ) {
        throw new HttpsError(
          "permission-denied",
          "You are not eligible to register for this event.",
        );
      }

      const existing =
        registrationSnapshot.data() as EventRegistrationSchema | undefined;
      const counts = normalizedCounts(stateSnapshot.data());
      if (
        existing?.status === "registered" ||
        existing?.status === "waitlisted"
      ) {
        return {status: existing.status, ...counts};
      }

      const capacity = event.attendance.capacity;
      const hasConfirmedPlace =
        capacity === undefined || counts.registered < capacity;
      if (!hasConfirmedPlace && event.attendance.waitlist !== true) {
        throw new HttpsError("resource-exhausted", "This event is full.");
      }

      const now = Timestamp.now();
      const status = hasConfirmedPlace ? "registered" : "waitlisted";
      const nextCounts = {
        registered: counts.registered + (status === "registered" ? 1 : 0),
        waitlisted: counts.waitlisted + (status === "waitlisted" ? 1 : 0),
      };
      const registration: EventRegistrationSchema = {
        user_id: uid,
        event_id: eventId,
        status,
        time_created:
          existing?.time_created ??
          (now as EventRegistrationSchema["time_created"]),
        time_updated: now as EventRegistrationSchema["time_updated"],
        ...(status === "registered" ?
          {registered_at: now as EventRegistrationSchema["registered_at"]} :
          {waitlisted_at: now as EventRegistrationSchema["waitlisted_at"]}),
      };
      transaction.set(registrationRef, registration);
      transaction.set(stateRef, {...nextCounts, time_updated: now});
      return {status, ...nextCounts};
    });
  },
);

export const cancelEventRegistration =
  onCall<CancelEventRegistrationRequest>(
    CALLABLE_OPTIONS,
    async (request): Promise<CancelEventRegistrationResponse> => {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError("unauthenticated", "Sign in to cancel.");
      }
      const eventId = eventIdFrom(request.data?.eventId);
      const targetUid = optionalUserIdFrom(request.data?.userId, uid);
      const db = admin.firestore();

      return db.runTransaction(async (transaction) => {
        const eventRef = db.doc(`events/${eventId}`);
        const callerRef = db.doc(`users/${uid}`);
        const stateRef = db.doc(`events/${eventId}/admission/state`);
        const registrationRef = db.doc(
          `events/${eventId}/registrations/${targetUid}`,
        );
        const [
          eventSnapshot,
          callerSnapshot,
          stateSnapshot,
          registrationSnapshot,
        ] =
          await Promise.all([
            transaction.get(eventRef),
            transaction.get(callerRef),
            transaction.get(stateRef),
            transaction.get(registrationRef),
          ]);
        if (!eventSnapshot.exists) {
          throw new HttpsError("not-found", "Event not found.");
        }
        const event = eventSnapshot.data() as EventSchema;
        if (
          targetUid !== uid &&
          callerSnapshot.data()?.["is_admin"] !== true &&
          !(await ownerAllowsManagement(transaction, event.owner, uid))
        ) {
          throw new HttpsError(
            "permission-denied",
            "Only an event manager can cancel another registration.",
          );
        }
        const registration =
          registrationSnapshot.data() as EventRegistrationSchema | undefined;
        const counts = normalizedCounts(stateSnapshot.data());
        if (!registration || registration.status === "cancelled") {
          return {status: "cancelled", ...counts};
        }

        const capacity = event.attendance?.capacity;
        const confirmedAfterCancellation = Math.max(
          0,
          counts.registered - 1,
        );
        const mayPromote =
          registration.status === "registered" &&
          (capacity === undefined || confirmedAfterCancellation < capacity);
        let promoted:
          | FirebaseFirestore.QueryDocumentSnapshot<DocumentData>
          | undefined;
        if (mayPromote) {
          const waitlist = await transaction.get(
            db
              .collection(`events/${eventId}/registrations`)
              .where("status", "==", "waitlisted")
              .orderBy("waitlisted_at", "asc")
              .limit(1),
          );
          promoted = waitlist.docs[0];
        }

        const now = Timestamp.now();
        const nextCounts = {
          registered: Math.max(
            0,
            counts.registered -
              (registration.status === "registered" && !promoted ? 1 : 0),
          ),
          waitlisted: Math.max(
            0,
            counts.waitlisted -
              (registration.status === "waitlisted" || promoted ? 1 : 0),
          ),
        };
        transaction.set(
          registrationRef,
          {
            ...registration,
            status: "cancelled",
            cancelled_at: now,
            time_updated: now,
          },
          {merge: false},
        );
        if (promoted) {
          transaction.update(promoted.ref, {
            status: "registered",
            registered_at: now,
            time_updated: now,
          });
        }
        transaction.set(stateRef, {...nextCounts, time_updated: now});
        return {
          status: "cancelled",
          ...(promoted ? {promotedUserId: promoted.id} : {}),
          ...nextCounts,
        };
      });
    },
  );

export const reconcileEventWaitlistOnEventUpdate = onDocumentUpdated(
  "events/{eventId}",
  async (change) => {
    const before = change.data?.before.data() as EventSchema | undefined;
    const after = change.data?.after.data() as EventSchema | undefined;
    if (!before || !after) return;
    const beforeAdmission = JSON.stringify({
      admission: before.attendance?.admission,
      capacity: before.attendance?.capacity,
      lifecycle: before.lifecycle_status,
    });
    const afterAdmission = JSON.stringify({
      admission: after.attendance?.admission,
      capacity: after.attendance?.capacity,
      lifecycle: after.lifecycle_status,
    });
    if (beforeAdmission === afterAdmission) return;
    await promoteAvailableWaiters(String(change.params.eventId));
  },
);
