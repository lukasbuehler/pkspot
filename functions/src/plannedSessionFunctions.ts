import * as admin from "firebase-admin";
import { defineBoolean } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { Timestamp } from "firebase-admin/firestore";
import type { PlannedSession, PlannedSessionView, SessionPlan } from "../../src/db/schemas/PlannedSessionSchema";
import type { UserSchema } from "../../src/db/schemas/UserSchema";
import { parseSessionInput, sessionAdult, sessionBlocked, sessionParticipation } from "./plannedSessionPolicy";
import { upsertPendingIntent } from "./notificationFunctions";

const enabled = defineBoolean("PLANNED_SESSIONS_ENABLED", { default: false });
const options = { region: "europe-west1", enforceAppCheck: true, cors: true };
const db = () => admin.firestore();
const denied = () => new HttpsError("permission-denied", "This session is unavailable.");
const identifier = (value: unknown): string => {
  if (typeof value !== "string" || !/^[\w-]{1,150}$/.test(value)) throw new HttpsError("invalid-argument", "Invalid identifier.");
  return value;
};
const userRef = (uid: string) => db().doc(`users/${uid}`);
const sessionRef = (id: string) => db().doc(`planned_sessions/${id}`);
const planRef = (uid: string, id: string) => db().doc(`users/${uid}/session_plans/${id}`);

/** Every read and mutation rechecks the invitation and both sides' blocks.
 * Memberships and private saves are never exposed in a public Event document.
 */
async function context(tx: admin.firestore.Transaction, id: string, uid?: string) {
  const snapshot = await tx.get(sessionRef(id));
  if (!snapshot.exists) throw denied();
  const session = snapshot.data() as PlannedSession;
  const owner = (await tx.get(userRef(session.ownerUid))).data() as UserSchema | undefined;
  const user = uid ? (await tx.get(userRef(uid))).data() as UserSchema | undefined : undefined;
  const plan = uid ? (await tx.get(planRef(uid, id))).data() : undefined;
  if (!sessionParticipation(owner) || (uid && sessionBlocked(user, owner, uid, session.ownerUid))) throw denied();
  if (session.audience === "private" && uid !== session.ownerUid && !plan?.["invited"]) throw denied();
  if (session.audience === "private" && uid && uid !== session.ownerUid) {
    const following = await tx.get(db().doc(`users/${uid}/following/${session.ownerUid}`));
    const follower = await tx.get(db().doc(`users/${session.ownerUid}/following/${uid}`));
    if (!following.exists || !follower.exists) throw denied();
  }
  return { session, owner, user, plan, isOwner: uid === session.ownerUid };
}
function project(c: Awaited<ReturnType<typeof context>>): PlannedSessionView {
  const { session: s } = c;
  // Explicit allowlist: later private server fields must not become response fields.
  return {
    session: { id: s.id, ownerUid: s.audience === "private" || sessionAdult(c.user) ? s.ownerUid : "",
      title: s.title, notes: s.notes, spotId: s.spotId, startsAt: s.startsAt, endsAt: s.endsAt,
      timeZone: s.timeZone, audience: s.audience, cancelled: s.cancelled, revision: s.revision },
    isOwner: c.isOwner,
    canAttendVisibly: sessionParticipation(c.user) && (s.audience === "private" || sessionAdult(c.user)),
    mine: c.plan ? { saved: c.plan["saved"] === true, attendance: c.plan["attendance"] === "visible" ? "visible" : "private", reminder: c.plan["reminder"] === true } : null,
  };
}

