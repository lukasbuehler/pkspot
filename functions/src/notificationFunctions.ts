import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { EventSchema } from "../../src/db/schemas/EventSchema";
import type { EventRSVPSchema } from "../../src/db/schemas/EventRSVPSchema";
import type {
  NotificationIntentType,
  NotificationPreferencesSchema,
  NotificationRegistrationSchema,
} from "../../src/db/schemas/NotificationSchema";
import {
  shouldNotifySpotEditOutcome,
  spotEditOutcome,
} from "./spotEditNotificationPolicy";

type IntentChannel =
  | "follow_incoming"
  | "follow_relationships"
  | "event_reminders"
  | "event_updates"
  | "spot_edit_updates"
  | "spot_report_updates"
  | "media_report_updates"
  | "community_info_updates"
  | "community_events"
  | "community_spot_digest";
type ReviewOutcome = "approved" | "rejected";
type ReportOutcome = "action_taken" | "dismissed";
type ReportKind = "spot" | "media";

interface SpotEditNotificationSource {
  approved?: boolean;
  review_status?: "pending" | "approved" | "rejected";
  user?: { uid?: string };
  data?: { name?: unknown };
  processing_status?: string;
  decision_source?:
    | "automatic_immediate"
    | "community_vote"
    | "organization_review";
}

export interface IntentInput {
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
  failure_reason?: string;
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
  follow_accepted: "follow_requests",
  new_follower: "follow_requests",
  event_reminder: "event_reminders",
  event_update: "event_updates",
  spot_edit_update: "spot_edit_updates",
  spot_report_update: "report_updates",
  media_report_update: "report_updates",
  community_info_update: "community_info_updates",
  community_event: "community_events",
  community_spot_digest: "community_spot_digest",
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
      channelId: "follow_incoming",
      payload: {
        requester_id: requesterId,
        requester_name: stringValue(data["display_name"], "Someone"),
      },
    });
  },
);

export const onNewFollowerNotificationWrite = onDocumentWritten(
  "users/{userId}/followers/{followerId}",
  async (event) => {
    const change = event.data;
    if (!change) return;

    const snapshot = change.after.exists ? change.after : change.before;
    const userId = String(event.params.userId);
    const followerId = String(event.params.followerId);
    const data = snapshot.data();
    if (!data) return;

    const followedAt = Number(
      data["start_following_raw_ms"] ?? Date.parse(event.time),
    );
    const intentId = `new_follower_${userId}_${followerId}_${followedAt}`;
    if (!change.after.exists) {
      await cancelIntent(intentId, "follower_removed");
      return;
    }

    const userSnapshot = await admin.firestore().doc(`users/${userId}`).get();
    if (userSnapshot.data()?.["account_privacy"] === "private") {
      await cancelIntent(intentId, "private_account");
      return;
    }

    const mutualSnapshot = await admin
      .firestore()
      .doc(`users/${userId}/following/${followerId}`)
      .get();
    const isMutual = mutualSnapshot.exists;

    await createIntent(intentId, {
      recipientUid: userId,
      type: "new_follower",
      sourcePath: snapshot.ref.path,
      sendAfter: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
      path: `/u/${encodeURIComponent(followerId)}`,
      channelId: isMutual ? "follow_relationships" : "follow_incoming",
      payload: {
        follower_id: followerId,
        follower_name: stringValue(data["display_name"], "Someone"),
        relationship: isMutual ? "mutual" : "following",
      },
    });
  },
);

