import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { EventSchema } from "../../src/db/schemas/EventSchema";
import type { EventRSVPSchema } from "../../src/db/schemas/EventRSVPSchema";
import type {
  NotificationIntentType,
  NotificationPreferencesSchema,
  NotificationRegistrationSchema,
} from "../../src/db/schemas/NotificationSchema";

type IntentChannel = "social" | "events" | "account";
type SpotEditOutcome = "approved" | "rejected";

interface SpotEditNotificationSource {
  approved?: boolean;
  review_status?: "pending" | "approved" | "rejected";
  user?: { uid?: string };
  data?: { name?: unknown };
}

interface IntentInput {
  recipientUid: string;
  type: NotificationIntentType;
  sourcePath: string;
  sendAfter: Timestamp;
  expiresAt: Timestamp;
  path: string;
  channelId: IntentChannel;
  payload: Record<string, string>;
}

interface StoredIntent {
  recipient_uid: string;
  type: NotificationIntentType;
  source_path: string;
  send_after: Timestamp;
  expires_at: Timestamp;
  path: string;
  channel_id: IntentChannel;
  payload: Record<string, string>;
  status: "pending" | "processing" | "sent" | "cancelled" | "failed" | "skipped";
  attempts: number;
  created_at?: Timestamp;
}

const INTENTS = "notification_intents";
const EVENT_REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;
const MAX_DUE_INTENTS = 100;
const MAX_SEND_ATTEMPTS = 3;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const RETRY_DELAY_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);
const PREFERENCE_BY_TYPE: Record<
  NotificationIntentType,
  keyof NotificationPreferencesSchema
> = {
  follow_request: "follow_requests",
  event_reminder: "event_reminders",
  event_update: "event_updates",
  spot_edit_update: "spot_edit_updates",
};

export const onFollowRequestNotificationCreate = onDocumentWritten(
  "users/{userId}/follow_requests/{requesterId}",
  async (event) => {
    const change = event.data;
    if (!change) return;
    const snapshot = change.after.exists ? change.after : change.before;

    const userId = String(event.params.userId);
    const requesterId = String(event.params.requesterId);
    const data = snapshot.data();
    if (!data) return;
    const requestedAt = Number(
      data["requested_at_raw_ms"] ?? Date.parse(event.time),
    );
    const intentId = `follow_request_${userId}_${requesterId}_${requestedAt}`;
    if (!change.after.exists) {
      await cancelIntent(intentId, "follow_request_removed");
      return;
    }

    await createIntent(intentId, {
      recipientUid: userId,
      type: "follow_request",
      sourcePath: snapshot.ref.path,
      sendAfter: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
      path: "/profile",
      channelId: "social",
      payload: {
        requester_id: requesterId,
        requester_name: stringValue(data["display_name"], "Someone"),
      },
    });
  },
);

export const onEventRsvpNotificationWrite = onDocumentWritten(
  "events/{eventId}/rsvps/{userId}",
  async (event) => {
    const eventId = String(event.params.eventId);
    const userId = String(event.params.userId);
    const intentId = eventReminderIntentId(eventId, userId);
    const after = event.data?.after.exists
      ? (event.data.after.data() as EventRSVPSchema)
      : null;

    if (!after || (after.rsvp !== "going" && after.rsvp !== "interested")) {
      await cancelIntent(intentId, "rsvp_removed");
      return;
    }

    const eventSnapshot = await admin.firestore().doc(`events/${eventId}`).get();
    if (!eventSnapshot.exists) {
      await cancelIntent(intentId, "event_missing");
      return;
    }

    await upsertEventReminder(
      intentId,
      userId,
      eventId,
      eventSnapshot.data() as EventSchema,
      `events/${eventId}/rsvps/${userId}`,
    );
  },
);

