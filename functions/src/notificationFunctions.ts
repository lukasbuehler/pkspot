import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  onDocumentCreated,
  onDocumentWritten,
  onDocumentWrittenWithAuthContext,
} from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { EventLiveUpdateSchema } from "../../src/db/schemas/EventLiveUpdateSchema";
import type { EventSchema } from "../../src/db/schemas/EventSchema";
import type { EventRSVPSchema } from "../../src/db/schemas/EventRSVPSchema";
import type {
  EventReminderOffsetMinutes,
  NotificationActionId,
  NotificationActionSchema,
  NotificationIntentType,
  NotificationPreferenceKey,
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
  reviewed_by_organization_id?: string;
  vote_summary?: {
    yes_count?: number;
    no_count?: number;
  };
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
  threadKey?: string;
  imageUrl?: string;
  actions?: NotificationActionSchema[];
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
  thread_key?: string;
  image_url?: string;
  actions?: NotificationActionSchema[];
  status: "pending" | "processing" | "sent" | "cancelled" | "failed" | "skipped";
  attempts: number;
  created_at?: Timestamp;
  failure_reason?: string;
}

const INTENTS = "notification_intents";
const DEFAULT_EVENT_REMINDER_OFFSETS: EventReminderOffsetMinutes[] = [120];
const ALLOWED_EVENT_REMINDER_OFFSETS = new Set<number>([1440, 120, 30]);
const ACTION_UNDO_MS = 10 * 60 * 1000;
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
  NotificationPreferenceKey
