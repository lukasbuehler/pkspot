import * as admin from "firebase-admin";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const runWithEmulator = firestoreHost ? describe : describe.skip;
const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
const timeoutMs = 40_000;
let app: admin.app.App;
let db: admin.firestore.Firestore;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDocument(
  path: string,
  predicate: (data: admin.firestore.DocumentData) => boolean,
): Promise<admin.firestore.DocumentData> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const snapshot = await db.doc(path).get();
    const data = snapshot.data();
    if (data && predicate(data)) return data;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${path}`);
}

runWithEmulator("notification function integrations", () => {
  beforeAll(async () => {
    app = admin.initializeApp({ projectId }, `notification-tests-${Date.now()}`);
    db = admin.firestore(app);
  });

  afterAll(async () => {
    await app.delete();
  });

  it("creates and invalidates a new-follower notification for a public account", async () => {
    const userId = "public-follow-target";
    const followerId = "public-follow-source";
    const followedAt = 1_789_000_000_000;
    const intentId = `new_follower_${userId}_${followerId}_${followedAt}`;
    const followerPath = `users/${userId}/followers/${followerId}`;

    await Promise.all([
      db.doc(`users/${userId}`).set({
        display_name: "Public Target",
        account_privacy: "public",
      }),
      db.doc(`users/${followerId}`).set({ display_name: "New Follower" }),
    ]);
    await db.doc(followerPath).set({
      display_name: "New Follower",
      start_following_raw_ms: followedAt,
    });

    const intent = await waitForDocument(
      `notification_intents/${intentId}`,
      (data) => data["status"] === "pending",
    );
    expect(intent).toEqual(
      expect.objectContaining({
        recipient_uid: userId,
        type: "new_follower",
        path: `/u/${followerId}`,
        channel_id: "follow_incoming",
        payload: expect.objectContaining({
          follower_id: followerId,
          follower_name: "New Follower",
        }),
      }),
    );

    const feedItem = await waitForDocument(
      `users/${userId}/notifications/${intentId}`,
      (data) => data["active"] === true,
    );
    expect(feedItem["type"]).toBe("new_follower");

    await db.doc(followerPath).delete();
    const cancelled = await waitForDocument(
      `notification_intents/${intentId}`,
      (data) => data["status"] === "cancelled",
    );
    expect(cancelled["failure_reason"]).toBe("follower_removed");
    await waitForDocument(
      `users/${userId}/notifications/${intentId}`,
      (data) => data["active"] === false,
    );
  }, timeoutMs);

  it("does not create a duplicate new-follower intent for a private account", async () => {
    const userId = "private-follow-target";
    const followerId = "approved-follow-source";
    const followedAt = 1_789_000_000_001;
    const intentId = `new_follower_${userId}_${followerId}_${followedAt}`;

    await db.doc(`users/${userId}`).set({
      display_name: "Private Target",
      account_privacy: "private",
      profile_visibility: "followers",
    });
    await db.doc(`users/${userId}/followers/${followerId}`).set({
      display_name: "Approved Follower",
      start_following_raw_ms: followedAt,
    });

    await sleep(2_000);
    expect((await db.doc(`notification_intents/${intentId}`).get()).exists).toBe(
      false,
    );
  }, timeoutMs);

  it("uses the relationship channel for a new mutual follower", async () => {
    const userId = "mutual-follow-target";
    const followerId = "mutual-follow-source";
    const followedAt = 1_789_000_000_002;
    const intentId = `new_follower_${userId}_${followerId}_${followedAt}`;

    await Promise.all([
      db.doc(`users/${userId}`).set({
        display_name: "Mutual Target",
        account_privacy: "public",
      }),
      db.doc(`users/${followerId}`).set({
        display_name: "Mutual Follower",
        account_privacy: "public",
      }),
    ]);
    await db.doc(`users/${userId}/following/${followerId}`).set({
      display_name: "Mutual Follower",
      start_following_raw_ms: followedAt - 1,
    });
    await db.doc(`users/${userId}/followers/${followerId}`).set({
      display_name: "Mutual Follower",
      start_following_raw_ms: followedAt,
    });

    const intent = await waitForDocument(
      `notification_intents/${intentId}`,
      (data) => data["status"] === "pending",
    );
    expect(intent["channel_id"]).toBe("follow_relationships");
    expect(intent["payload"]["relationship"]).toBe("mutual");
  }, timeoutMs);

  it("retains interested RSVP context in event reminders and cancels them when declined", async () => {
    const eventId = "interested-reminder-event";
    const userId = "interested-reminder-user";
    const intentId = `event_reminder_${eventId}_${userId}`;
    const start = admin.firestore.Timestamp.fromMillis(
      Date.now() + 4 * 60 * 60 * 1000,
    );
    await db.doc(`events/${eventId}`).set({
      name: "City Jam",
      slug: "city-jam",
      published: true,
      start,
      end: admin.firestore.Timestamp.fromMillis(
        start.toMillis() + 2 * 60 * 60 * 1000,
      ),
    });
    const rsvp = db.doc(`events/${eventId}/rsvps/${userId}`);
    await rsvp.set({
      user_id: userId,
      event_id: eventId,
      rsvp: "interested",
      time_created: admin.firestore.Timestamp.now(),
      time_updated: admin.firestore.Timestamp.now(),
    });

    const reminder = await waitForDocument(
      `notification_intents/${intentId}`,
      (data) =>
        data["status"] === "pending" &&
        data["payload"]?.["rsvp"] === "interested",
    );
    expect(reminder["payload"]).toEqual(
      expect.objectContaining({
        event_id: eventId,
        event_name: "City Jam",
        rsvp: "interested",
      }),
    );

    await rsvp.update({
      rsvp: "notgoing",
      time_updated: admin.firestore.Timestamp.now(),
    });
    const cancelled = await waitForDocument(
      `notification_intents/${intentId}`,
      (data) => data["status"] === "cancelled",
    );
    expect(cancelled["failure_reason"]).toBe("rsvp_removed");
  }, timeoutMs);

  it("schedules reminders when an older RSVP gains a subscription", async () => {
    const eventId = "migrated-reminder-event";
    const userId = "migrated-reminder-user";
    const rsvp = db.doc(`events/${eventId}/rsvps/${userId}`);
    await rsvp.set({
      user_id: userId,
      event_id: eventId,
      rsvp: "going",
      time_created: admin.firestore.Timestamp.now(),
      time_updated: admin.firestore.Timestamp.now(),
    });
    await sleep(500);

    const start = admin.firestore.Timestamp.fromMillis(
      Date.now() + 4 * 60 * 60 * 1000,
    );
    await db.doc(`events/${eventId}`).set({
      name: "Migration Jam",
      slug: "migration-jam",
      published: true,
      lifecycle_status: "planned",
      start,
      end: admin.firestore.Timestamp.fromMillis(
        start.toMillis() + 2 * 60 * 60 * 1000,
      ),
    });
    await db
      .doc(`events/${eventId}/live_update_subscribers/${userId}`)
      .set({
        user_id: userId,
        active: true,
        event_reminders: true,
        reminder_offsets_minutes: [30],
        subscribed_at: admin.firestore.Timestamp.now(),
        updated_at: admin.firestore.Timestamp.now(),
      });

    const reminder = await waitForDocument(
      `notification_intents/event_reminder_${eventId}_${userId}_30`,
      (data) => data["status"] === "pending",
    );
    expect(reminder["payload"]).toEqual(
      expect.objectContaining({
        event_id: eventId,
        event_name: "Migration Jam",
        reminder_offset_minutes: "30",
        rsvp: "going",
      }),
    );
  }, timeoutMs);

  it("schedules followed-community public events at the 30-day boundary", async () => {
    const eventId = "community-event-1";
    const userId = "community-event-follower";
    const communityKey = "country:ch";
    const start = admin.firestore.Timestamp.fromMillis(
      Date.now() + 180 * 24 * 60 * 60 * 1000,
    );
    await Promise.all([
      db.doc(`community_pages/${communityKey}`).set({
        communityKey,
        scope: "country",
        displayName: "Switzerland",
        canonicalPath: "/map/communities/switzerland",
        published: true,
      }),
      db.doc(`users/${userId}/community_follows/${communityKey}`).set({
        community_key: communityKey,
        scope: "country",
        display_name: "Switzerland",
        canonical_path: "/map/communities/switzerland",
        event_notifications: true,
        spot_digest_notifications: false,
        time_created: admin.firestore.Timestamp.now(),
        time_created_raw_ms: Date.now(),
      }),
    ]);
    await db.doc(`event_discovery/${eventId}`).set({
      name: "Swiss Jam",
      slug: "swiss-jam",
      publication_state: "published",
      published: true,
      visibility: "public",
      discoverability: { audience: "global" },
      lifecycle_status: "planned",
      locality_string: "Zurich",
      community_keys: [communityKey],
      start,
      end: admin.firestore.Timestamp.fromMillis(start.toMillis() + 3_600_000),
    });

    const intentId = `community_event_${eventId}_${userId}`;
    const intent = await waitForDocument(
      `notification_intents/${intentId}`,
      (data) => data["status"] === "pending",
    );
    expect(intent["type"]).toBe("community_event");
    expect(intent["channel_id"]).toBe("community_events");
    expect(intent["send_after"].toMillis()).toBe(
      start.toMillis() - 30 * 24 * 60 * 60 * 1000,
    );
    expect(intent["payload"]["community_name"]).toBe("Switzerland");

    await db.doc(`event_discovery/${eventId}`).update({
      lifecycle_status: "cancelled",
    });
    const cancelled = await waitForDocument(
      `notification_intents/${intentId}`,
      (data) => data["status"] === "cancelled",
    );
    expect(cancelled["failure_reason"]).toBe("event_unavailable");
  }, timeoutMs);

  it("notifies a requester when a private follow request is accepted", async () => {
    const requesterId = "accepted-follow-requester";
    const privateUserId = "accepted-private-target";
    const followedAt = 1_789_000_000_003;
    const intentId =
      `follow_accepted_${requesterId}_${privateUserId}_${followedAt}`;

    await Promise.all([
      db.doc(`users/${requesterId}`).set({
        display_name: "Requester",
        account_privacy: "public",
      }),
      db.doc(`users/${privateUserId}`).set({
        display_name: "Private Target",
        account_privacy: "private",
        profile_visibility: "followers",
      }),
    ]);
    await db.doc(`users/${requesterId}/following/${privateUserId}`).set({
      display_name: "Private Target",
      start_following_raw_ms: followedAt,
    });

    const intent = await waitForDocument(
      `notification_intents/${intentId}`,
      (data) => data["status"] === "pending",
    );
    expect(intent).toEqual(
      expect.objectContaining({
        recipient_uid: requesterId,
        type: "follow_accepted",
        channel_id: "follow_relationships",
        path: `/u/${privateUserId}`,
      }),
    );
  }, timeoutMs);

  it("notifies an authenticated reporter after action on a Spot report", async () => {
    const reporterId = "spot-report-reporter";
    const intentId =
      "spot_report_reported-spot_spot-report-1_action_taken";

    await db.doc("moderation_actions/spot-report-action-1").set({
      action_type: "keep_warning",
      source_type: "spot_report",
      source_path: "spots/reported-spot/reports/spot-report-1",
      source_snapshot: {
        spot: { id: "reported-spot", name: "Central Plaza" },
        user: { uid: reporterId },
      },
      target_type: "spot",
      created_at: admin.firestore.Timestamp.now(),
      created_by: { uid: "moderator-1" },
    });

    const intent = await waitForDocument(
      `notification_intents/${intentId}`,
      (data) => data["status"] === "pending",
    );
    expect(intent).toEqual(
      expect.objectContaining({
        recipient_uid: reporterId,
        type: "spot_report_update",
        channel_id: "spot_report_updates",
        path: "/notifications",
        payload: {
          outcome: "action_taken",
          target_name: "Central Plaza",
        },
      }),
    );

    const feedItem = await waitForDocument(
      `users/${reporterId}/notifications/${intentId}`,
      (data) => data["active"] === true,
    );
    expect(feedItem["type"]).toBe("spot_report_update");
  }, timeoutMs);

  it("notifies an authenticated reporter when a media report is closed", async () => {
    const reporterId = "media-report-reporter";
    const intentId = "media_report_media-report-1_dismissed";

    await db.doc("moderation_actions/media-report-action-1").set({
      action_type: "close_report",
      source_type: "media_report",
      source_path: "media_reports/media-report-1",
      source_snapshot: {
        media: { src: "https://example.test/reported.jpg", type: "image" },
        user: { uid: reporterId },
      },
      target_type: "media",
      created_at: admin.firestore.Timestamp.now(),
      created_by: { uid: "moderator-1" },
    });

    const intent = await waitForDocument(
      `notification_intents/${intentId}`,
      (data) => data["status"] === "pending",
    );
    expect(intent).toEqual(
      expect.objectContaining({
        recipient_uid: reporterId,
        type: "media_report_update",
        channel_id: "media_report_updates",
        path: "/notifications",
        payload: {
          outcome: "dismissed",
          target_name: "your reported media",
        },
      }),
    );
  }, timeoutMs);

  it("notifies a contributor when community information is reviewed", async () => {
    const contributorId = "community-contributor";
    const communityKey = "country:ch";
    const editId = "community-edit-1";
    const editPath = `community_pages/${communityKey}/edits/${editId}`;
    const intentId =
      `community_info_${communityKey}_${editId}_approved`;

    await db.doc(editPath).set({
      target_type: "community",
      target_id: communityKey,
      edit_kind: "knowledge",
      status: "pending",
      user: { uid: contributorId },
      community_display_name: "Switzerland",
      community_path: "/map/communities/switzerland",
    });
    await db.doc(editPath).update({ status: "approved", approved: true });

    const intent = await waitForDocument(
      `notification_intents/${intentId}`,
      (data) => data["status"] === "pending",
    );
    expect(intent).toEqual(
      expect.objectContaining({
        recipient_uid: contributorId,
        type: "community_info_update",
        channel_id: "community_info_updates",
        path: "/map/communities/switzerland",
        payload: {
          community_key: communityKey,
          community_name: "Switzerland",
          outcome: "approved",
        },
      }),
    );

    const feedItem = await waitForDocument(
      `users/${contributorId}/notifications/${intentId}`,
      (data) => data["active"] === true,
    );
    expect(feedItem["type"]).toBe("community_info_update");
  }, timeoutMs);
});
