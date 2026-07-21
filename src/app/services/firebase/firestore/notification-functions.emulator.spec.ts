import * as admin from "firebase-admin";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const runWithEmulator = firestoreHost ? describe : describe.skip;
const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
const timeoutMs = 20_000;
let app: admin.app.App;
let db: admin.firestore.Firestore;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDocument(
  path: string,
  predicate: (data: admin.firestore.DocumentData) => boolean,
): Promise<admin.firestore.DocumentData> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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
});