export const plannedSessions = onCall(options, async (request) => {
  if (!enabled.value()) throw new HttpsError("failed-precondition", "Session planning is not enabled yet.");
  const input = (request.data ?? {}) as Record<string, unknown>;
  const uid = request.auth?.uid;
  if (input["action"] === "get") {
    const id = identifier(input["id"]);
    return db().runTransaction(async tx => project(await context(tx, id, uid)));
  }
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (input["action"] === "list") {
    const mine = input["scope"] !== "community";
    const user = (await userRef(uid).get()).data() as UserSchema | undefined;
    if (!mine && !sessionAdult(user)) throw denied();
    const docs = mine
      ? await db().collection(`users/${uid}/session_plans`).orderBy("startsAt", "desc").limit(100).get()
      : await db().collection("planned_sessions").where("audience", "==", "community").where("endsAt", ">", Date.now()).orderBy("endsAt").limit(50).get();
    const views = await Promise.all(docs.docs.map(doc => db().runTransaction(async tx => {
      try {
        const c = await context(tx, doc.id, uid);
        if (mine && !c.plan?.["saved"] && !c.plan?.["invited"] && !c.isOwner) return null;
        if (!mine && (c.session.cancelled || !sessionAdult(c.owner))) return null;
        return project(c);
      } catch (error) { if (error instanceof HttpsError && error.code === "permission-denied") return null; throw error; }
    })));
    return views.filter(view => view !== null);
  }
  if (input["action"] === "create") {
    const details = parseSessionInput(input["session"]);
    const ref = sessionRef(db().collection("planned_sessions").doc().id);
    return db().runTransaction(async tx => {
      const user = (await tx.get(userRef(uid))).data() as UserSchema | undefined;
      const spot = await tx.get(db().doc(`spots/${details.spotId}`));
      const rateRef = db().doc(`planned_session_limits/${uid}`);
      const rate = (await tx.get(rateRef)).data();
      const day = Math.floor(Date.now() / 86400000);
      const count = rate?.["day"] === day ? Number(rate["count"]) : 0;
      if (!sessionParticipation(user) || (details.audience === "community" && !sessionAdult(user))) throw denied();
      if (!spot.exists) throw new HttpsError("not-found", "Spot unavailable.");
      if (count >= 10) throw new HttpsError("resource-exhausted", "Daily planning limit reached.");
      const session: PlannedSession = { ...details, id: ref.id, ownerUid: uid, cancelled: false, revision: 1 };
      tx.create(ref, session);
      tx.set(rateRef, { day, count: count + 1 });
      tx.set(planRef(uid, ref.id), { sessionId: ref.id, saved: true, attendance: "private", reminder: false, invited: true, startsAt: details.startsAt, revision: 1 });
      return { id: ref.id };
    });
  }
  const id = identifier(input["id"]);
  return db().runTransaction(async tx => {
    const c = await context(tx, id, uid);
    const s = c.session;
    if (input["action"] === "save") {
      const plan = input["plan"] as SessionPlan | undefined;
      if (!plan || typeof plan.saved !== "boolean" || typeof plan.reminder !== "boolean" || !["private", "visible"].includes(plan.attendance)) throw new HttpsError("invalid-argument", "Invalid plan.");
      if (plan.saved && (s.cancelled || s.endsAt <= Date.now() || !sessionParticipation(c.user))) throw denied();
      if (plan.saved && plan.attendance === "visible" && s.audience === "community" && !sessionAdult(c.user)) throw denied();
      tx.set(planRef(uid, id), { sessionId: id, saved: plan.saved, attendance: plan.saved ? plan.attendance : "private", reminder: plan.saved && plan.reminder,
        invited: c.plan?.["invited"] === true, startsAt: s.startsAt, revision: s.revision });
      const member = sessionRef(id).collection("attendees").doc(uid);
      if (plan.saved && plan.attendance === "visible") tx.set(member, { uid }); else tx.delete(member);
      return { ok: true };
    }
    if (input["action"] === "attendees") {
      // Private attendance is shared with the organizer only. Public attendance
      // is visible only to verified adults, never to anonymous link viewers.
      if (s.audience === "private" ? !c.isOwner : !sessionAdult(c.user)) throw denied();
      const members = await tx.get(sessionRef(id).collection("attendees").limit(100));
      const result: { uid: string; name: string }[] = [];
      for (const member of members.docs) {
        const attendee = (await tx.get(userRef(member.id))).data() as UserSchema | undefined;
        const plan = (await tx.get(planRef(member.id, id))).data();
        if (s.audience === "private" && member.id !== s.ownerUid) {
          const a = await tx.get(db().doc(`users/${member.id}/following/${s.ownerUid}`));
          const b = await tx.get(db().doc(`users/${s.ownerUid}/following/${member.id}`));
          if (!a.exists || !b.exists) continue;
        }
        if (attendee && plan?.["saved"] && plan["attendance"] === "visible" && sessionParticipation(attendee) &&
          (s.audience === "private" ? plan["invited"] : sessionAdult(attendee)) &&
          !sessionBlocked(attendee, c.user, member.id, uid) && !sessionBlocked(attendee, c.owner, member.id, s.ownerUid)) {
          result.push({ uid: member.id, name: attendee.display_name || "PK Spot user" });
        }
      }
      return result;
    }
    if (!c.isOwner || !sessionParticipation(c.user)) throw denied();
    if (input["action"] === "invite" || input["action"] === "revoke") {
      if (s.audience !== "private" || s.cancelled) throw denied();
      const target = identifier(input["uid"]);
      if (target === uid) throw new HttpsError("invalid-argument", "Already the organizer.");
      const inviteRef = sessionRef(id).collection("invitations").doc(target);
      const invitation = await tx.get(inviteRef);
      const invitations = await tx.get(sessionRef(id).collection("invitations").limit(50));
      if (input["action"] === "invite") {
        const other = (await tx.get(userRef(target))).data() as UserSchema | undefined;
        const a = await tx.get(db().doc(`users/${uid}/following/${target}`));
        const b = await tx.get(db().doc(`users/${target}/following/${uid}`));
        if (!a.exists || !b.exists || !sessionParticipation(other) || sessionBlocked(c.user, other, uid, target)) throw denied();
        if (!invitation.exists && invitations.size >= 50) throw new HttpsError("resource-exhausted", "Invite limit reached.");
        const existing = (await tx.get(planRef(target, id))).data();
        tx.set(inviteRef, { uid: target });
        tx.set(planRef(target, id), { sessionId: id, saved: existing?.["saved"] === true, attendance: existing?.["attendance"] ?? "private", reminder: existing?.["reminder"] === true,
          invited: true, startsAt: s.startsAt, revision: s.revision });
      } else {
        tx.delete(inviteRef);
        tx.delete(planRef(target, id));
        tx.delete(sessionRef(id).collection("attendees").doc(target));
      }
      return { ok: true };
    }
    if (input["action"] === "invitations") {
      return (await tx.get(sessionRef(id).collection("invitations").limit(50))).docs.map(doc => doc.id);
    }
    if (input["action"] === "cancel") {
      tx.update(sessionRef(id), { cancelled: true, revision: s.revision + 1 });
      return { ok: true };
    }
    if (input["action"] === "update") {
      const details = parseSessionInput(input["session"]);
      if (details.audience !== s.audience || s.cancelled) throw new HttpsError("failed-precondition", "Audience cannot be changed. Create another session.");
      if (s.audience === "community" && !sessionAdult(c.user)) throw denied();
      if (!(await tx.get(db().doc(`spots/${details.spotId}`))).exists) throw new HttpsError("not-found", "Spot unavailable.");
      tx.update(sessionRef(id), { ...details, revision: s.revision + 1 });
      return { ok: true };
    }
    throw new HttpsError("invalid-argument", "Unknown action.");
  });
});

