import * as admin from "firebase-admin";
import {
  FieldValue,
  Timestamp,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { CommunityFollowSchema } from "../../src/db/schemas/CommunityFollowSchema";
import type { CommunitySpotDigestItemSchema } from "../../src/db/schemas/CommunityNotificationSchema";
import type { CommunityPageSchema } from "../../src/db/schemas/CommunityPageSchema";
import type { EventDiscoverySchema } from "../../src/db/schemas/EventDiscoverySchema";
import type { SpotSchema } from "../../src/db/schemas/SpotSchema";
import { getSpotCommunityCandidates } from "../../src/scripts/CommunityHelpers";
import { getSpotName } from "./spotHelpers";
import { createIntent, upsertPendingIntent } from "./notificationFunctions";
import {
  communityEventSendAfter,
  nextFridayAtSix,
  publicSpotImage,
  spotQualifiesForCommunityDigest,
} from "./communityNotificationPolicy";

const DAY_MS = 24 * 60 * 60 * 1000;
const FANOUT_PAGE_SIZE = 500;
const MAX_DIGEST_ITEMS = 500;

interface FollowRecipient {
  uid: string;
  keys: Set<string>;
  names: Set<string>;
}

export const onCommunityEventDiscoveryWrite = onDocumentWritten(
  "event_discovery/{eventId}",
  async (event) => {
    const eventId = String(event.params.eventId);
    const after = event.data?.after.exists
      ? (event.data.after.data() as EventDiscoverySchema)
      : null;
    const keys = await expandCommunityKeys(after?.community_keys ?? []);
    const start = timestamp(after?.start);
    const end = timestamp(after?.end);
    const eligible = Boolean(
      after &&
        start &&
        end &&
        end.toMillis() > Date.now() &&
        after.lifecycle_status !== "cancelled",
    );
    const recipients = eligible
      ? await followersFor(keys, "event_notifications")
      : new Map<string, FollowRecipient>();
    await reconcileCommunityEventIntents(eventId, new Set(recipients.keys()));

    await Promise.all(
      [...recipients.values()].map(async (recipient) => {
        const intentId = `community_event_${eventId}_${recipient.uid}`;
        if (!after || !start || !end) return;
        const sendAfter = communityEventSendAfter(start.toMillis(), Date.now());
        await upsertPendingIntent(intentId, {
          recipientUid: recipient.uid,
          type: "community_event",
          sourcePath: `event_discovery/${eventId}`,
          sendAfter,
          expiresAt: end,
          path: `/events/${encodeURIComponent(after.slug ?? eventId)}`,
          channelId: "community_events",
          threadKey: `event:${eventId}`,
          imageUrl: after.banner_src,
          actions: [{ id: "save_event_interested" }],
          payload: {
            event_id: eventId,
            event_name: after.name,
            community_name: [...recipient.names][0] ?? after.locality_string,
            community_keys: JSON.stringify([...recipient.keys]),
            starts_at: start.toDate().toISOString(),
          },
        });
      }),
    );
  },
);

export const onCommunitySpotRecommendationWrite = onDocumentWritten(
  "spots/{spotId}",
  async (event) => {
    const before = event.data?.before.exists
      ? (event.data.before.data() as SpotSchema)
      : null;
    const after = event.data?.after.exists
      ? (event.data.after.data() as SpotSchema)
      : null;
    if (
      !after ||
      spotQualifiesForCommunityDigest(before) ||
      !spotQualifiesForCommunityDigest(after)
    ) return;

    const image = publicSpotImage(after);
    const rawKeys = getSpotCommunityCandidates(after).map(
      (candidate) => candidate.communityKey,
    );
    const keys = await expandCommunityKeys(rawKeys);
    const recipients = await followersFor(keys, "spot_digest_notifications");
    const now = Timestamp.now();
    const spotId = String(event.params.spotId);

    await Promise.all(
      [...recipients.values()].map(async (recipient) => {
        const timeZone = await userTimeZone(recipient.uid);
        const delivery = nextFridayAtSix(Date.now(), timeZone);
        const item: CommunitySpotDigestItemSchema = {
          spot_id: spotId,
          spot_name: getSpotName(after, "en"),
          spot_path: `/s/${encodeURIComponent(after.slug ?? spotId)}`,
          image_url: image,
          rating: after.rating ?? 0,
          community_keys: [...recipient.keys],
          community_names: [...recipient.names],
          eligible_at: now as CommunitySpotDigestItemSchema["eligible_at"],
          eligible_at_raw_ms: now.toMillis(),
          send_after: delivery.timestamp as CommunitySpotDigestItemSchema["send_after"],
          digest_week: delivery.week,
          status: "pending",
        };
        try {
          await admin
            .firestore()
            .doc(`users/${recipient.uid}/community_spot_digest_items/${spotId}`)
            .create(item);
        } catch (error) {
          const code = (error as { code?: unknown }).code;
          if (code !== 6 && code !== "already-exists") throw error;
        }
      }),
    );
  },
);

export const sendCommunitySpotDigests = onSchedule(
  { schedule: "every 15 minutes", timeZone: "UTC" },
  async () => {
    const snapshot = await admin
      .firestore()
      .collectionGroup("community_spot_digest_items")
      .where("status", "==", "pending")
      .where("send_after", "<=", Timestamp.now())
      .orderBy("send_after", "asc")
      .limit(MAX_DIGEST_ITEMS)
      .get();
    const groups = new Map<string, typeof snapshot.docs>();
    for (const doc of snapshot.docs) {
      const uid = doc.ref.parent.parent?.id;
      const week = (doc.data() as CommunitySpotDigestItemSchema).digest_week;
      if (!uid || !week) continue;
      const key = `${uid}:${week}`;
      groups.set(key, [...(groups.get(key) ?? []), doc]);
    }

    for (const [key, docs] of groups) {
      const separator = key.indexOf(":");
      const uid = key.slice(0, separator);
      const week = key.slice(separator + 1);
      const valid = [];
      for (const doc of docs) {
        const item = doc.data() as CommunitySpotDigestItemSchema;
        if (await digestItemStillEligible(uid, item)) valid.push({ doc, item });
      }
      const intentId = `community_spot_digest_${uid}_${week}`;
      if (valid.length > 0) {
        const keys = [...new Set(valid.flatMap(({ item }) => item.community_keys))];
        const names = [...new Set(valid.flatMap(({ item }) => item.community_names))];
        await createIntent(intentId, {
          recipientUid: uid,
          type: "community_spot_digest",
          sourcePath: `users/${uid}/community_spot_digest_items`,
          sendAfter: Timestamp.now(),
          expiresAt: Timestamp.fromMillis(Date.now() + 7 * DAY_MS),
          path: "/train",
          channelId: "community_spot_digest",
          threadKey: `community-spot-digest:${week}`,
          imageUrl: valid[0]?.item.image_url,
          payload: {
            spot_count: String(valid.length),
            spot_ids: JSON.stringify(valid.map(({ item }) => item.spot_id)),
            community_names: JSON.stringify(names),
            community_keys: JSON.stringify(keys),
            top_spot_name: valid[0]?.item.spot_name ?? "",
          },
        });
      }
      const batch = admin.firestore().batch();
      for (const doc of docs) {
        batch.update(doc.ref, {
          status: valid.some((entry) => entry.doc.id === doc.id)
            ? "included"
            : "skipped",
          intent_id: valid.length > 0 ? intentId : FieldValue.delete(),
          processed_at: Timestamp.now(),
        });
      }
      await batch.commit();
    }
  },
);

export const migrateCommunityFollowsOnMerge = onDocumentWritten(
  "community_merges/{communityKey}",
  async (event) => {
    const merge = event.data?.after.data();
    if (merge?.["status"] !== "active") return;
    const sourceKey = String(event.params.communityKey);
    const targetKey = String(merge["target_community_key"] ?? "");
    if (!targetKey || sourceKey === targetKey) return;
    const targetPage = await admin.firestore().doc(`community_pages/${targetKey}`).get();
    if (!targetPage.exists) return;

    await forEachCommunityFollow(sourceKey, async (source) => {
        const uid = source.ref.parent.parent?.id;
        if (!uid) return;
        const sourceData = source.data() as CommunityFollowSchema;
        const targetRef = admin
          .firestore()
          .doc(`users/${uid}/community_follows/${targetKey}`);
        await admin.firestore().runTransaction(async (transaction) => {
          const existing = await transaction.get(targetRef);
          const existingData = existing.data() as CommunityFollowSchema | undefined;
          const page = targetPage.data() as CommunityPageSchema;
          transaction.set(targetRef, {
            community_key: targetKey,
            scope: page.scope,
            display_name: page.displayName,
            canonical_path: page.canonicalPath,
            ...(page.image?.url ? { image_url: page.image.url } : {}),
            time_created: existingData?.time_created ?? sourceData.time_created,
            time_created_raw_ms: Math.min(
              existingData?.time_created_raw_ms ?? Number.MAX_SAFE_INTEGER,
              sourceData.time_created_raw_ms,
            ),
            event_notifications:
              existingData?.event_notifications === true ||
              sourceData.event_notifications === true,
            spot_digest_notifications:
              existingData?.spot_digest_notifications === true ||
              sourceData.spot_digest_notifications === true,
            time_updated: Timestamp.now() as unknown as CommunityFollowSchema["time_updated"],
            time_updated_raw_ms: Date.now(),
          } satisfies CommunityFollowSchema);
          transaction.delete(source.ref);
        });
      });
  },
);

async function followersFor(
  communityKeys: readonly string[],
  setting: "event_notifications" | "spot_digest_notifications",
): Promise<Map<string, FollowRecipient>> {
  const recipients = new Map<string, FollowRecipient>();
  for (const key of communityKeys) {
    await forEachCommunityFollow(key, async (doc) => {
      const data = doc.data() as CommunityFollowSchema;
      const uid = doc.ref.parent.parent?.id;
      if (!uid || data[setting] !== true) return;
      const recipient = recipients.get(uid) ?? {
        uid,
        keys: new Set<string>(),
        names: new Set<string>(),
      };
      recipient.keys.add(data.community_key);
      recipient.names.add(data.display_name);
      recipients.set(uid, recipient);
    });
  }
  return recipients;
}

async function forEachCommunityFollow(
  communityKey: string,
  visit: (doc: QueryDocumentSnapshot) => Promise<void>,
): Promise<void> {
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    let query = admin
      .firestore()
      .collectionGroup("community_follows")
      .where("community_key", "==", communityKey)
      .orderBy("__name__")
      .limit(FANOUT_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    await Promise.all(snapshot.docs.map(visit));
    cursor = snapshot.docs.at(-1);
    if (snapshot.size < FANOUT_PAGE_SIZE) return;
  } while (cursor);
}

async function reconcileCommunityEventIntents(
  eventId: string,
  eligibleRecipients: ReadonlySet<string>,
): Promise<void> {
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    let query = admin
      .firestore()
      .collection("notification_intents")
      .where("source_path", "==", `event_discovery/${eventId}`)
      .orderBy("__name__")
      .limit(FANOUT_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    await Promise.all(
      snapshot.docs.map(async (doc) => {
        const recipientUid = doc.data()["recipient_uid"];
        if (
          typeof recipientUid === "string" &&
          !eligibleRecipients.has(recipientUid)
        ) {
          await cancelPendingIntent(doc.id, "event_unavailable");
        }
      }),
    );
    cursor = snapshot.docs.at(-1);
    if (snapshot.size < FANOUT_PAGE_SIZE) return;
  } while (cursor);
}

async function expandCommunityKeys(keys: readonly string[]): Promise<string[]> {
  const expanded = new Set(keys.filter(Boolean));
  for (const key of [...expanded]) {
    const page = await admin.firestore().doc(`community_pages/${key}`).get();
    const data = page.data() as CommunityPageSchema | undefined;
    if (data?.redirect_to_community_key) expanded.add(data.redirect_to_community_key);
    for (const merged of data?.merged_community_keys ?? []) expanded.add(merged);
  }
  return [...expanded];
}

async function digestItemStillEligible(
  uid: string,
  item: CommunitySpotDigestItemSchema,
): Promise<boolean> {
  const [spot, ...follows] = await Promise.all([
    admin.firestore().doc(`spots/${item.spot_id}`).get(),
    ...item.community_keys.map((key) =>
      admin.firestore().doc(`users/${uid}/community_follows/${key}`).get(),
    ),
  ]);
  return (
    spotQualifiesForCommunityDigest(
      spot.exists ? (spot.data() as SpotSchema) : null,
    ) &&
    follows.some((follow) => follow.data()?.["spot_digest_notifications"] === true)
  );
}

async function userTimeZone(uid: string): Promise<string> {
  const snapshot = await admin.firestore().doc(`users/${uid}/private_data/main`).get();
  const value = snapshot.data()?.["time_zone"];
  if (typeof value !== "string") return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    return "UTC";
  }
}

function timestamp(value: unknown): Timestamp | null {
  if (value instanceof Timestamp) return value;
  if (!value || typeof value !== "object") return null;
  const seconds = (value as { seconds?: unknown }).seconds;
  const nanoseconds = (value as { nanoseconds?: unknown }).nanoseconds;
  return typeof seconds === "number" && typeof nanoseconds === "number"
    ? new Timestamp(seconds, nanoseconds)
    : null;
}

async function cancelPendingIntent(id: string, reason: string): Promise<void> {
  const ref = admin.firestore().doc(`notification_intents/${id}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) return;
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