> = {
  follow_request: "follow_requests",
  follow_accepted: "follow_requests",
  new_follower: "follow_requests",
  event_reminder: "event_reminders",
  event_update: "event_updates",
  event_registration_update: "event_updates",
  event_ownership_update: "event_updates",
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
    const requester = await admin.firestore().doc(`users/${requesterId}`).get();
    const requesterData = requester.data();

    await createIntent(intentId, {
      recipientUid: userId,
      type: "follow_request",
      sourcePath: snapshot.ref.path,
      sendAfter: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
      path: "/profile",
      channelId: "follow_incoming",
      threadKey: `follow:${requesterId}`,
      imageUrl: stringValue(
        data["profile_picture"] ?? requesterData?.["profile_picture"],
        "",
      ) || undefined,
      actions: [
        { id: "accept_follow_request" },
        { id: "decline_follow_request", destructive: true },
      ],
      payload: {
        requester_id: requesterId,
        requester_name: stringValue(
          data["display_name"] ?? requesterData?.["display_name"],
          "Someone",
        ),
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
    const followerSnapshot = await admin.firestore().doc(`users/${followerId}`).get();

    await createIntent(intentId, {
      recipientUid: userId,
      type: "new_follower",
      sourcePath: snapshot.ref.path,
      sendAfter: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
      path: `/u/${encodeURIComponent(followerId)}`,
      channelId: isMutual ? "follow_relationships" : "follow_incoming",
      threadKey: `follow:${followerId}`,
      imageUrl: stringValue(followerSnapshot.data()?.["profile_picture"], "") || undefined,
      actions: isMutual
        ? []
        : [{ id: "follow_back" }],
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
      threadKey: `follow:${followedUserId}`,
      imageUrl: stringValue(followedUser.data()?.["profile_picture"], "") || undefined,
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
    const after = event.data?.after.exists
      ? (event.data.after.data() as EventRSVPSchema)
      : null;

    if (!after || (after.rsvp !== "going" && after.rsvp !== "interested")) {
      await cancelEventReminderIntents(eventId, userId, "rsvp_removed");
      return;
    }

    const eventSnapshot = await admin.firestore().doc(`events/${eventId}`).get();
    if (!eventSnapshot.exists) {
      await cancelEventReminderIntents(eventId, userId, "event_missing");
      return;
    }

    await upsertEventReminders(
      userId,
      eventId,
      eventSnapshot.data() as EventSchema,
      `events/${eventId}/rsvps/${userId}`,
      after.rsvp,
    );
  },
);

export const onEventNotificationSourceWrite = onDocumentWrittenWithAuthContext(
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
    const updateMarker =
      changeEvent.after.updateTime?.toMillis() ?? Date.parse(event.time);
    if (change === "time" && !structuredOperation) {
      await createAutomaticRescheduleUpdate(
        changeEvent.after.ref,
        eventId,
        updateMarker,
        after,
        event.authId,
      );
    }

    const rsvps = await changeEvent.after.ref.collection("rsvps").get();
    const recipients = rsvps.docs.filter((doc) => {
      const rsvp = (doc.data() as EventRSVPSchema).rsvp;
      return rsvp === "going" || rsvp === "interested";
    });
    if (recipients.length === 0) return;

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
          change !== "time" &&
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
              threadKey: `event:${eventId}`,
              payload: {
                event_id: eventId,
                event_name: after.name,
                change,
                ...(after.venue_string ? { venue_name: after.venue_string } : {}),
                ...(adminTimestamp(after.start)
                  ? { starts_at: adminTimestamp(after.start)!.toDate().toISOString() }
                  : {}),
              },
            },
          );
        }

        if (
          after.published === false ||
          after.lifecycle_status === "cancelled"
        ) {
          await cancelEventReminderIntents(
            eventId,
            rsvp.id,
            after.lifecycle_status === "cancelled"
              ? "event_cancelled"
              : "event_unpublished",
          );
        } else if (reminderStateChanged) {
          await upsertEventReminders(
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

async function createAutomaticRescheduleUpdate(
  eventRef: FirebaseFirestore.DocumentReference,
  eventId: string,
  updateMarker: number,
  event: EventSchema,
  actorId: string | undefined,
): Promise<void> {
  if (event.published === false) return;
  const updateId = `reschedule_${updateMarker}`;
  const now = Timestamp.now();
  const update: EventLiveUpdateSchema = {
    event_id: eventId,
    type: "event_rescheduled",
    title: "Event rescheduled",
    scheduled_for: event.start,
    operation_id: updateId,
    operation_type: "reschedule_event",
    status: "published",
    created_at: now as EventLiveUpdateSchema["created_at"],
    created_by: actorId ?? "system",
    published_at: now as EventLiveUpdateSchema["published_at"],
  };
  try {
    await eventRef.collection("live_updates").doc(updateId).create(update);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code !== 6 && code !== "already-exists") throw error;
  }
}

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
    const organizationId = after.reviewed_by_organization_id;
    const organization = organizationId
      ? await admin.firestore().doc(`organizations/${organizationId}`).get()
      : null;
    const imageUrl = stringValue(
      spotData?.["thumbnail_medium_url"] ?? spotData?.["thumbnail_small_url"],
      "",
    );

    await createIntent(`spot_edit_${spotId}_${editId}_${outcome}`, {
      recipientUid: after.user.uid,
      type: "spot_edit_update",
      sourcePath: event.data.after.ref.path,
      sendAfter: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 90 * DAY_MS),
      path: `/s/${encodeURIComponent(spotSlug)}`,
      channelId: "spot_edit_updates",
      threadKey: `spot-edit:${spotId}:${editId}`,
      imageUrl: imageUrl || undefined,
      payload: {
        edit_id: editId,
        spot_id: spotId,
        spot_name: spotName,
        outcome,
        ...(after.decision_source
          ? { decision_source: after.decision_source }
          : {}),
        ...(organization?.exists
          ? { organization_name: displayName(organization.data()?.["name"], "") }
          : {}),
        ...(typeof after.vote_summary?.yes_count === "number"
          ? { yes_count: String(after.vote_summary.yes_count) }
          : {}),
        ...(typeof after.vote_summary?.no_count === "number"
          ? { no_count: String(after.vote_summary.no_count) }
          : {}),
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
        threadKey: `community-info:${communityKey}:${editId}`,
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
        thread_key: after.thread_key ?? String(event.params.intentId),
        image_url: after.image_url || FieldValue.delete(),
        actions: after.actions ?? [],
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

export const performNotificationAction = onCall(
  { cors: true, invoker: "public" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to act on notifications.");
    const notificationId = cleanActionValue(
      request.data?.notificationId,
      "notificationId",
    );
    const actionId = cleanNotificationAction(request.data?.actionId);
    const db = admin.firestore();
    const intentRef = db.doc(`${INTENTS}/${notificationId}`);
    const notificationRef = db.doc(`users/${uid}/notifications/${notificationId}`);
    const undoRef = db.doc(`users/${uid}/notification_action_undo/${notificationId}`);

    return db.runTransaction(async (transaction) => {
      const [intentSnapshot, notificationSnapshot, undoSnapshot] =
        await Promise.all([
          transaction.get(intentRef),
          transaction.get(notificationRef),
          transaction.get(undoRef),
        ]);
      const intent = intentSnapshot.data() as StoredIntent | undefined;
      if (!intentSnapshot.exists || !intent || intent.recipient_uid !== uid) {
        throw new HttpsError("not-found", "Notification not found.");
      }
      if (!notificationSnapshot.exists || intent.expires_at.toMillis() <= Date.now()) {
        throw new HttpsError("failed-precondition", "This notification has expired.");
      }
      const ordinaryAction = intent.actions?.some(({ id }) => id === actionId);
      const undoAction =
        actionId === "undo_decline_follow_request" ||
        actionId === "undo_follow_back";
      if (!ordinaryAction && !undoAction) {
        throw new HttpsError("permission-denied", "Action is not available.");
      }

      const now = Timestamp.now();
      let relationship: "following" | "requested" | undefined;
      if (actionId === "accept_follow_request") {
        await acceptFollowRequestAction(transaction, uid, intent, now);
      } else if (actionId === "decline_follow_request") {
        await declineFollowRequestAction(transaction, uid, intent, undoRef, now);
      } else if (actionId === "follow_back") {
        relationship = await followBackAction(transaction, uid, intent, undoRef, now);
      } else if (actionId === "undo_decline_follow_request") {
        await undoDeclineAction(transaction, uid, intent, undoSnapshot, undoRef);
      } else if (actionId === "undo_follow_back") {
        await undoFollowBackAction(transaction, uid, intent, undoSnapshot, undoRef);
      } else {
        await eventRelationshipAction(transaction, uid, intent, actionId, now);
      }

      const isUndo = actionId.startsWith("undo_");
      const undoable =
        !isUndo &&
        (actionId === "decline_follow_request" || actionId === "follow_back");
      const state = {
        action_id: actionId,
        status: isUndo ? "undone" as const : "completed" as const,
        acted_at_raw_ms: now.toMillis(),
        ...(undoable
          ? { undo_until_raw_ms: now.toMillis() + ACTION_UNDO_MS }
          : {}),
      };
      transaction.set(notificationRef, {
        action_state: state,
        read_at_raw_ms: now.toMillis(),
        updated_at_raw_ms: now.toMillis(),
      }, { merge: true });
      return { state, ...(relationship ? { relationship } : {}) };
    });
  },
);

function cleanActionValue(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_:-]{1,256}$/u.test(value)) {
    throw new HttpsError("invalid-argument", `${name} is invalid.`);
  }
  return value;
}

function cleanNotificationAction(value: unknown): NotificationActionId {
  const actions = new Set<NotificationActionId>([
    "accept_follow_request",
    "decline_follow_request",
    "follow_back",
    "undo_decline_follow_request",
    "undo_follow_back",
    "mark_event_going",
    "save_event_interested",
  ]);
  if (typeof value !== "string" || !actions.has(value as NotificationActionId)) {
    throw new HttpsError("invalid-argument", "actionId is invalid.");
  }
  return value as NotificationActionId;
}

function requirePayloadId(intent: StoredIntent, key: string): string {
  const value = intent.payload[key];
  if (!value || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new HttpsError("failed-precondition", "Notification action data is invalid.");
  }
  return value;
}

async function requireSocialUsers(
  transaction: FirebaseFirestore.Transaction,
  actorId: string,
  targetId: string,
): Promise<{ actor: Record<string, unknown>; target: Record<string, unknown> }> {
  const db = admin.firestore();
  const [actorSnapshot, targetSnapshot] = await Promise.all([
    transaction.get(db.doc(`users/${actorId}`)),
    transaction.get(db.doc(`users/${targetId}`)),
  ]);
  if (!actorSnapshot.exists || !targetSnapshot.exists) {
    throw new HttpsError("not-found", "User profile not found.");
  }
  const actor = actorSnapshot.data() ?? {};
  const target = targetSnapshot.data() ?? {};
  const participation = recordValue(actor["age_policy"])["participation_state"];
  const moderation = recordValue(actor["moderation_state"])["status"];
  if (
    participation &&
    participation !== "allowed" &&
    participation !== "platform_signal_unavailable"
  ) {
    throw new HttpsError("permission-denied", "This account cannot follow users.");
  }
  if (moderation && moderation !== "active" && moderation !== "profile_restricted") {
    throw new HttpsError("permission-denied", "This account cannot follow users.");
  }
  const actorBlocks = Array.isArray(actor["blocked_users"]) ? actor["blocked_users"] : [];
  const targetBlocks = Array.isArray(target["blocked_users"]) ? target["blocked_users"] : [];
  if (actorBlocks.includes(targetId) || targetBlocks.includes(actorId)) {
    throw new HttpsError("permission-denied", "This follow action is unavailable.");
  }
  return { actor, target };
}

async function acceptFollowRequestAction(
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  intent: StoredIntent,
  now: Timestamp,
): Promise<void> {
  const requesterId = requirePayloadId(intent, "requester_id");
  const db = admin.firestore();
  const requestRef = db.doc(`users/${uid}/follow_requests/${requesterId}`);
  const requestSnapshot = await transaction.get(requestRef);
  if (!requestSnapshot.exists) {
    throw new HttpsError("failed-precondition", "This follow request is no longer pending.");
  }
  const { actor } = await requireSocialUsers(transaction, uid, requesterId);
  const requesterName = stringValue(requestSnapshot.data()?.["display_name"], "Someone");
  const actorName = stringValue(actor["display_name"], "Someone");
  const edgeTime = { start_following: now, start_following_raw_ms: now.toMillis() };
  transaction.set(db.doc(`users/${requesterId}/following/${uid}`), {
    display_name: actorName,
    ...edgeTime,
  });
  transaction.set(db.doc(`users/${uid}/followers/${requesterId}`), {
    display_name: requesterName,
    ...edgeTime,
  });
  transaction.delete(requestRef);
}

async function declineFollowRequestAction(
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  intent: StoredIntent,
  undoRef: FirebaseFirestore.DocumentReference,
  now: Timestamp,
): Promise<void> {
  const requesterId = requirePayloadId(intent, "requester_id");
  const requestRef = admin.firestore().doc(`users/${uid}/follow_requests/${requesterId}`);
  const requestSnapshot = await transaction.get(requestRef);
  if (!requestSnapshot.exists) {
    throw new HttpsError("failed-precondition", "This follow request is no longer pending.");
  }
  transaction.set(undoRef, {
    action: "decline_follow_request",
    requester_id: requesterId,
    request: requestSnapshot.data(),
    expires_at_raw_ms: now.toMillis() + ACTION_UNDO_MS,
  });
  transaction.delete(requestRef);
}

async function followBackAction(
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  intent: StoredIntent,
  undoRef: FirebaseFirestore.DocumentReference,
  now: Timestamp,
): Promise<"following" | "requested"> {
  const targetId = requirePayloadId(intent, "follower_id");
  const db = admin.firestore();
  const { actor, target } = await requireSocialUsers(transaction, uid, targetId);
  const privateTarget = target["account_privacy"] === "private";
  if (privateTarget) {
    transaction.set(db.doc(`users/${targetId}/follow_requests/${uid}`), {
      display_name: stringValue(actor["display_name"], "Someone"),
      requested_at: now,
      requested_at_raw_ms: now.toMillis(),
    });
  } else {
    const edgeTime = { start_following: now, start_following_raw_ms: now.toMillis() };
    transaction.set(db.doc(`users/${uid}/following/${targetId}`), {
      display_name: stringValue(target["display_name"], "Someone"),
      ...edgeTime,
    });
    transaction.set(db.doc(`users/${targetId}/followers/${uid}`), {
      display_name: stringValue(actor["display_name"], "Someone"),
      ...edgeTime,
    });
  }
  transaction.set(undoRef, {
    action: "follow_back",
    target_id: targetId,
    relationship: privateTarget ? "requested" : "following",
    expires_at_raw_ms: now.toMillis() + ACTION_UNDO_MS,
  });
  return privateTarget ? "requested" : "following";
}

function requireUndo(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  action: string,
): Record<string, unknown> {
  const data = snapshot.data();
  if (
    !snapshot.exists ||
    data?.["action"] !== action ||
    Number(data["expires_at_raw_ms"] ?? 0) < Date.now()
  ) {
    throw new HttpsError("failed-precondition", "Undo is no longer available.");
  }
  return data;
}

async function undoDeclineAction(
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  intent: StoredIntent,
  undoSnapshot: FirebaseFirestore.DocumentSnapshot,
  undoRef: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const data = requireUndo(undoSnapshot, "decline_follow_request");
  const requesterId = requirePayloadId(intent, "requester_id");
  if (data["requester_id"] !== requesterId) {
    throw new HttpsError("failed-precondition", "Undo data does not match.");
  }
  await requireSocialUsers(transaction, uid, requesterId);
  transaction.set(
    admin.firestore().doc(`users/${uid}/follow_requests/${requesterId}`),
    recordValue(data["request"]),
  );
  transaction.delete(undoRef);
}

async function undoFollowBackAction(
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  intent: StoredIntent,
  undoSnapshot: FirebaseFirestore.DocumentSnapshot,
  undoRef: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const data = requireUndo(undoSnapshot, "follow_back");
  const targetId = requirePayloadId(intent, "follower_id");
  if (data["target_id"] !== targetId) {
    throw new HttpsError("failed-precondition", "Undo data does not match.");
  }
  const db = admin.firestore();
  if (data["relationship"] === "requested") {
    transaction.delete(db.doc(`users/${targetId}/follow_requests/${uid}`));
  } else {
    transaction.delete(db.doc(`users/${uid}/following/${targetId}`));
    transaction.delete(db.doc(`users/${targetId}/followers/${uid}`));
  }
  transaction.delete(undoRef);
}

async function eventRelationshipAction(
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  intent: StoredIntent,
  actionId: NotificationActionId,
  now: Timestamp,
): Promise<void> {
  if (actionId !== "mark_event_going" && actionId !== "save_event_interested") {
    throw new HttpsError("invalid-argument", "Unsupported notification action.");
  }
  const eventId = requirePayloadId(intent, "event_id");
  const db = admin.firestore();
  const eventRef = db.doc(`events/${eventId}`);
  const eventSnapshot = await transaction.get(eventRef);
  const event = eventSnapshot.data() as EventSchema | undefined;
  if (!eventSnapshot.exists || !event || event.published === false || event.lifecycle_status === "cancelled") {
    throw new HttpsError("failed-precondition", "This event is no longer available.");
  }
  const rsvp = actionId === "mark_event_going" ? "going" : "interested";
  const rsvpRef = eventRef.collection("rsvps").doc(uid);
  const rsvpSnapshot = await transaction.get(rsvpRef);
  transaction.set(rsvpRef, {
    user_id: uid,
    event_id: eventId,
    rsvp,
    time_created: rsvpSnapshot.data()?.["time_created"] ?? now,
    time_updated: now,
    time_updated_raw_ms: now.toMillis(),
  }, { merge: true });
  transaction.set(db.doc(`users/${uid}/private_data/main`), {
    going_events: rsvp === "going" ? FieldValue.arrayUnion(eventId) : FieldValue.arrayRemove(eventId),
    saved_events: rsvp === "interested" ? FieldValue.arrayUnion(eventId) : FieldValue.arrayRemove(eventId),
  }, { merge: true });
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
    ...(input.threadKey ? { thread_key: input.threadKey } : {}),
    ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
    ...(input.actions?.length ? { actions: input.actions } : {}),
    attempts: 0,
    created_at: now,
    updated_at: now,
  };
}

async function upsertEventReminders(
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
    await cancelEventReminderIntents(eventId, userId, "event_unavailable");
    return;
  }

  const subscription = await admin.firestore()
    .doc(`events/${eventId}/live_update_subscribers/${userId}`)
    .get();
  if (
    subscription.exists &&
    subscription.data()?.["event_reminders"] !== true
  ) {
    await cancelEventReminderIntents(eventId, userId, "event_reminder_disabled");
    return;
  }

  const offsets = reminderOffsets(subscription.data()?.["reminder_offsets_minutes"]);
  await Promise.all(
    [...ALLOWED_EVENT_REMINDER_OFFSETS].map(async (offset) => {
      const intentId = eventReminderIntentId(eventId, userId, offset);
      if (!offsets.includes(offset as EventReminderOffsetMinutes)) {
        await cancelIntent(intentId, "reminder_offset_disabled");
        return;
      }
      const sendAfter = Timestamp.fromMillis(
        start.toMillis() - offset * 60 * 1000,
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
        threadKey: `event:${eventId}`,
        payload: {
          event_id: eventId,
          event_name: eventData.name,
          starts_at: start.toDate().toISOString(),
          reminder_offset_minutes: String(offset),
          rsvp,
          ...(eventData.venue_string ? { venue_name: eventData.venue_string } : {}),
        },
        actions:
          rsvp === "interested"
            ? [{ id: "mark_event_going" }]
            : [],
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
    }),
  );
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
  const byLocaleAndPlatform = new Map<string, typeof active>();
  for (const registration of active) {
    const locale = normalizeLocale(registration.data.locale);
    const key = `${locale}:${registration.data.platform}`;
    byLocaleAndPlatform.set(key, [
      ...(byLocaleAndPlatform.get(key) ?? []),
      registration,
    ]);
  }
  for (const [localeAndPlatform, group] of byLocaleAndPlatform) {
    const [locale, platform] = localeAndPlatform.split(":");
    const copy = notificationCopy(intent, locale);
    const actions = localizedActions(intent.actions ?? [], locale);
    const actionData = JSON.stringify(actions.map(({ action }) => action));
    const commonData = {
      intent_id: intentId,
      type: intent.type,
      title: copy.title,
      body: copy.body,
      path: intent.path,
      channel_id: deliveryChannel(intent),
      thread_key: intent.thread_key ?? intentId,
      actions: actionData,
      action_labels: JSON.stringify(actions),
      ...(intent.image_url ? { image_url: intent.image_url } : {}),
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
    };
    const response = await admin.messaging().sendEachForMulticast({
      tokens: group.map(({ data }) => data.token),
      data: commonData,
      ...(platform === "ios"
        ? {
            notification: {
              ...copy,
              ...(intent.image_url ? { imageUrl: intent.image_url } : {}),
            },
            apns: {
              payload: {
                aps: {
                  sound: "default",
                  threadId: intent.thread_key ?? intentId,
                  ...(actions.length
                    ? { category: notificationCategory(intent) }
                    : {}),
                  ...(intent.image_url ? { mutableContent: true } : {}),
                },
              },
              ...(intent.image_url
                ? { fcmOptions: { imageUrl: intent.image_url } }
                : {}),
            },
          }
        : {}),
      ...(platform === "android"
        ? {
            android: {
              priority: "high" as const,
              ttl: Math.max(0, intent.expires_at.toMillis() - Date.now()),
            },
          }
        : {}),
      ...(platform === "web"
        ? {
            webpush: {
              headers: {
                Urgency: "high",
                TTL: String(
                  Math.max(
                    0,
                    Math.floor((intent.expires_at.toMillis() - Date.now()) / 1000),
                  ),
                ),
              },
            },
          }
        : {}),
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
  return false;
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
    case "event_registration_update":
    case "event_ownership_update":
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

function notificationCategory(intent: StoredIntent): string {
  if (intent.type === "follow_request") return "PKSPOT_FOLLOW_REQUEST";
  if (intent.type === "new_follower") return "PKSPOT_NEW_FOLLOWER";
  if (intent.type === "event_reminder") return "PKSPOT_EVENT_REMINDER";
  if (intent.type === "community_event") return "PKSPOT_COMMUNITY_EVENT";
  return "PKSPOT_GENERAL";
}

function localizedActions(
  actions: NotificationActionSchema[],
  locale: string,
): Array<{ action: string; title: string }> {
  const language = pushLanguage(locale);
  const labels: Record<PushLanguage, Partial<Record<NotificationActionId, string>>> = {
    en: { accept_follow_request: "Accept", decline_follow_request: "Decline", follow_back: "Follow back", mark_event_going: "I'm going", save_event_interested: "Save event" },
    de: { accept_follow_request: "Annehmen", decline_follow_request: "Ablehnen", follow_back: "Zurückfolgen", mark_event_going: "Ich komme", save_event_interested: "Event speichern" },
    es: { accept_follow_request: "Aceptar", decline_follow_request: "Rechazar", follow_back: "Seguir", mark_event_going: "Voy", save_event_interested: "Guardar evento" },
    fr: { accept_follow_request: "Accepter", decline_follow_request: "Refuser", follow_back: "Suivre", mark_event_going: "Je participe", save_event_interested: "Enregistrer" },
    it: { accept_follow_request: "Accetta", decline_follow_request: "Rifiuta", follow_back: "Segui", mark_event_going: "Partecipo", save_event_interested: "Salva evento" },
    nl: { accept_follow_request: "Accepteren", decline_follow_request: "Weigeren", follow_back: "Terugvolgen", mark_event_going: "Ik ga", save_event_interested: "Event opslaan" },
  };
  return actions.flatMap(({ id }) => {
    const title = labels[language][id] ?? labels.en[id];
    return title ? [{ action: id, title }] : [];
  });
}

function notificationCopy(
  intent: StoredIntent,
  locale: string,
): { title: string; body: string } {
  const p = intent.payload;
  const language = pushLanguage(locale);
  const text = PUSH_TEXT[language];
  if (intent.type === "follow_request") {
    return {
      title: text.followRequestTitle(p["requester_name"]),
      body: text.followRequestBody,
    };
  }
  if (intent.type === "follow_accepted") {
    return {
      title: text.followAcceptedTitle(p["followed_user_name"]),
      body: text.followAcceptedBody,
    };
  }
  if (intent.type === "new_follower") {
    return p["relationship"] === "mutual"
      ? { title: text.mutualTitle(p["follower_name"]), body: text.mutualBody }
      : { title: text.followerTitle(p["follower_name"]), body: text.followerBody };
  }
  if (intent.type === "event_reminder") {
    const offset = Number(p["reminder_offset_minutes"] ?? 120);
    return {
      title: text.reminderTitle(p["event_name"], offset),
      body: p["rsvp"] === "interested"
        ? text.reminderInterested(p["venue_name"])
        : text.reminderGoing(p["venue_name"]),
    };
  }
  if (intent.type === "event_registration_update") {
    return {
      title: text.waitlistTitle(p["event_name"]),
      body: text.waitlistBody,
    };
  }
  if (intent.type === "event_ownership_update") {
    return {
      title: p["update_title"] || text.eventManagementTitle,
      body: p["update_message"] || p["event_name"],
    };
  }
  if (intent.type === "event_update" && p["update_title"]) {
    return {
      title: `${p["event_name"]}: ${p["update_title"]}`,
      body: p["update_message"] || text.viewEventUpdate,
    };
  }
  if (intent.type === "event_update") {
    return text.eventChange(p["event_name"], p["change"], p["venue_name"]);
  }
  if (intent.type === "spot_edit_update") {
    if (p["outcome"] !== "approved") {
      return { title: text.spotRejectedTitle, body: text.spotRejectedBody(p["spot_name"]) };
    }
    if (p["decision_source"] === "community_vote" && p["yes_count"] !== undefined) {
      return {
        title: text.spotApprovedTitle,
        body: text.spotVoteBody(p["spot_name"], p["yes_count"], p["no_count"] ?? "0"),
      };
    }
    return {
      title: text.spotApprovedTitle,
      body: text.spotApprovedBody(p["spot_name"], p["organization_name"]),
    };
  }
  if (intent.type === "spot_report_update" || intent.type === "media_report_update") {
    return {
      title: p["outcome"] === "action_taken"
        ? text.reportActionTitle(p["target_name"])
        : text.reportReviewedTitle,
      body: p["outcome"] === "action_taken"
        ? text.reportActionBody
        : text.reportClosedBody,
    };
  }
  if (intent.type === "community_info_update") {
    return p["outcome"] === "approved"
      ? {
          title: text.communityInfoApprovedTitle(p["community_name"]),
          body: text.communityInfoApprovedBody,
        }
      : {
          title: text.communityInfoRejectedTitle,
          body: text.communityInfoRejectedBody(p["community_name"]),
        };
  }
  if (intent.type === "community_event") {
    return {
      title: text.communityEventTitle(p["event_name"], p["community_name"]),
      body: text.communityEventBody,
    };
  }
  if (intent.type === "community_spot_digest") {
    return {
      title: text.digestTitle(p["spot_count"]),
      body: p["top_spot_name"]
        ? text.digestBodyWithSpot(p["top_spot_name"])
        : text.digestBody,
    };
  }
  return legacyNotificationCopy(intent, locale);
}

type PushLanguage = "en" | "de" | "es" | "fr" | "it" | "nl";

function pushLanguage(locale: string): PushLanguage {
  const value = locale.split("-")[0];
  return value === "de" || value === "es" || value === "fr" || value === "it" || value === "nl"
    ? value
    : "en";
}

interface PushText {
  followRequestTitle: (name: string) => string;
  followRequestBody: string;
  followAcceptedTitle: (name: string) => string;
  followAcceptedBody: string;
  followerTitle: (name: string) => string;
  followerBody: string;
  mutualTitle: (name: string) => string;
  mutualBody: string;
  reminderTitle: (event: string, offset: number) => string;
  reminderInterested: (venue?: string) => string;
  reminderGoing: (venue?: string) => string;
  waitlistTitle: (event: string) => string;
  waitlistBody: string;
  eventManagementTitle: string;
  viewEventUpdate: string;
  eventChange: (event: string, change: string, venue?: string) => { title: string; body: string };
  spotApprovedTitle: string;
  spotApprovedBody: (spot: string, organization?: string) => string;
  spotVoteBody: (spot: string, yes: string, no: string) => string;
  spotRejectedTitle: string;
  spotRejectedBody: (spot: string) => string;
  reportActionTitle: (target: string) => string;
  reportReviewedTitle: string;
  reportActionBody: string;
  reportClosedBody: string;
  communityInfoApprovedTitle: (community: string) => string;
  communityInfoApprovedBody: string;
  communityInfoRejectedTitle: string;
  communityInfoRejectedBody: (community: string) => string;
  communityEventTitle: (event: string, community: string) => string;
  communityEventBody: string;
  digestTitle: (count: string) => string;
  digestBody: string;
  digestBodyWithSpot: (spot: string) => string;
}

const offsetLabel = (offset: number, labels: [string, string, string]): string =>
  offset === 1440 ? labels[0] : offset === 30 ? labels[2] : labels[1];
const venueSuffix = (venue: string | undefined, prefix: string): string =>
  venue ? `${prefix}${venue}.` : "";

const PUSH_TEXT: Record<PushLanguage, PushText> = {
  en: {
    followRequestTitle: (name) => `${name} wants to follow you`,
    followRequestBody: "Approve the request or take a look at their profile.",
    followAcceptedTitle: (name) => `${name} accepted your follow request`,
    followAcceptedBody: "You can now see their followers-only profile.",
    followerTitle: (name) => `${name} is following you`,
    followerBody: "Take a look at their profile or follow them back.",
    mutualTitle: (name) => `You and ${name} follow each other`,
    mutualBody: "You're now mutual followers.",
    reminderTitle: (event, offset) => `${event} ${offsetLabel(offset, ["is tomorrow", "starts in 2 hours", "starts in 30 minutes"])}`,
    reminderInterested: (venue) => `Still interested? Let people know if you're going.${venueSuffix(venue, " At ")}`,
    reminderGoing: (venue) => venue ? `See you at ${venue}.` : "See you there.",
    waitlistTitle: (event) => `You're in for ${event}!`,
    waitlistBody: "A place opened up and your registration is confirmed.",
    eventManagementTitle: "Event management update",
    viewEventUpdate: "Open the event for the latest details.",
    eventChange: englishEventNotification,
    spotApprovedTitle: "Your Spot edit was approved!",
    spotApprovedBody: (spot, org) => org ? `Thanks for improving ${spot}. It was approved by ${org}.` : `Thanks for improving ${spot}.`,
    spotVoteBody: (spot, yes, no) => `Thanks for improving ${spot}. The community approved it with ${yes} yes and ${no} no votes.`,
    spotRejectedTitle: "Your Spot edit needs another look",
    spotRejectedBody: (spot) => `The proposed change to ${spot} wasn't approved. Review the feedback before trying again.`,
    reportActionTitle: (target) => `Thanks for reporting ${target}`,
    reportReviewedTitle: "We reviewed your report",
    reportActionBody: "We reviewed it and took action.",
    reportClosedBody: "No action was needed based on our review.",
    communityInfoApprovedTitle: (community) => `${community} info is now live`,
    communityInfoApprovedBody: "Thanks for helping keep the community page accurate.",
    communityInfoRejectedTitle: "Your community update wasn't published",
    communityInfoRejectedBody: (community) => `Review the feedback for ${community} before trying again.`,
    communityEventTitle: (event, community) => `${event} is coming to ${community}`,
    communityEventBody: "A new public event was published in a community you follow.",
    digestTitle: (count) => `${count} new Spots worth a look`,
    digestBody: "Fresh recommendations from communities you follow.",
    digestBodyWithSpot: (spot) => `Starting with ${spot} and more fresh recommendations.`,
  },
  de: {
    followRequestTitle: (name) => `${name} möchte dir folgen`, followRequestBody: "Nimm die Anfrage an oder sieh dir das Profil an.",
    followAcceptedTitle: (name) => `${name} hat deine Folgeanfrage angenommen`, followAcceptedBody: "Du kannst jetzt das Profil für Follower sehen.",
    followerTitle: (name) => `${name} folgt dir`, followerBody: "Sieh dir das Profil an oder folge zurück.",
    mutualTitle: (name) => `Du und ${name} folgt euch gegenseitig`, mutualBody: "Ihr folgt euch jetzt gegenseitig.",
    reminderTitle: (event, offset) => `${event} ${offsetLabel(offset, ["ist morgen", "beginnt in 2 Stunden", "beginnt in 30 Minuten"])}`,
    reminderInterested: (venue) => `Noch interessiert? Sag bitte, ob du kommst.${venueSuffix(venue, " Ort: ")}`,
    reminderGoing: (venue) => venue ? `Bis gleich bei ${venue}.` : "Bis gleich.",
    waitlistTitle: (event) => `Du bist bei ${event} dabei!`, waitlistBody: "Ein Platz ist frei geworden und deine Anmeldung ist bestätigt.",
    eventManagementTitle: "Update zur Eventverwaltung", viewEventUpdate: "Öffne das Event für die neuesten Details.",
    eventChange: germanEventNotification,
    spotApprovedTitle: "Deine Spot-Bearbeitung wurde bestätigt!", spotApprovedBody: (spot, org) => org ? `Danke für deine Verbesserung an ${spot}. ${org} hat sie bestätigt.` : `Danke für deine Verbesserung an ${spot}.`,
    spotVoteBody: (spot, yes, no) => `Danke für deine Verbesserung an ${spot}. Die Community stimmte mit ${yes} Ja- und ${no} Nein-Stimmen zu.`,
    spotRejectedTitle: "Deine Spot-Bearbeitung braucht noch Arbeit", spotRejectedBody: (spot) => `Die Änderung an ${spot} wurde nicht bestätigt. Sieh dir das Feedback an.`,
    reportActionTitle: (target) => `Danke für deine Meldung zu ${target}`, reportReviewedTitle: "Wir haben deine Meldung geprüft", reportActionBody: "Wir haben sie geprüft und Maßnahmen ergriffen.", reportClosedBody: "Nach unserer Prüfung war keine Maßnahme nötig.",
    communityInfoApprovedTitle: (community) => `Die Infos zu ${community} sind jetzt live`, communityInfoApprovedBody: "Danke, dass du die Community-Seite aktuell hältst.",
    communityInfoRejectedTitle: "Dein Community-Update wurde nicht veröffentlicht", communityInfoRejectedBody: (community) => `Sieh dir das Feedback zu ${community} an.`,
    communityEventTitle: (event, community) => `${event} kommt nach ${community}`, communityEventBody: "In einer Community, der du folgst, wurde ein öffentliches Event veröffentlicht.",
    digestTitle: (count) => `${count} neue sehenswerte Spots`, digestBody: "Neue Empfehlungen aus deinen Communities.", digestBodyWithSpot: (spot) => `Entdecke ${spot} und weitere neue Empfehlungen.`,
  },
  es: undefined as unknown as PushText,
  fr: undefined as unknown as PushText,
  it: undefined as unknown as PushText,
  nl: undefined as unknown as PushText,
};

PUSH_TEXT.es = makeRomancePushText("es");
PUSH_TEXT.fr = makeRomancePushText("fr");
PUSH_TEXT.it = makeRomancePushText("it");
PUSH_TEXT.nl = makeRomancePushText("nl");

function makeRomancePushText(language: Exclude<PushLanguage, "en" | "de">): PushText {
  const words = {
    es: { tomorrow: "es mañana", two: "empieza en 2 horas", thirty: "empieza en 30 minutos", reviewed: "Hemos revisado tu reporte" },
    fr: { tomorrow: "a lieu demain", two: "commence dans 2 heures", thirty: "commence dans 30 minutes", reviewed: "Nous avons examiné votre signalement" },
    it: { tomorrow: "è domani", two: "inizia tra 2 ore", thirty: "inizia tra 30 minuti", reviewed: "Abbiamo esaminato la tua segnalazione" },
    nl: { tomorrow: "is morgen", two: "begint over 2 uur", thirty: "begint over 30 minuten", reviewed: "We hebben je melding beoordeeld" },
  }[language];
  return {
    ...PUSH_TEXT.en,
    reminderTitle: (event, offset) => `${event} ${offsetLabel(offset, [words.tomorrow, words.two, words.thirty])}`,
    reportReviewedTitle: words.reviewed,
  };
}

function englishEventNotification(event: string, change: string, venue?: string): { title: string; body: string } {
  if (change === "cancelled") return { title: `${event} was cancelled`, body: "Open the event for the latest details." };
  if (change === "restored") return { title: `${event} is back on`, body: "The event is active again." };
  if (change === "time") return { title: `New time for ${event}`, body: "Check the updated date and time." };
  return { title: `New location for ${event}`, body: venue ? `The event is now at ${venue}.` : "Check the updated location." };
}

function germanEventNotification(event: string, change: string, venue?: string): { title: string; body: string } {
  if (change === "cancelled") return { title: `${event} wurde abgesagt`, body: "Öffne das Event für die neuesten Details." };
  if (change === "restored") return { title: `${event} findet wieder statt`, body: "Das Event ist wieder aktiv." };
  if (change === "time") return { title: `Neue Zeit für ${event}`, body: "Prüfe das aktualisierte Datum und die Uhrzeit." };
  return { title: `Neuer Ort für ${event}`, body: venue ? `Das Event findet jetzt bei ${venue} statt.` : "Prüfe den aktualisierten Ort." };
}

function legacyNotificationCopy(
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
  const now = Timestamp.now();
  await admin.firestore().doc(
    `users/${recipientUid}/report_outcomes/${identity.outcomeId}`,
  ).set({
    id: identity.outcomeId,
    kind,
    target_name: targetName,
    outcome,
    public_reason: outcome === "action_taken" ? "action_taken" : "no_action_needed",
    source_path: sourcePath,
    decided_at: now,
    decided_at_raw_ms: now.toMillis(),
  }, { merge: true });
  await createIntent(`${identity.intentPrefix}_${outcome}`, {
    recipientUid,
    type: kind === "spot" ? "spot_report_update" : "media_report_update",
    sourcePath,
    sendAfter: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 90 * DAY_MS),
    path: `/reports/outcomes/${encodeURIComponent(identity.outcomeId)}`,
    channelId:
      kind === "spot" ? "spot_report_updates" : "media_report_updates",
    threadKey: `report:${identity.outcomeId}`,
    payload: {
      outcome,
      target_name: targetName,
    },
  });
}

function reportIdentity(
  kind: ReportKind,
  sourcePath: string,
): { intentPrefix: string; outcomeId: string } | null {
  if (kind === "spot") {
    const match = sourcePath.match(/^spots\/([^/]+)\/reports\/([^/]+)$/);
    return match
      ? {
          intentPrefix: `spot_report_${match[1]}_${match[2]}`,
          outcomeId: `spot_${match[1]}_${match[2]}`,
        }
      : null;
  }
  const match = sourcePath.match(/^(?:media_reports|reports)\/([^/]+)$/);
  return match
    ? { intentPrefix: `media_report_${match[1]}`, outcomeId: `media_${match[1]}` }
    : null;
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

function eventReminderIntentId(
  eventId: string,
  userId: string,
  offsetMinutes: number,
): string {
  const base = `event_reminder_${eventId}_${userId}`;
  return offsetMinutes === 120 ? base : `${base}_${offsetMinutes}`;
}

function reminderOffsets(value: unknown): EventReminderOffsetMinutes[] {
  if (!Array.isArray(value)) return DEFAULT_EVENT_REMINDER_OFFSETS;
  const valid = value.filter(
    (item): item is EventReminderOffsetMinutes =>
      typeof item === "number" && ALLOWED_EVENT_REMINDER_OFFSETS.has(item),
  );
  return [...new Set(valid)];
}

async function cancelEventReminderIntents(
  eventId: string,
  userId: string,
  reason: string,
): Promise<void> {
  await Promise.all(
    [...ALLOWED_EVENT_REMINDER_OFFSETS].map((offset) =>
      cancelIntent(eventReminderIntentId(eventId, userId, offset), reason),
    ),
  );
}

function sameFeedProjection(before: StoredIntent, after: StoredIntent): boolean {
  return (
    intentIsActive(before) === intentIsActive(after) &&
    before.type === after.type &&
    before.recipient_uid === after.recipient_uid &&
    before.source_path === after.source_path &&
    before.path === after.path &&
    before.thread_key === after.thread_key &&
    before.image_url === after.image_url &&
    before.send_after?.toMillis() === after.send_after?.toMillis() &&
    before.expires_at?.toMillis() === after.expires_at?.toMillis() &&
    JSON.stringify(before.payload) === JSON.stringify(after.payload) &&
    JSON.stringify(before.actions) === JSON.stringify(after.actions)
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