export const onEventNotificationSourceWrite = onDocumentWritten(
  "events/{eventId}",
  async (event) => {
    const changeEvent = event.data;
    if (!changeEvent?.before.exists || !changeEvent.after.exists) return;

    const before = changeEvent.before.data() as EventSchema;
    const after = changeEvent.after.data() as EventSchema;
    const change = eventChange(before, after);
    if (!change) return;

    const eventId = String(event.params.eventId);
    const rsvps = await changeEvent.after.ref.collection("rsvps").get();
    const recipients = rsvps.docs.filter((doc) => {
      const rsvp = (doc.data() as EventRSVPSchema).rsvp;
      return rsvp === "going" || rsvp === "interested";
    });
    if (recipients.length === 0) return;

    const updateMarker =
      changeEvent.after.updateTime?.toMillis() ?? Date.parse(event.time);
    const path = eventPath(eventId, after);
    await Promise.all(
      recipients.map(async (rsvp) => {
        await createIntent(
          `event_update_${eventId}_${rsvp.id}_${updateMarker}`,
          {
            recipientUid: rsvp.id,
            type: "event_update",
            sourcePath: changeEvent.after.ref.path,
            sendAfter: Timestamp.now(),
            expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
            path,
            channelId: "events",
            payload: {
              event_id: eventId,
              event_name: after.name,
              change,
            },
          },
        );

        const reminderId = eventReminderIntentId(eventId, rsvp.id);
        if (after.published === false) {
          await cancelIntent(reminderId, "event_unpublished");
        } else if (change === "time") {
          await upsertEventReminder(
            reminderId,
            rsvp.id,
            eventId,
            after,
            rsvp.ref.path,
          );
        }
      }),
    );
  },
);

export const onSpotEditNotificationWrite = onDocumentWritten(
  "spots/{spotId}/edits/{editId}",
  async (event) => {
    if (!event.data?.after.exists) return;

    const before = event.data.before.exists
      ? (event.data.before.data() as SpotEditNotificationSource)
      : null;
    const after = event.data.after.data() as SpotEditNotificationSource;
    const previousOutcome = spotEditOutcome(before);
    const outcome = spotEditOutcome(after);
    if (!outcome || outcome === previousOutcome || !after.user?.uid) return;

    const spotId = String(event.params.spotId);
    const editId = String(event.params.editId);
    const spotSnapshot = await admin.firestore().doc(`spots/${spotId}`).get();
    const spotData = spotSnapshot.data();
    const spotName = displayName(
      spotData?.["name"] ?? after.data?.name,
      "your Spot",
    );
    const spotSlug = stringValue(spotData?.["slug"], spotId);

    await createIntent(`spot_edit_${spotId}_${editId}_${outcome}`, {
      recipientUid: after.user.uid,
      type: "spot_edit_update",
      sourcePath: event.data.after.ref.path,
      sendAfter: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 90 * DAY_MS),
      path: `/s/${encodeURIComponent(spotSlug)}`,
      channelId: "account",
      payload: {
        spot_id: spotId,
        spot_name: spotName,
        outcome,
      },
    });
  },
);

export const onNotificationIntentWrite = onDocumentWritten(
  "notification_intents/{intentId}",
  async (event) => {
    const change = event.data;
    if (!change) return;

    const before = change.before.exists
      ? (change.before.data() as StoredIntent)
      : null;
    const after = change.after.exists
      ? (change.after.data() as StoredIntent)
      : null;
    const source = after ?? before;
    if (!source?.recipient_uid) return;

    if (before && after && sameFeedProjection(before, after)) return;

    const now = Timestamp.now();
    const feedRef = admin
      .firestore()
      .doc(
        `users/${source.recipient_uid}/notifications/${String(event.params.intentId)}`,
      );
    if (!after) {
      await feedRef.set(
        {
          active: false,
          invalidated_at_raw_ms: now.toMillis(),
          updated_at_raw_ms: now.toMillis(),
        },
        { merge: true },
      );
      return;
    }

    const availableAt = adminTimestamp(after.send_after) ?? now;
    const expiresAt =
      adminTimestamp(after.expires_at) ??
      Timestamp.fromMillis(now.toMillis() + 30 * DAY_MS);
    const createdAt = adminTimestamp(after.created_at) ?? now;
    const active = after.status !== "cancelled";
    await feedRef.set(
      {
        type: after.type,
        source_path: after.source_path,
        dedupe_key: String(event.params.intentId),
        path: after.path,
        payload: after.payload,
        active,
        created_at: createdAt,
        created_at_raw_ms: createdAt.toMillis(),
        available_at: availableAt,
        available_at_raw_ms: availableAt.toMillis(),
        expires_at: expiresAt,
        expires_at_raw_ms: expiresAt.toMillis(),
        updated_at_raw_ms: now.toMillis(),
        invalidated_at_raw_ms: active
          ? FieldValue.delete()
          : now.toMillis(),
      },
      { merge: true },
    );
  },
);