/** Reminders are scheduled from private plans, never RSVPs or public counters. */
export const schedulePlannedSessionReminder = onDocumentWritten({ document: "users/{uid}/session_plans/{id}", region: "europe-west1", retry: true }, async event => {
  const plan = event.data?.after.data();
  if (!plan?.["saved"] || !plan["reminder"]) return;
  const session = (await sessionRef(event.params.id).get()).data() as PlannedSession | undefined;
  if (!session || session.cancelled || session.startsAt <= Date.now()) return;
  await upsertPendingIntent(`session-${event.params.id}-${event.params.uid}-${session.revision}`, {
    recipientUid: event.params.uid, type: "event_reminder", sourcePath: event.data!.after.ref.path,
    sendAfter: Timestamp.fromMillis(Math.max(Date.now(), session.startsAt - 30 * 60000)), expiresAt: Timestamp.fromMillis(session.startsAt),
    path: `/events/session/${session.id}`, channelId: "event_reminders",
    payload: { session_id: session.id, session_revision: String(session.revision), event_name: "PK Spot", venue_name: "", reminder_offset_minutes: "30", rsvp: "interested" },
  });
});

export async function plannedSessionReminderAllowed(uid: string, id: string, revision: string, update = false): Promise<boolean> {
  return db().runTransaction(async tx => {
    try {
      const c = await context(tx, id, uid);
      return enabled.value() && String(c.session.revision) === revision && c.plan?.["saved"] === true && sessionParticipation(c.user) &&
        (update || (!c.session.cancelled && c.session.startsAt > Date.now() && c.plan["reminder"] === true));
    } catch (error) { if (error instanceof HttpsError && error.code === "permission-denied") return false; throw error; }
  });
}