export const onFollowingNotificationWrite = onDocumentWritten(
  "users/{userId}/following/{followedUserId}",
  async (event) => {
    const change = event.data;
    if (!change) return;

    const snapshot = change.after.exists ? change.after : change.before;
    const userId = String(event.params.userId);
    const followedUserId = String(event.params.followedUserId);
    const data = snapshot.data();
    if (!data) return;

    const followedAt = Number(
      data["start_following_raw_ms"] ?? Date.parse(event.time),
    );
    const intentId = `follow_accepted_${userId}_${followedUserId}_${followedAt}`;
    if (!change.after.exists) {
      await cancelIntent(intentId, "following_removed");
      return;
    }

    const followedUser = await admin
      .firestore()
      .doc(`users/${followedUserId}`)
      .get();
    if (followedUser.data()?.["account_privacy"] !== "private") return;

    await createIntent(intentId, {
      recipientUid: userId,
      type: "follow_accepted",
      sourcePath: snapshot.ref.path,
      sendAfter: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
      path: `/u/${encodeURIComponent(followedUserId)}`,
      channelId: "follow_relationships",
      payload: {
        followed_user_id: followedUserId,
        followed_user_name: stringValue(
          data["display_name"],
          stringValue(followedUser.data()?.["display_name"], "Someone"),
        ),
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
      after.rsvp,
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
    const structuredOperation =
      typeof after.last_operation_id === "string" &&
      after.last_operation_id !== before.last_operation_id;
    const reminderStateChanged =
      change === "time" ||
      before.lifecycle_status !== after.lifecycle_status ||
      (before.published !== false) !== (after.published !== false);
    if (!change && !reminderStateChanged) return;

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
    const updatesAllowed =
      after.notification_policy !== "none" &&
      after.notification_policy !== "reminders";
    const subscriptions = updatesAllowed
      ? await changeEvent.after.ref.collection("live_update_subscribers").get()
      : null;
    const subscriptionByUser = new Map(
      (subscriptions?.docs ?? []).map((subscription) => [
        subscription.id,
        subscription.data(),
      ]),
    );
    await Promise.all(
      recipients.map(async (rsvp) => {
        const subscription = subscriptionByUser.get(rsvp.id);
        if (
          change &&
          !structuredOperation &&
          updatesAllowed &&
          (!subscription || subscription["active"] === true)
        ) {
          await createIntent(
            `event_update_${eventId}_${rsvp.id}_${updateMarker}`,
            {
              recipientUid: rsvp.id,
              type: "event_update",
              sourcePath: changeEvent.after.ref.path,
              sendAfter: Timestamp.now(),
              expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
              path,
              channelId: "event_updates",
              payload: {
                event_id: eventId,
                event_name: after.name,
                change,
              },
            },
          );
        }

        const reminderId = eventReminderIntentId(eventId, rsvp.id);
        if (
          after.published === false ||
          after.lifecycle_status === "cancelled"
        ) {
          await cancelIntent(
            reminderId,
            after.lifecycle_status === "cancelled"
              ? "event_cancelled"
              : "event_unpublished",
          );
        } else if (reminderStateChanged) {
          await upsertEventReminder(
            reminderId,
            rsvp.id,
            eventId,
            after,
            rsvp.ref.path,
            (rsvp.data() as EventRSVPSchema).rsvp,
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
    if (
      !outcome ||
      outcome === previousOutcome ||
      !after.user?.uid ||
      !shouldNotifySpotEditOutcome(before, after)
    ) return;

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
      channelId: "spot_edit_updates",
      payload: {
        spot_id: spotId,
        spot_name: spotName,
        outcome,
      },
    });
  },
);

export const onModerationActionNotificationCreate = onDocumentCreated(
  "moderation_actions/{actionId}",
  async (event) => {
    const action = event.data?.data();
    const sourceType = action?.["source_type"];
    const kind: ReportKind | null =
      sourceType === "spot_report"
        ? "spot"
        : sourceType === "media_report"
          ? "media"
          : null;
    if (!kind) return;

    const outcome = reportOutcomeForAction(action?.["action_type"]);
    const sourcePath = stringValue(action?.["source_path"], "");
    const source = recordValue(action?.["source_snapshot"]);
    const reporterUid = stringValue(recordValue(source["user"])["uid"], "");
    if (!outcome || !sourcePath || !reporterUid) return;

    await createReportIntent(kind, sourcePath, source, reporterUid, outcome);
  },
);

export const onSpotReportNotificationWrite = onDocumentWritten(
  "spots/{spotId}/reports/{reportId}",
  async (event) => {
    if (!event.data?.after.exists) return;
    const before = event.data.before.exists
      ? recordValue(event.data.before.data())
      : null;
    const after = recordValue(event.data.after.data());
    const outcome = reportOutcomeTransition(before, after);
    const reporterUid = stringValue(recordValue(after["user"])["uid"], "");
    if (!outcome || !reporterUid) return;

    await createReportIntent(
      "spot",
      event.data.after.ref.path,
      after,
      reporterUid,
      outcome,
    );
  },
);

export const onMediaReportNotificationWrite = onDocumentWritten(
  "media_reports/{reportId}",
  async (event) => {
    if (!event.data?.after.exists) return;
    const before = event.data.before.exists
      ? recordValue(event.data.before.data())
      : null;
    const after = recordValue(event.data.after.data());
    const outcome = reportOutcomeTransition(before, after);
    const reporterUid = stringValue(recordValue(after["user"])["uid"], "");
    if (!outcome || !reporterUid || after["source"] === "scanner") return;

    await createReportIntent(
      "media",
      event.data.after.ref.path,
      after,
      reporterUid,
      outcome,
    );
  },
);

export const onRootMediaReportNotificationWrite = onDocumentWritten(
  "reports/{reportId}",
  async (event) => {
    if (!event.data?.after.exists) return;
    const before = event.data.before.exists
      ? recordValue(event.data.before.data())
      : null;
    const after = recordValue(event.data.after.data());
    if (after["kind"] !== "media") return;
    const outcome = reportOutcomeTransition(before, after);
    const reporterUid = stringValue(recordValue(after["user"])["uid"], "");
    if (!outcome || !reporterUid || after["source"] === "scanner") return;

    await createReportIntent(
      "media",
      event.data.after.ref.path,
      after,
      reporterUid,
      outcome,
    );
  },
);

export const onCommunityInfoNotificationWrite = onDocumentWritten(
  "community_pages/{communityKey}/edits/{editId}",
  async (event) => {
    if (!event.data?.after.exists) return;
    const before = event.data.before.exists
      ? recordValue(event.data.before.data())
      : null;
    const after = recordValue(event.data.after.data());
    const outcome = reviewOutcomeTransition(before, after);
    const recipientUid = stringValue(recordValue(after["user"])["uid"], "");
    if (!outcome || !recipientUid || after["edit_kind"] !== "knowledge") return;

    const communityKey = String(event.params.communityKey);
    const editId = String(event.params.editId);
    const communityName = stringValue(
      after["community_display_name"],
      "your community info",
    );
    await createIntent(
      `community_info_${communityKey}_${editId}_${outcome}`,
      {
        recipientUid,
        type: "community_info_update",
        sourcePath: event.data.after.ref.path,
        sendAfter: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 90 * DAY_MS),
        path: safeAppPath(
          after["community_path"],
          `/map/communities/${encodeURIComponent(communityKey)}`,
        ),
        channelId: "community_info_updates",
        payload: {
          community_key: communityKey,
          community_name: communityName,
          outcome,
        },
      },
    );
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
    const privateData = await admin.firestore()
      .doc(`users/${source.recipient_uid}/private_data/main`)
      .get();
    const preferences = privateData.data()?.[
      "notification_preferences"
    ] as NotificationPreferencesSchema | undefined;
    const active =
      intentIsActive(after) && notificationPreferenceEnabled(preferences, after.type);
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

export async function createIntent(id: string, input: IntentInput): Promise<void> {
  const ref = admin.firestore().collection(INTENTS).doc(id);
  try {
    await ref.create(intentDocument(id, input));
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code !== 6 && code !== "already-exists") throw error;
  }
}

/** Updates a not-yet-sent deterministic intent, while never resending a sent one. */
export async function upsertPendingIntent(
  id: string,
  input: IntentInput,
): Promise<void> {
  const ref = admin.firestore().collection(INTENTS).doc(id);
  await admin.firestore().runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.data()?.["status"] === "sent") return;
    transaction.set(ref, intentDocument(id, input), { merge: false });
  });
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
  rsvp: EventRSVPSchema["rsvp"],
): Promise<void> {
  const start = adminTimestamp(eventData.start);
  if (
    !start ||
    eventData.published === false ||
    eventData.lifecycle_status === "cancelled" ||
    eventData.notification_policy === "none" ||
    eventData.notification_policy === "event_updates"
  ) {
    await cancelIntent(intentId, "event_unavailable");
    return;
  }

  const subscription = await admin.firestore()
    .doc(`events/${eventId}/live_update_subscribers/${userId}`)
    .get();
  if (
    subscription.exists &&
    subscription.data()?.["event_reminders"] !== true
  ) {
    await cancelIntent(intentId, "event_reminder_disabled");
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
    channelId: "event_reminders",
    payload: {
      event_id: eventId,
      event_name: eventData.name,
      starts_at: start.toDate().toISOString(),
      rsvp,
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
  if (intent.type === "community_event") {
    const eventId = intent.payload["event_id"];
    const eventSnapshot = eventId
      ? await db.doc(`event_discovery/${eventId}`).get()
      : null;
    const eventData = eventSnapshot?.data() as EventSchema | undefined;
    const end = adminTimestamp(eventData?.end);
    if (
      !eventSnapshot?.exists ||
      !end ||
      end.toMillis() <= Date.now() ||
      eventData?.lifecycle_status === "cancelled"
    ) {
      return { status: "skipped", deliveryCount: 0, reason: "event_unavailable" };
    }
  }
  const liveUpdateEventId = intent.payload["update_id"]
    ? intent.payload["event_id"]
    : undefined;
  if (liveUpdateEventId) {
    const subscription = await db
      .doc(
        `events/${liveUpdateEventId}/live_update_subscribers/${intent.recipient_uid}`,
      )
      .get();
    const operational = typeof intent.payload["operation_type"] === "string";
    if (
      operational
        ? subscription.exists && subscription.data()?.["active"] !== true
        : subscription.data()?.["active"] !== true
    ) {
      return {
        status: "skipped",
        deliveryCount: 0,
        reason: "event_subscription_disabled",
      };
    }
  }

  if (intent.type === "event_reminder") {
    const eventId = intent.payload["event_id"];
    if (eventId) {
      const subscription = await db
        .doc(
          `events/${eventId}/live_update_subscribers/${intent.recipient_uid}`,
        )
        .get();
      if (
        subscription.exists &&
        subscription.data()?.["event_reminders"] === false
      ) {
        return {
          status: "skipped",
          deliveryCount: 0,
          reason: "event_reminder_disabled",
        };
      }
    }
  }

  const privateData = await db
    .doc(`users/${intent.recipient_uid}/private_data/main`)
    .get();
  const preferences = privateData.data()?.[
    "notification_preferences"
  ] as NotificationPreferencesSchema | undefined;
  if (!notificationPreferenceEnabled(preferences, intent.type)) {
    return { status: "skipped", deliveryCount: 0, reason: "preference_disabled" };
  }

  if (
    (intent.type === "community_event" ||
      intent.type === "community_spot_digest") &&
    !(await hasEnabledCommunityFollow(db, intent))
  ) {
    return { status: "skipped", deliveryCount: 0, reason: "community_follow_disabled" };
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
        ...(intent.payload["event_id"]
          ? { event_id: intent.payload["event_id"] }
          : {}),
        ...(intent.payload["update_id"]
          ? { update_id: intent.payload["update_id"] }
          : {}),
        ...(intent.payload["live_update_type"]
          ? { live_update_type: intent.payload["live_update_type"] }
          : {}),
        ...(intent.payload["operation_type"]
          ? { operation_type: intent.payload["operation_type"] }
          : {}),
      },
      android: {
        notification: {
          channelId: deliveryChannel(intent),
          tag: intentId,
        },
      },
      apns: {
        payload: { aps: { sound: "default" } },
      },
      webpush: {
        notification: {
          icon: "https://pkspot.app/assets/icons/icon-192.webp",
        },
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

function notificationPreferenceEnabled(
  preferences: NotificationPreferencesSchema | undefined,
  type: NotificationIntentType,
): boolean {
  const value = preferences?.[PREFERENCE_BY_TYPE[type]];
  if (value !== undefined) return value;
  return type === "event_reminder" || type === "event_update";
}

function deliveryChannel(intent: StoredIntent): IntentChannel {
  switch (intent.type) {
    case "follow_request":
      return "follow_incoming";
    case "follow_accepted":
      return "follow_relationships";
    case "new_follower":
      return intent.payload["relationship"] === "mutual"
        ? "follow_relationships"
        : "follow_incoming";
    case "event_reminder":
      return "event_reminders";
    case "event_update":
      return "event_updates";
    case "spot_edit_update":
      return "spot_edit_updates";
    case "spot_report_update":
      return "spot_report_updates";
    case "media_report_update":
      return "media_report_updates";
    case "community_info_update":
      return "community_info_updates";
    case "community_event":
      return "community_events";
    case "community_spot_digest":
      return "community_spot_digest";
  }
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
    if (intent.type === "follow_accepted") {
      return { title: "Folgeanfrage angenommen", body: `${p["followed_user_name"]} hat deine Folgeanfrage angenommen.` };
    }
    if (intent.type === "new_follower") {
      if (p["relationship"] === "mutual") {
        return { title: "Ihr folgt euch jetzt gegenseitig", body: `${p["follower_name"]} folgt dir jetzt auch.` };
      }
      return { title: "Neue Person folgt dir", body: `${p["follower_name"]} folgt dir jetzt.` };
    }
    if (intent.type === "event_reminder") {
      return {
        title: p["event_name"],
        body:
          p["rsvp"] === "interested"
            ? "Beginnt in zwei Stunden. Sag bitte, ob du kommst."
            : "Beginnt in zwei Stunden.",
      };
    }
    if (intent.type === "event_update" && p["update_title"]) {
      return {
        title: p["event_name"],
        body: p["update_message"]
          ? `${p["update_title"]}: ${p["update_message"]}`
          : p["update_title"],
      };
    }
    if (intent.type === "event_update") {
      return { title: "Event aktualisiert", body: `${p["event_name"]}: ${germanEventChange(p["change"])}.` };
    }
    if (intent.type === "spot_report_update") {
      return p["outcome"] === "action_taken"
        ? { title: "Reaktion auf deine Spot-Meldung", body: `Wir haben deine Meldung zu ${p["target_name"]} geprüft und entsprechend reagiert.` }
        : { title: "Spot-Meldung geprüft", body: `Wir haben deine Meldung zu ${p["target_name"]} geprüft und geschlossen.` };
    }
    if (intent.type === "media_report_update") {
      return p["outcome"] === "action_taken"
        ? { title: "Reaktion auf deine Medienmeldung", body: "Wir haben deine Meldung geprüft und entsprechend reagiert." }
        : { title: "Medienmeldung geprüft", body: "Wir haben deine Meldung geprüft und geschlossen." };
    }
    if (intent.type === "community_info_update") {
      return {
        title: p["outcome"] === "approved" ? "Community-Info bestätigt" : "Community-Info abgelehnt",
        body: `Deine Community-Info für ${p["community_name"]} wurde ${p["outcome"] === "approved" ? "bestätigt" : "abgelehnt"}.`,
      };
    }
    if (intent.type === "community_event") {
      return {
        title: `Neues Event in ${p["community_name"]}`,
        body: `${p["event_name"]} wurde veröffentlicht.`,
      };
    }
    if (intent.type === "community_spot_digest") {
      return {
        title: "Spots, die einen Blick wert sind",
        body: `${p["spot_count"]} neu empfohlene Spots in deinen Communities.`,
      };
    }
    return {
      title: p["outcome"] === "approved" ? "Spot-Bearbeitung bestätigt" : "Spot-Bearbeitung abgelehnt",
      body: `${p["spot_name"]} wurde ${p["outcome"] === "approved" ? "bestätigt" : "abgelehnt"}.`,
    };
  }

  if (intent.type === "follow_request") {
    return { title: "New follow request", body: `${p["requester_name"]} wants to follow you.` };
  }
  if (intent.type === "follow_accepted") {
    return { title: "Follow request accepted", body: `${p["followed_user_name"]} accepted your follow request.` };
  }
  if (intent.type === "new_follower") {
    if (p["relationship"] === "mutual") {
      return { title: "New mutual follower", body: `${p["follower_name"]} followed you back.` };
    }
    return { title: "New follower", body: `${p["follower_name"]} started following you.` };
  }
  if (intent.type === "event_reminder") {
    return {
      title: p["event_name"],
      body:
        p["rsvp"] === "interested"
          ? "Starts in two hours. Please let people know if you are going."
          : "Starts in two hours.",
    };
  }
  if (intent.type === "event_update" && p["update_title"]) {
    return {
      title: p["event_name"],
      body: p["update_message"]
        ? `${p["update_title"]}: ${p["update_message"]}`
        : p["update_title"],
    };
  }
  if (intent.type === "event_update") {
    return { title: "Event updated", body: `${p["event_name"]}: ${englishEventChange(p["change"])}.` };
  }
  if (intent.type === "spot_report_update") {
    return p["outcome"] === "action_taken"
      ? { title: "Action taken on your Spot report", body: `We reviewed your report about ${p["target_name"]} and took appropriate action.` }
      : { title: "Spot report reviewed", body: `We reviewed your report about ${p["target_name"]} and closed it.` };
  }
  if (intent.type === "media_report_update") {
    return p["outcome"] === "action_taken"
      ? { title: "Action taken on your media report", body: "We reviewed your report and took appropriate action." }
      : { title: "Media report reviewed", body: "We reviewed your report and closed it." };
  }
  if (intent.type === "community_info_update") {
    return {
      title: p["outcome"] === "approved" ? "Community info approved" : "Community info rejected",
      body: `Your community information for ${p["community_name"]} was ${p["outcome"] === "approved" ? "approved" : "rejected"}.`,
    };
  }
  if (intent.type === "community_event") {
    return {
      title: `New event in ${p["community_name"]}`,
      body: `${p["event_name"]} was just published.`,
    };
  }
  if (intent.type === "community_spot_digest") {
    return {
      title: "Spots worth checking out",
      body: `${p["spot_count"]} newly recommended Spots in your communities.`,
    };
  }
  return {
    title: p["outcome"] === "approved" ? "Spot edit approved" : "Spot edit rejected",
    body: `${p["spot_name"]} was ${p["outcome"] === "approved" ? "approved" : "rejected"}.`,
  };
}

function eventChange(before: EventSchema, after: EventSchema): string | null {
  if (
    before.lifecycle_status !== "cancelled" &&
    after.lifecycle_status === "cancelled"
  ) return "cancelled";
  if (
    before.lifecycle_status === "cancelled" &&
    after.lifecycle_status !== "cancelled"
  ) return "restored";
  if (before.published !== false && after.published === false) return null;
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

async function hasEnabledCommunityFollow(
  db: FirebaseFirestore.Firestore,
  intent: StoredIntent,
): Promise<boolean> {
  const keys = stringArrayPayload(intent.payload["community_keys"]);
  const setting = intent.type === "community_event"
    ? "event_notifications"
    : "spot_digest_notifications";
  const snapshots = await Promise.all(
    keys.map((key) =>
      db.doc(`users/${intent.recipient_uid}/community_follows/${key}`).get(),
    ),
  );
  return snapshots.some((snapshot) => snapshot.data()?.[setting] === true);
}

function stringArrayPayload(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function createReportIntent(
  kind: ReportKind,
  sourcePath: string,
  source: Record<string, unknown>,
  recipientUid: string,
  outcome: ReportOutcome,
): Promise<void> {
  const identity = reportIdentity(kind, sourcePath);
  if (!identity) return;

  const spot = recordValue(source["spot"]);
  const targetName =
    kind === "spot"
      ? displayName(spot["name"], "your reported Spot")
      : "your reported media";
  await createIntent(`${identity.intentPrefix}_${outcome}`, {
    recipientUid,
    type: kind === "spot" ? "spot_report_update" : "media_report_update",
    sourcePath,
    sendAfter: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 90 * DAY_MS),
    path: "/notifications",
    channelId:
      kind === "spot" ? "spot_report_updates" : "media_report_updates",
    payload: {
      outcome,
      target_name: targetName,
    },
  });
}

function reportIdentity(
  kind: ReportKind,
  sourcePath: string,
): { intentPrefix: string } | null {
  if (kind === "spot") {
    const match = sourcePath.match(/^spots\/([^/]+)\/reports\/([^/]+)$/);
    return match
      ? { intentPrefix: `spot_report_${match[1]}_${match[2]}` }
      : null;
  }
  const match = sourcePath.match(/^(?:media_reports|reports)\/([^/]+)$/);
  return match ? { intentPrefix: `media_report_${match[1]}` } : null;
}

function reportOutcomeForAction(value: unknown): ReportOutcome | null {
  if (value === "close_report") return "dismissed";
  return value === "keep_warning" ||
    value === "publish_spot_warning" ||
    value === "delete_media" ||
    value === "delete_spot"
    ? "action_taken"
    : null;
}

function reportOutcomeTransition(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): ReportOutcome | null {
  const previous = before?.["status"];
  const status = after["status"];
  if (status === previous) return null;
  if (status === "resolved") return "action_taken";
  if (status === "dismissed") return "dismissed";
  return null;
}

function reviewOutcomeTransition(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): ReviewOutcome | null {
  const previous = before?.["status"];
  const status = after["status"];
  if (status === previous) return null;
  return status === "approved" || status === "rejected" ? status : null;
}

function eventReminderIntentId(eventId: string, userId: string): string {
  return `event_reminder_${eventId}_${userId}`;
}

function sameFeedProjection(before: StoredIntent, after: StoredIntent): boolean {
  return (
    intentIsActive(before) === intentIsActive(after) &&
    before.type === after.type &&
    before.recipient_uid === after.recipient_uid &&
    before.source_path === after.source_path &&
    before.path === after.path &&
    before.send_after?.toMillis() === after.send_after?.toMillis() &&
    before.expires_at?.toMillis() === after.expires_at?.toMillis() &&
    JSON.stringify(before.payload) === JSON.stringify(after.payload)
  );
}

function intentIsActive(intent: StoredIntent): boolean {
  if (intent.status === "cancelled") return false;
  return !(
    intent.status === "skipped" &&
    (intent.failure_reason === "event_unavailable" ||
      intent.failure_reason === "community_follow_disabled")
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

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function safeAppPath(value: unknown, fallback: string): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
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
  if (change === "restored") return "it is happening again";
  if (change === "time") return "the time changed";
  if (change === "location") return "the location changed";
  return "the details changed";
}

function germanEventChange(change: string): string {
  if (change === "cancelled") return "wurde abgesagt";
  if (change === "restored") return "findet wieder statt";
  if (change === "time") return "die Zeit wurde geändert";
  if (change === "location") return "der Ort wurde geändert";
  return "die Details wurden geändert";
}