export const sendDueNotificationIntents = onSchedule(
  { schedule: "every 1 minutes", timeZone: "UTC" },
  async () => {
    const db = admin.firestore();
    const now = Timestamp.now();
    const staleBefore = Timestamp.fromMillis(
      now.toMillis() - STALE_PROCESSING_MS,
    );

    const stale = await db
      .collection(INTENTS)
      .where("status", "==", "processing")
      .where("processing_started_at", "<=", staleBefore)
      .limit(MAX_DUE_INTENTS)
      .get();
    if (!stale.empty) {
      const batch = db.batch();
      for (const doc of stale.docs) {
        batch.update(doc.ref, {
          status: "pending",
          processing_started_at: FieldValue.delete(),
          updated_at: now,
        });
      }
      await batch.commit();
    }

    const due = await db
      .collection(INTENTS)
      .where("status", "==", "pending")
      .where("send_after", "<=", now)
      .orderBy("send_after", "asc")
      .limit(MAX_DUE_INTENTS)
      .get();

    for (const snapshot of due.docs) {
      await processIntent(snapshot.ref);
    }
  },
);

async function createIntent(id: string, input: IntentInput): Promise<void> {
  const ref = admin.firestore().collection(INTENTS).doc(id);
  try {
    await ref.create(intentDocument(id, input));
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code !== 6 && code !== "already-exists") throw error;
  }
}

function intentDocument(
  id: string,
  input: IntentInput,
): Record<string, unknown> {
  const now = Timestamp.now();
  return {
    recipient_uid: input.recipientUid,
    type: input.type,
    source_path: input.sourcePath,
    send_after: input.sendAfter,
    expires_at: input.expiresAt,
    dedupe_key: id,
    status: "pending",
    path: input.path,
    channel_id: input.channelId,
    payload: input.payload,
    attempts: 0,
    created_at: now,
    updated_at: now,
  };
}

async function upsertEventReminder(
  intentId: string,
  userId: string,
  eventId: string,
  eventData: EventSchema,
  sourcePath: string,
): Promise<void> {
  const start = adminTimestamp(eventData.start);
  if (!start || eventData.published === false) {
    await cancelIntent(intentId, "event_unavailable");
    return;
  }

  const sendAfter = Timestamp.fromMillis(
    start.toMillis() - EVENT_REMINDER_LEAD_MS,
  );
  if (sendAfter.toMillis() <= Date.now()) {
    await cancelIntent(intentId, "reminder_window_passed");
    return;
  }

  const input: IntentInput = {
    recipientUid: userId,
    type: "event_reminder",
    sourcePath,
    sendAfter,
    expiresAt: Timestamp.fromMillis(start.toMillis() + DAY_MS),
    path: eventPath(eventId, eventData),
    channelId: "events",
    payload: {
      event_id: eventId,
      event_name: eventData.name,
      starts_at: start.toDate().toISOString(),
    },
  };
  const ref = admin.firestore().collection(INTENTS).doc(intentId);
  await admin.firestore().runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const existingData = existing.data() as StoredIntent | undefined;
    const sameStart =
      existingData?.payload?.["starts_at"] === input.payload["starts_at"];
    if (existingData?.status === "sent" && sameStart) return;
    transaction.set(ref, intentDocument(intentId, input), { merge: false });
  });
}

async function cancelIntent(intentId: string, reason: string): Promise<void> {
  const ref = admin.firestore().collection(INTENTS).doc(intentId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.["status"] === "sent") return;
  await ref.set(
    {
      status: "cancelled",
      failure_reason: reason,
      cancelled_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    },
    { merge: true },
  );
}

