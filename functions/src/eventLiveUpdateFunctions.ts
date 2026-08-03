import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type {
  EventProgramRuntimeOverrideSchema,
  EventSchema,
} from "../../src/db/schemas/EventSchema";
import {
  type ApplyEventOperationalChangeRequest,
  type ApplyEventOperationalChangeResponse,
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

const parseDate = (value: unknown, field: string): Date => {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be an ISO date.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError("invalid-argument", `${field} must be an ISO date.`);
  }
  return date;
};

const civilDateTime = (date: Date, timeZone: string | undefined) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
};

function operationCopy(
  request: ApplyEventOperationalChangeRequest,
  event: EventSchema,
): { type: EventLiveUpdateType; title: string; message?: string } {
  switch (request.operation) {
    case "cancel_event":
      return { type: "event_cancelled", title: "Event cancelled", message: request.reason };
    case "restore_event":
      return { type: "event_restored", title: "Event restored", message: request.note };
    case "reschedule_event":
      return { type: "event_rescheduled", title: "Event rescheduled", message: request.note };
    case "activate_program_plan": {
      const plan = event.program?.plans.find((candidate) => candidate.id === request.planId);
      return {
        type: "program_plan_activated",
        title: plan ? `Plan changed to ${plan.label}` : "Event plan changed",
        message: request.note ?? plan?.condition_label,
      };
    }
    case "update_program_item": {
      const item = event.program?.plans
        .find((plan) => plan.id === request.planId)
        ?.items.find((candidate) => candidate.id === request.itemId);
      const status = request.status === "scheduled" ? "updated" : request.status;
      return {
        type: "program_item_update",
        title: item ? `${item.title} ${status}` : `Program item ${status}`,
        message: request.note,
      };
    }
  }
}

async function authorizedEventEditor(
  uid: string,
  eventId: string,
  event: EventSchema,
): Promise<boolean> {
  const user = await admin.firestore().doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] === true) return true;

  if (event.owner?.type === "user" && event.owner.user_id === uid) return true;
  const organizationIds = [
    event.owner?.type === "organization"
      ? event.owner.organization_id
      : undefined,
    event.organizer_access === "edit"
      ? event.organizer?.organization.id
      : undefined,
  ].filter((id): id is string => !!id);
  const [memberships, access] = await Promise.all([
    Promise.all(
      organizationIds.map((organizationId) =>
        admin
          .firestore()
          .doc(`organizations/${organizationId}/members/${uid}`)
          .get(),
      ),
    ),
    admin.firestore().doc(`events/${eventId}/access/${uid}`).get(),
  ]);
  if (access.data()?.["role"] === "collaborator") return true;
  return memberships.some((member) => {
    const role = (member.data() as OrganizationMemberSchema | undefined)?.role;
    return role === "owner" || role === "admin";
  });
}