// Paginated fanout only touches private indexes; savers are never returned to the host.
export const refreshPlannedSessionPlans = onDocumentUpdated({ document: "planned_sessions/{id}", region: "europe-west1", retry: true }, async event => {
  let cursor: admin.firestore.QueryDocumentSnapshot | undefined;
  while (true) {
    let query = db().collectionGroup("session_plans").where("sessionId", "==", event.params.id).limit(200);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) return;
    for (const doc of page.docs) {
      await db().runTransaction(async tx => {
        const session = (await tx.get(sessionRef(event.params.id))).data() as PlannedSession | undefined;
        const plan = await tx.get(doc.ref);
        if (!session || !plan.exists) return;
        // Read current state rather than an out-of-order trigger payload.
        tx.update(doc.ref, { startsAt: session.startsAt, revision: session.revision });
      });
      const current = (await sessionRef(event.params.id).get()).data() as PlannedSession | undefined;
      if (current && doc.data()["saved"] === true) {
        const recipientUid = doc.ref.parent.parent!.id;
        await upsertPendingIntent(`session-update-${current.id}-${recipientUid}-${current.revision}`, {
          recipientUid, type: "event_update", sourcePath: doc.ref.path,
          sendAfter: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
          path: `/events/session/${current.id}`, channelId: "event_updates",
          payload: { session_id: current.id, session_revision: String(current.revision), session_update: "true" },
        });
      }
    }
    cursor = page.docs.at(-1);
  }
});

export async function deletePlannedSessionData(uid: string): Promise<void> {
  const owned = await db().collection("planned_sessions").where("ownerUid", "==", uid).get();
  for (const session of owned.docs) {
    // Removing the meeting first immediately invalidates every callable read.
    await db().recursiveDelete(session.ref);
    while (true) {
      const plans = await db().collectionGroup("session_plans").where("sessionId", "==", session.id).limit(200).get();
      if (plans.empty) break;
      const batch = db().batch();
      plans.docs.forEach(plan => batch.delete(plan.ref));
      await batch.commit();
    }
  }
  const plans = await db().collection(`users/${uid}/session_plans`).get();
  for (const plan of plans.docs) {
    await sessionRef(plan.id).collection("attendees").doc(uid).delete();
    await sessionRef(plan.id).collection("invitations").doc(uid).delete();
  }
  await db().recursiveDelete(db().collection(`users/${uid}/session_plans`));
  await db().doc(`planned_session_limits/${uid}`).delete();
}