async function processIntent(
  ref: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const db = admin.firestore();
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data()?.["status"] !== "pending") {
      return null;
    }
    const attempts = Number(snapshot.data()?.["attempts"] ?? 0) + 1;
    transaction.update(ref, {
      status: "processing",
      attempts,
      processing_started_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
    return { ...(snapshot.data() as StoredIntent), attempts };
  });
  if (!claimed) return;

  try {
    const result = await deliverIntent(ref.id, claimed);
    await ref.update({
      status: result.status,
      delivery_count: result.deliveryCount,
      failure_reason: result.reason ?? FieldValue.delete(),
      sent_at: result.status === "sent" ? Timestamp.now() : FieldValue.delete(),
      processing_started_at: FieldValue.delete(),
      updated_at: Timestamp.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Notification intent delivery failed", {
      intentId: ref.id,
      recipientUid: claimed.recipient_uid,
      type: claimed.type,
      error: message,
    });
    const retry = claimed.attempts < MAX_SEND_ATTEMPTS;
    await ref.update({
      status: retry ? "pending" : "failed",
      send_after: retry
        ? Timestamp.fromMillis(Date.now() + RETRY_DELAY_MS)
        : claimed.send_after,
      failure_reason: message.slice(0, 500),
      processing_started_at: FieldValue.delete(),
      updated_at: Timestamp.now(),
    });
  }
}

async function deliverIntent(
  intentId: string,
  intent: StoredIntent,
): Promise<{
  status: "sent" | "skipped";
  deliveryCount: number;
  reason?: string;
}> {
  if (intent.expires_at.toMillis() <= Date.now()) {
    return { status: "skipped", deliveryCount: 0, reason: "expired" };
  }

  const db = admin.firestore();
  const privateData = await db
    .doc(`users/${intent.recipient_uid}/private_data/main`)
    .get();
  const preferences = privateData.data()?.[
    "notification_preferences"
  ] as NotificationPreferencesSchema | undefined;
  if (preferences?.[PREFERENCE_BY_TYPE[intent.type]] !== true) {
    return { status: "skipped", deliveryCount: 0, reason: "preference_disabled" };
  }

  const registrations = await db
    .collection(`users/${intent.recipient_uid}/notification_registrations`)
    .where("enabled", "==", true)
    .limit(500)
    .get();
  const active = registrations.docs
    .map((doc) => ({
      ref: doc.ref,
      data: doc.data() as NotificationRegistrationSchema,
    }))
    .filter(
      ({ data }) =>
        data.permission_state === "granted" &&
        typeof data.token === "string" &&
        data.token.length > 20,
    );
  if (active.length === 0) {
    return { status: "skipped", deliveryCount: 0, reason: "no_active_registration" };
  }

  let deliveryCount = 0;
  const invalidRefs: FirebaseFirestore.DocumentReference[] = [];
  const byLocale = new Map<string, typeof active>();
  for (const registration of active) {
    const locale = normalizeLocale(registration.data.locale);
    byLocale.set(locale, [...(byLocale.get(locale) ?? []), registration]);
  }
  for (const [locale, group] of byLocale) {
    const copy = notificationCopy(intent, locale);
    const response = await admin.messaging().sendEachForMulticast({
      tokens: group.map(({ data }) => data.token),
      notification: copy,
      data: {
        intent_id: intentId,
        type: intent.type,
        path: intent.path,
      },
      android: {
        notification: {
          channelId: intent.channel_id,
          tag: intentId,
        },
      },
      apns: {
        payload: { aps: { sound: "default" } },
      },
      webpush: {
        fcmOptions: { link: `https://pkspot.app${intent.path}` },
      },
    });
    deliveryCount += response.successCount;
    response.responses.forEach((item, index) => {
      if (!item.success && item.error && INVALID_TOKEN_CODES.has(item.error.code)) {
        invalidRefs.push(group[index].ref);
      }
    });
  }

  if (invalidRefs.length > 0) {
    const batch = db.batch();
    for (const registrationRef of invalidRefs) {
      batch.update(registrationRef, {
        enabled: false,
        disabled_reason: "invalid_token",
        last_seen_at_raw_ms: Date.now(),
      });
    }
    await batch.commit();
  }

  if (deliveryCount === 0) {
    throw new Error("FCM did not accept the message for any active registration.");
  }
  return { status: "sent", deliveryCount };
}