export const applyEventOperationalChange = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<ApplyEventOperationalChangeResponse> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to manage an event.");

    const input = (request.data ?? {}) as ApplyEventOperationalChangeRequest;
    const eventId = cleanRequiredText(input.eventId, "eventId", 128);
    const eventRef = admin.firestore().doc(`events/${eventId}`);
    const snapshot = await eventRef.get();
    if (!snapshot.exists) throw new HttpsError("not-found", "Event not found.");
    const eventData = snapshot.data() as EventSchema;
    if (!(await authorizedEventEditor(uid, eventId, eventData))) {
      throw new HttpsError("permission-denied", "Event editing access is required.");
    }

    const note = cleanOptionalText(input.note, "note", EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH);
    const reason = input.operation === "cancel_event"
      ? cleanRequiredText(input.reason, "reason", EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH)
      : undefined;
    const operationId = admin.firestore().collection("event_operations").doc().id;
    const updateRef = eventRef.collection("live_updates").doc(operationId);

    await admin.firestore().runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(eventRef);
      if (!currentSnapshot.exists) throw new HttpsError("not-found", "Event not found.");
      const current = currentSnapshot.data() as EventSchema;
      const currentUpdatedAt = timestampMillis(current.time_updated);
      if (
        input.expectedUpdatedAtMs !== undefined &&
        currentUpdatedAt !== input.expectedUpdatedAtMs
      ) {
        throw new HttpsError(
          "aborted",
          "The event changed while this operation was open. Reload and try again.",
        );
      }
      const eventEnd = timestampMillis(current.end);
      if (eventEnd !== null && eventEnd < Date.now()) {
        throw new HttpsError("failed-precondition", "Past events cannot be changed operationally.");
      }

      const now = Timestamp.now();
      const patch: Record<string, unknown> = {
        time_updated: now,
        last_operation_id: operationId,
      };
      let programPlanId: string | undefined;
      let programItemId: string | undefined;
      let previousScheduledFor: Timestamp | undefined;
      let previousScheduledUntil: Timestamp | undefined;
      let scheduledFor: Timestamp | undefined;
      let scheduledUntil: Timestamp | undefined;

      switch (input.operation) {
        case "cancel_event":
          if (current.lifecycle_status === "cancelled") {
            throw new HttpsError("failed-precondition", "The event is already cancelled.");
          }
          patch["lifecycle_status"] = "cancelled";
          patch["lifecycle_update"] = { note: reason, changed_at: now, changed_by: uid };
          break;
        case "restore_event":
          if (current.lifecycle_status !== "cancelled") {
            throw new HttpsError("failed-precondition", "The event is not cancelled.");
          }
          patch["lifecycle_status"] = "planned";
          patch["lifecycle_update"] = { ...(note ? { note } : {}), changed_at: now, changed_by: uid };
          break;
        case "reschedule_event": {
          const start = parseDate(input.start, "start");
          const end = parseDate(input.end, "end");
          if (end <= start) throw new HttpsError("invalid-argument", "End must be after start.");
          if (end.getTime() <= Date.now()) {
            throw new HttpsError("invalid-argument", "The revised event must end in the future.");
          }
          const startCivil = civilDateTime(start, current.time_zone);
          const endCivil = civilDateTime(end, current.time_zone);
          patch["start"] = Timestamp.fromDate(start);
          patch["end"] = Timestamp.fromDate(end);
          patch["timing"] = {
            start_date: startCivil.date,
            end_date: endCivil.date,
            start_time: startCivil.time,
            end_time: endCivil.time,
            mode: "exact",
          };
          const previousStartMs = timestampMillis(current.start);
          const previousEndMs = timestampMillis(current.end);
          previousScheduledFor = previousStartMs === null
            ? undefined
            : Timestamp.fromMillis(previousStartMs);
          previousScheduledUntil = previousEndMs === null
            ? undefined
            : Timestamp.fromMillis(previousEndMs);
          scheduledFor = Timestamp.fromDate(start);
          scheduledUntil = Timestamp.fromDate(end);
          break;
        }
        case "activate_program_plan": {
          const program = current.program;
          if (!program) throw new HttpsError("failed-precondition", "The event has no program.");
          if (!program.plans.some((plan) => plan.id === input.planId)) {
            throw new HttpsError("not-found", "Program plan not found.");
          }
          if (program.active_plan_id === input.planId) {
            throw new HttpsError("failed-precondition", "That program plan is already active.");
          }
          programPlanId = cleanRequiredText(input.planId, "planId", 128);
          patch["program"] = {
            ...program,
            active_plan_id: programPlanId,
            ...(note ? { active_plan_note: note } : {}),
            active_plan_changed_at: now,
            active_plan_changed_by: uid,
          };
          break;
        }
        case "update_program_item": {
          const program = current.program;
          if (!program) throw new HttpsError("failed-precondition", "The event has no program.");
          programPlanId = cleanRequiredText(input.planId, "planId", 128);
          programItemId = cleanRequiredText(input.itemId, "itemId", 128);
          const planIndex = program.plans.findIndex((plan) => plan.id === programPlanId);
          const itemIndex = planIndex < 0
            ? -1
            : program.plans[planIndex].items.findIndex((item) => item.id === programItemId);
          if (planIndex < 0 || itemIndex < 0) {
            throw new HttpsError("not-found", "Program item not found.");
          }
          const plans = program.plans.map((plan) => ({ ...plan, items: [...plan.items] }));
          const item = plans[planIndex].items[itemIndex];
          const start = input.start ? parseDate(input.start, "start") : undefined;
          const end = input.end ? parseDate(input.end, "end") : undefined;
          const effectiveStart = start ?? (item.runtime_override?.start
            ? new Date(timestampMillis(item.runtime_override.start) ?? 0)
            : new Date(timestampMillis(item.start) ?? 0));
          const effectiveEnd = end ?? (item.runtime_override?.end
            ? new Date(timestampMillis(item.runtime_override.end) ?? 0)
            : item.end ? new Date(timestampMillis(item.end) ?? 0) : undefined);
          if (effectiveEnd && effectiveEnd <= effectiveStart) {
            throw new HttpsError("invalid-argument", "Program item end must be after start.");
          }
          plans[planIndex].items[itemIndex] = {
            ...item,
            runtime_override: {
              ...(start ? {
                start: Timestamp.fromDate(start) as unknown as EventProgramRuntimeOverrideSchema["start"],
              } : {}),
              ...(end ? {
                end: Timestamp.fromDate(end) as unknown as EventProgramRuntimeOverrideSchema["end"],
              } : {}),
              status: input.status,
              ...(note ? { note } : {}),
              updated_at: now as unknown as EventProgramRuntimeOverrideSchema["updated_at"],
              updated_by: uid,
            },
          };
          scheduledFor = start ? Timestamp.fromDate(start) : undefined;
          patch["program"] = { ...program, plans };
          break;
        }
        default:
          throw new HttpsError("invalid-argument", "Unsupported event operation.");
      }

      const copy = operationCopy(input, current);
      transaction.update(eventRef, patch);
      if (current.published !== false) {
        const update: EventLiveUpdateSchema = {
          event_id: eventId,
          type: copy.type,
          title: copy.title,
          ...(copy.message ? { message: copy.message } : {}),
          ...(previousScheduledFor ? {
            previous_scheduled_for:
              previousScheduledFor as EventLiveUpdateSchema["previous_scheduled_for"],
          } : {}),
          ...(previousScheduledUntil ? {
            previous_scheduled_until:
              previousScheduledUntil as EventLiveUpdateSchema["previous_scheduled_until"],
          } : {}),
          ...(scheduledFor ? { scheduled_for: scheduledFor as EventLiveUpdateSchema["scheduled_for"] } : {}),
          ...(scheduledUntil ? {
            scheduled_until: scheduledUntil as EventLiveUpdateSchema["scheduled_until"],
          } : {}),
          operation_id: operationId,
          operation_type: input.operation,
          ...(programPlanId ? { program_plan_id: programPlanId } : {}),
          ...(programItemId ? { program_item_id: programItemId } : {}),
          status: "published",
          created_at: now as EventLiveUpdateSchema["created_at"],
          created_by: uid,
          published_at: now as EventLiveUpdateSchema["published_at"],
        };
        transaction.create(updateRef, update);
      }
    });

    return { operationId, ...(eventData.published !== false ? { updateId: operationId } : {}) };
  },
);

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
    if (event.lifecycle_status === "cancelled") {
      throw new HttpsError("failed-precondition", "Cancelled events cannot send live updates.");
    }
    if (
      event.notification_policy === "none" ||
      event.notification_policy === "reminders"
    ) {
      throw new HttpsError("failed-precondition", "This event does not support update notifications.");
    }
    const eventEnd = timestampMillis(event.end);
    if (!eventEnd || eventEnd < Date.now()) {
      throw new HttpsError("failed-precondition", "Past events cannot send updates.");
    }
    if (!(await authorizedEventEditor(uid, eventId, event))) {
      throw new HttpsError("permission-denied", "Event editing access is required.");
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

    if (
      eventData.notification_policy === "none" ||
      eventData.notification_policy === "reminders"
    ) return;

    const subscribers = await eventSnapshot.ref
      .collection("live_update_subscribers")
      .limit(MAX_RECIPIENTS_PER_UPDATE)
      .get();
    const subscriberStates = new Map(
      subscribers.docs.map((subscriber) => [
        subscriber.id,
        subscriber.data() as EventLiveUpdateSubscriberSchema,
      ]),
    );
    const recipientIds = new Set(
      subscribers.docs
        .filter((subscriber) => {
          const data = subscriber.data() as EventLiveUpdateSubscriberSchema;
          return data.user_id === subscriber.id && data.active === true;
        })
        .map((subscriber) => subscriber.id),
    );

    if (update.operation_type) {
      const rsvps = await eventSnapshot.ref
        .collection("rsvps")
        .where("rsvp", "in", ["going", "interested"])
        .limit(MAX_RECIPIENTS_PER_UPDATE)
        .get();
      for (const rsvp of rsvps.docs) {
        const explicit = subscriberStates.get(rsvp.id);
        if (!explicit || explicit.active === true) recipientIds.add(rsvp.id);
      }
    }

    const recipients = [...recipientIds].slice(0, MAX_RECIPIENTS_PER_UPDATE);
    const previousStartMs = timestampMillis(update.previous_scheduled_for);
    const previousEndMs = timestampMillis(update.previous_scheduled_until);
    const nextStartMs = timestampMillis(update.scheduled_for);
    const nextEndMs = timestampMillis(update.scheduled_until);
    await Promise.all(
      recipients.map((recipientUid) =>
        createIntent(
          `event_live_update_${eventId}_${updateId}_${recipientUid}`,
          {
            recipientUid,
            type: "event_update",
            sourcePath: updateSnapshot.ref.path,
            sendAfter: Timestamp.now(),
            expiresAt: Timestamp.fromMillis(Date.now() + UPDATE_LIFETIME_MS),
            path: eventPath(eventId, eventData),
            channelId: "event_updates",
            threadKey: `event:${eventId}`,
            payload: {
              event_id: eventId,
              event_name: eventData.name,
              update_id: updateId,
              live_update_type: update.type,
              ...(update.operation_type ? { operation_type: update.operation_type } : {}),
              update_title: update.title,
              ...(update.message ? { update_message: update.message } : {}),
              ...(previousStartMs === null
                ? {}
                : { previous_start_ms: String(previousStartMs) }),
              ...(previousEndMs === null
                ? {}
                : { previous_end_ms: String(previousEndMs) }),
              ...(nextStartMs === null ? {} : { next_start_ms: String(nextStartMs) }),
              ...(nextEndMs === null ? {} : { next_end_ms: String(nextEndMs) }),
              ...(eventData.time_zone ? { time_zone: eventData.time_zone } : {}),
              ...(update.event_spot_id ? { event_spot_id: update.event_spot_id } : {}),
            },
          },
        ),
      ),
    );

    if (recipientIds.size > MAX_RECIPIENTS_PER_UPDATE) {
      logger.warn("Live update recipient cap reached", {
        eventId,
        updateId,
        recipients: recipientIds.size,
      });
    }
  },
);
