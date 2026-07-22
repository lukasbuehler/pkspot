import * as admin from "firebase-admin";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { EventSchema } from "../../src/db/schemas/EventSchema";
import {
  EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH,
  EVENT_LIVE_UPDATE_TITLE_MAX_LENGTH,
  EVENT_LIVE_UPDATE_TYPES,
  type EventLiveUpdateSchema,
  type EventLiveUpdateSubscriberSchema,
  type EventLiveUpdateType,
  type PublishEventLiveUpdateRequest,
} from "../../src/db/schemas/EventLiveUpdateSchema";
import type { OrganizationMemberSchema } from "../../src/db/schemas/OrganizationSchema";
import { createIntent } from "./notificationFunctions";

const CALLABLE_OPTIONS = { cors: true, invoker: "public" as const };
const PUBLISH_COOLDOWN_MS = 60_000;
const SUBSCRIBER_PAGE_SIZE = 250;
const MAX_RECIPIENTS_PER_UPDATE = 5_000;
const UPDATE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

type UnknownRequest = Partial<Record<keyof PublishEventLiveUpdateRequest, unknown>>;

const cleanRequiredText = (value: unknown, field: string, max: number): string => {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const cleaned = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
  if (!cleaned || cleaned.length > max) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must contain between 1 and ${max} characters.`,
    );
  }
  return cleaned;
};

const cleanOptionalText = (value: unknown, field: string, max: number): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  return cleanRequiredText(value, field, max);
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

const eventPath = (eventId: string, event: EventSchema): string =>
  `/events/${encodeURIComponent(event.slug ?? eventId)}`;

async function authorizedOrganizer(
  uid: string,
  event: EventSchema,
): Promise<boolean> {
  const user = await admin.firestore().doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] === true) return true;

  const organizationId = event.organizer?.organization.id;
  if (!organizationId) return false;
  const member = await admin
    .firestore()
    .doc(`organizations/${organizationId}/members/${uid}`)
    .get();
  const role = (member.data() as OrganizationMemberSchema | undefined)?.role;
  return role === "owner" || role === "admin";
}

export const publishEventLiveUpdate = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<{ updateId: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to publish an update.");

    const input = (request.data ?? {}) as UnknownRequest;
    const eventId = cleanRequiredText(input.eventId, "eventId", 128);
    const type = input.type;
    if (
      typeof type !== "string" ||
      !EVENT_LIVE_UPDATE_TYPES.includes(type as EventLiveUpdateType)
    ) {
      throw new HttpsError("invalid-argument", "Unsupported live update type.");
    }
    const title = cleanRequiredText(
      input.title,
      "title",
      EVENT_LIVE_UPDATE_TITLE_MAX_LENGTH,
    );
    const message = cleanOptionalText(
      input.message,
      "message",
      EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH,
    );
    const eventSpotId = cleanOptionalText(input.eventSpotId, "eventSpotId", 128);
    const scheduledFor = cleanOptionalText(input.scheduledFor, "scheduledFor", 64);
    const scheduledDate = scheduledFor ? new Date(scheduledFor) : undefined;
    if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
      throw new HttpsError("invalid-argument", "scheduledFor must be a valid date.");
    }

    const db = admin.firestore();
    const eventRef = db.doc(`events/${eventId}`);
    const eventSnapshot = await eventRef.get();
    if (!eventSnapshot.exists) throw new HttpsError("not-found", "Event not found.");
    const event = eventSnapshot.data() as EventSchema;
    if (!event.organizer) {
      throw new HttpsError(
        "failed-precondition",
        "Live updates are available only for organized public events.",
      );
    }
    if (event.published === false) {
      throw new HttpsError("failed-precondition", "Unpublished events cannot send updates.");
    }
    const eventEnd = timestampMillis(event.end);
    if (!eventEnd || eventEnd < Date.now()) {
      throw new HttpsError("failed-precondition", "Past events cannot send updates.");
    }
    if (!(await authorizedOrganizer(uid, event))) {
      throw new HttpsError("permission-denied", "Only an event organizer can publish updates.");
    }
    if (
      eventSpotId &&
      !(event.spot_ids ?? []).includes(eventSpotId) &&
      !(event.inline_spots ?? []).some((spot) => spot.id === eventSpotId)
    ) {
      throw new HttpsError("invalid-argument", "The selected Spot is not part of this event.");
    }

    const updateRef = eventRef.collection("live_updates").doc();
    const stateRef = eventRef.collection("live_update_state").doc("publishing");
    await db.runTransaction(async (transaction) => {
      const state = await transaction.get(stateRef);
      const lastPublishedAt = timestampMillis(state.data()?.["last_published_at"]);
      if (lastPublishedAt && Date.now() - lastPublishedAt < PUBLISH_COOLDOWN_MS) {
        throw new HttpsError(
          "resource-exhausted",
          "Please wait a minute before publishing another update.",
        );
      }

      const now = Timestamp.now();
      const update: EventLiveUpdateSchema = {
        event_id: eventId,
        type: type as EventLiveUpdateType,
        title,
        ...(message ? { message } : {}),
        ...(scheduledDate
          ? { scheduled_for: Timestamp.fromDate(scheduledDate) as EventLiveUpdateSchema["scheduled_for"] }
          : {}),
        ...(eventSpotId ? { event_spot_id: eventSpotId } : {}),
        status: "published",
        created_at: now as EventLiveUpdateSchema["created_at"],
        created_by: uid,
        published_at: now as EventLiveUpdateSchema["published_at"],
      };
      transaction.create(updateRef, update);
      transaction.set(
        stateRef,
        { last_published_at: now, last_published_by: uid, updated_at: now },
        { merge: true },
      );
    });

    return { updateId: updateRef.id };
  },
);

export const onEventLiveUpdateCreate = onDocumentCreated(
  "events/{eventId}/live_updates/{updateId}",
  async (event) => {
    const updateSnapshot = event.data;
    if (!updateSnapshot) return;
    const update = updateSnapshot.data() as EventLiveUpdateSchema;
    if (update.status !== "published") return;

    const eventId = String(event.params.eventId);
    const updateId = String(event.params.updateId);
    const eventSnapshot = await admin.firestore().doc(`events/${eventId}`).get();
    if (!eventSnapshot.exists) return;
    const eventData = eventSnapshot.data() as EventSchema;
    if (eventData.published === false) return;

    let delivered = 0;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    while (delivered < MAX_RECIPIENTS_PER_UPDATE) {
      let query = eventSnapshot.ref
        .collection("live_update_subscribers")
        .where("active", "==", true)
        .orderBy(FieldPath.documentId())
        .limit(Math.min(SUBSCRIBER_PAGE_SIZE, MAX_RECIPIENTS_PER_UPDATE - delivered));
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;

      await Promise.all(
        page.docs.map((subscriber) => {
          const data = subscriber.data() as EventLiveUpdateSubscriberSchema;
          if (data.user_id !== subscriber.id) return Promise.resolve();
          return createIntent(
            `event_live_update_${eventId}_${updateId}_${subscriber.id}`,
            {
              recipientUid: subscriber.id,
              type: "event_update",
              sourcePath: updateSnapshot.ref.path,
              sendAfter: Timestamp.now(),
              expiresAt: Timestamp.fromMillis(Date.now() + UPDATE_LIFETIME_MS),
              path: eventPath(eventId, eventData),
              channelId: "event_updates",
              payload: {
                event_id: eventId,
                event_name: eventData.name,
                update_id: updateId,
                live_update_type: update.type,
                update_title: update.title,
                ...(update.message ? { update_message: update.message } : {}),
                ...(update.event_spot_id ? { event_spot_id: update.event_spot_id } : {}),
              },
            },
          );
        }),
      );
      delivered += page.size;
      cursor = page.docs.at(-1);
      if (page.size < SUBSCRIBER_PAGE_SIZE) break;
    }

    if (delivered >= MAX_RECIPIENTS_PER_UPDATE) {
      logger.warn("Live update recipient cap reached", { eventId, updateId, delivered });
    }
  },
);