function notificationCopy(
  intent: StoredIntent,
  locale: string,
): { title: string; body: string } {
  const p = intent.payload;
  const language = locale.split("-")[0];
  if (language === "de") {
    if (intent.type === "follow_request") {
      return { title: "Neue Folgeanfrage", body: `${p["requester_name"]} möchte dir folgen.` };
    }
    if (intent.type === "event_reminder") {
      return { title: p["event_name"], body: "Beginnt in zwei Stunden." };
    }
    if (intent.type === "event_update") {
      return { title: "Event aktualisiert", body: `${p["event_name"]}: ${germanEventChange(p["change"])}.` };
    }
    return {
      title: p["outcome"] === "approved" ? "Spot-Bearbeitung bestätigt" : "Spot-Bearbeitung abgelehnt",
      body: `${p["spot_name"]} wurde ${p["outcome"] === "approved" ? "bestätigt" : "abgelehnt"}.`,
    };
  }

  if (intent.type === "follow_request") {
    return { title: "New follow request", body: `${p["requester_name"]} wants to follow you.` };
  }
  if (intent.type === "event_reminder") {
    return { title: p["event_name"], body: "Starts in two hours." };
  }
  if (intent.type === "event_update") {
    return { title: "Event updated", body: `${p["event_name"]}: ${englishEventChange(p["change"])}.` };
  }
  return {
    title: p["outcome"] === "approved" ? "Spot edit approved" : "Spot edit rejected",
    body: `${p["spot_name"]} was ${p["outcome"] === "approved" ? "approved" : "rejected"}.`,
  };
}

function eventChange(before: EventSchema, after: EventSchema): string | null {
  if (before.published !== false && after.published === false) return "cancelled";
  if (!sameTimestamp(before.start, after.start) || !sameTimestamp(before.end, after.end)) {
    return "time";
  }
  if (
    before.venue_string !== after.venue_string ||
    before.locality_string !== after.locality_string ||
    JSON.stringify(before.location_raw) !== JSON.stringify(after.location_raw)
  ) {
    return "location";
  }
  if (before.name !== after.name) return "details";
  return null;
}

function spotEditOutcome(
  edit: SpotEditNotificationSource | null,
): SpotEditOutcome | null {
  if (!edit) return null;
  if (edit.review_status === "rejected") return "rejected";
  if (edit.approved === true || edit.review_status === "approved") {
    return "approved";
  }
  return null;
}

function eventReminderIntentId(eventId: string, userId: string): string {
  return `event_reminder_${eventId}_${userId}`;
}

function sameFeedProjection(before: StoredIntent, after: StoredIntent): boolean {
  return (
    (before.status !== "cancelled") === (after.status !== "cancelled") &&
    before.type === after.type &&
    before.recipient_uid === after.recipient_uid &&
    before.source_path === after.source_path &&
    before.path === after.path &&
    before.send_after?.toMillis() === after.send_after?.toMillis() &&
    before.expires_at?.toMillis() === after.expires_at?.toMillis() &&
    JSON.stringify(before.payload) === JSON.stringify(after.payload)
  );
}

function eventPath(eventId: string, eventData: EventSchema): string {
  return `/events/${encodeURIComponent(eventData.slug ?? eventId)}`;
}

function adminTimestamp(value: unknown): Timestamp | null {
  if (value instanceof Timestamp) return value;
  if (!value || typeof value !== "object") return null;
  const seconds = (value as { seconds?: unknown }).seconds;
  const nanoseconds = (value as { nanoseconds?: unknown }).nanoseconds;
  return typeof seconds === "number" && typeof nanoseconds === "number"
    ? new Timestamp(seconds, nanoseconds)
    : null;
}

function sameTimestamp(left: unknown, right: unknown): boolean {
  return adminTimestamp(left)?.toMillis() === adminTimestamp(right)?.toMillis();
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function displayName(value: unknown, fallback: string): string {
  if (typeof value === "string") return stringValue(value, fallback);
  if (!value || typeof value !== "object") return fallback;
  const names = value as Record<string, unknown>;
  const english = names["en"];
  if (typeof english === "string" && english.trim().length > 0) {
    return english.trim();
  }
  const first = Object.values(names).find(
    (name): name is string => typeof name === "string" && name.trim().length > 0,
  );
  return first?.trim() ?? fallback;
}

function normalizeLocale(locale: string): string {
  return typeof locale === "string" && locale.length > 0 ? locale : "en";
}

function englishEventChange(change: string): string {
  if (change === "cancelled") return "it was cancelled";
  if (change === "time") return "the time changed";
  if (change === "location") return "the location changed";
  return "the details changed";
}

function germanEventChange(change: string): string {
  if (change === "cancelled") return "wurde abgesagt";
  if (change === "time") return "die Zeit wurde geändert";
  if (change === "location") return "der Ort wurde geändert";
  return "die Details wurden geändert";
}
