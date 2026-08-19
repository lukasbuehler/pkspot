import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import * as admin from "firebase-admin";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type {
  CreateSpotSubmissionRequest,
  CreateSpotSubmissionResponse,
} from "../../../../db/schemas/SpotCreationSchema";
import type {
  PreviewSpotDuplicateResolutionRequest,
  PreviewSpotDuplicateResolutionResponse,
  ResolveSpotDuplicateRequest,
  ResolveSpotDuplicateResponse,
} from "../../../../db/schemas/SpotDuplicateResolutionSchema";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const functionsHost = process.env["FUNCTIONS_EMULATOR_HOST"] ?? "127.0.0.1:5001";
const runWithEmulator = firestoreHost && authHost ? describe : describe.skip;
let adminApp: admin.app.App | undefined;
const apps: FirebaseApp[] = [];

function parseHostPort(value: string): [string, number] {
  const [host, rawPort] = value.split(":");
  return [host, Number(rawPort)];
}

function db(): admin.firestore.Firestore {
  adminApp ??= admin.initializeApp(
    { projectId: process.env["GCLOUD_PROJECT"] ?? "demo-pkspot" },
    `spot-creation-admin-${Date.now()}`,
  );
  return admin.firestore(adminApp);
}

async function waitForProcessedEdit(
  reference: admin.firestore.DocumentReference,
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ((await reference.get()).data()?.["processing_status"]) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${reference.path} to be processed`);
}

async function waitForDocument(
  reference: admin.firestore.DocumentReference,
  predicate: (data: admin.firestore.DocumentData) => boolean,
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const data = (await reference.get()).data();
    if (data && predicate(data)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${reference.path} to stabilize`);
}

async function authenticatedCallable(isAdmin = false) {
  const projectId = process.env["GCLOUD_PROJECT"] ?? "demo-pkspot";
  const app = initializeApp(
    { apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId },
    `spot-creation-${Date.now()}-${Math.random()}`,
  );
  apps.push(app);
  const auth = getAuth(app);
  const [authEmulatorHost, authPort] = parseHostPort(authHost!);
  connectAuthEmulator(auth, `http://${authEmulatorHost}:${authPort}`, {
    disableWarnings: true,
  });
  const credential = await signInAnonymously(auth);
  await db().doc(`users/${credential.user.uid}`).set({
    display_name: "Creation Test User",
    is_admin: isAdmin,
  });
  const functions = getFunctions(app, "europe-west1");
  const [functionsEmulatorHost, functionsPort] = parseHostPort(functionsHost);
  connectFunctionsEmulator(functions, functionsEmulatorHost, functionsPort);
  return {
    uid: credential.user.uid,
    functions,
    create: httpsCallable<CreateSpotSubmissionRequest, CreateSpotSubmissionResponse>(
      functions,
      "createSpotSubmission",
    ),
  };
}

const request = (submissionId: string): CreateSpotSubmissionRequest => ({
  submissionId,
  data: {
    name: { en: "Idempotent Spot" },
    location_raw: { lat: 47.3769, lng: 8.5417 },
    media: [],
    type: "other",
    access: "other",
  },
  client: { platform: "web", appVersion: "1.1.4-test" },
});

runWithEmulator("idempotent Spot creation", () => {
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => deleteApp(app)));
  });

  afterAll(async () => {
    await adminApp?.delete();
    adminApp = undefined;
  });

  it("creates one Spot and edit for simultaneous and repeated submissions", async () => {
    const client = await authenticatedCallable();
    const payload = request("same_submission_token_1234");
    const [first, second] = await Promise.all([
      client.create(payload),
      client.create(payload),
    ]);
    const replay = await client.create(payload);

    expect(first.data.spotId).toBe(second.data.spotId);
    expect(replay.data).toMatchObject({
      spotId: first.data.spotId,
      editId: first.data.editId,
      replayed: true,
    });
    const spot = await db().doc(`spots/${first.data.spotId}`).get();
    expect(spot.exists).toBe(true);
    expect((await spot.ref.collection("edits").get()).size).toBe(1);
    const claims = await db().collection("spot_create_submissions")
      .where("uid", "==", client.uid).get();
    expect(claims.docs[0].data()["attempt_count"]).toBe(3);

    const distinct = await client.create(request("distinct_submission_5678"));
    expect(distinct.data.spotId).not.toBe(first.data.spotId);
    await expect(client.create(request("bad"))).rejects.toThrow(/submissionId/i);
    await db().doc(`users/${client.uid}`).set({
      age_policy: { participation_state: "verification_required" },
    }, { merge: true });
    await expect(
      client.create(request("restricted_submission_1234")),
    ).rejects.toThrow(/cannot create public Spots/i);
  }, 90_000);

  it("immediately applies edits from organization reviewers only", async () => {
    const organizationId = "review-org";
    const reviewerUid = "organization-reviewer";
    const memberUid = "ordinary-member";
    const spot = db().doc("spots/stewarded-spot");
    await Promise.all([
      spot.set({
        name: {en: "Stewarded Spot"},
        stewardship: {organization_ids: [organizationId]},
      }),
      db().doc(`users/${reviewerUid}`).set({display_name: "Reviewer"}),
      db().doc(`users/${memberUid}`).set({display_name: "Member"}),
      db().doc(`organizations/${organizationId}/members/${reviewerUid}`).set({
        role: "reviewer",
      }),
      db().doc(`organizations/${organizationId}/members/${memberUid}`).set({
        role: "member",
      }),
    ]);

    const reviewerEdit = spot.collection("edits").doc("reviewer-edit");
    await reviewerEdit.set({
      type: "UPDATE",
      user: {uid: reviewerUid},
      data: {description: {en: "Approved directly"}},
      timestamp: admin.firestore.Timestamp.now(),
      timestamp_raw_ms: Date.now(),
    });
    await waitForProcessedEdit(reviewerEdit);
    expect((await reviewerEdit.get()).data()).toMatchObject({
      approved: true,
      processing_status: "APPROVED_IMMEDIATE",
    });

    const memberEdit = spot.collection("edits").doc("member-edit");
    await memberEdit.set({
      type: "UPDATE",
      user: {uid: memberUid},
      data: {description: {en: "Needs review"}},
      timestamp: admin.firestore.Timestamp.now(),
      timestamp_raw_ms: Date.now() + 1,
    });
    await waitForProcessedEdit(memberEdit);
    expect((await memberEdit.get()).data()).toMatchObject({
      approved: false,
      review_status: "pending",
      review_kind: "stewarded",
      processing_status: "PENDING_STEWARD_REVIEW",
    });
  }, 90_000);

  it("previews and idempotently resolves only a clear subset duplicate", async () => {
    const administrator = await authenticatedCallable(true);
    const creatorUid = "duplicate-creator";
    const createdAt = admin.firestore.Timestamp.fromMillis(Date.now() - 1_000);
    const createData = {
      name: { en: "Lourdes stairs" },
      location_raw: { lat: 43.095, lng: -0.045 },
      media: [],
      type: "stairs",
      access: "public",
    };
    const canonical = db().doc("spots/canonical-spot");
    const redundant = db().doc("spots/redundant-spot");
    const canonicalCreate = canonical.collection("edits").doc("create");
    const redundantCreate = redundant.collection("edits").doc("create");
    await Promise.all([
      db().doc(`users/${creatorUid}`).set({
        spot_edits_count: 2,
        spot_creates_count: 2,
        media_added_count: 0,
      }),
      canonical.set(createData),
      redundant.set(createData),
      canonicalCreate.set({
        type: "CREATE",
        approved: true,
        user: { uid: creatorUid },
        data: createData,
        timestamp: createdAt,
        timestamp_raw_ms: createdAt.toMillis(),
      }),
      redundantCreate.set({
        type: "CREATE",
        approved: true,
        user: { uid: creatorUid },
        data: createData,
        timestamp: createdAt,
        timestamp_raw_ms: createdAt.toMillis() + 500,
      }),
      redundant.collection("reports").doc("duplicate-report").set({
        reason: "duplicate",
        duplicateOf: { id: canonical.id, name: "Lourdes stairs" },
        spot: { id: redundant.id, name: "Lourdes stairs" },
      }),
      db().doc("spot_slugs/lourdes-stairs-copy").set({spot_id: redundant.id}),
    ]);
    await Promise.all([
      waitForProcessedEdit(canonicalCreate),
      waitForProcessedEdit(redundantCreate),
    ]);
    await Promise.all([
      canonical.update({
        media: [{ src: "https://storage.googleapis.com/example/image.jpg", type: "image" }],
      }),
      db().doc(`users/${creatorUid}`).set({
        spot_edits_count: 2,
        spot_creates_count: 2,
        media_added_count: 0,
      }, {merge: true}),
    ]);
    await Promise.all([
      waitForDocument(canonical, (data) =>
        data["thumbnail_medium_url"] ===
          "https://storage.googleapis.com/example/image.jpg" &&
        Boolean(data["duplicate_check"]),
      ),
      waitForDocument(redundant, (data) => Boolean(data["duplicate_check"])),
    ]);

    const preview = httpsCallable<
      PreviewSpotDuplicateResolutionRequest,
      PreviewSpotDuplicateResolutionResponse
    >(administrator.functions, "previewSpotDuplicateResolution");
    const previewResult = await preview({
      reportPath: "spots/redundant-spot/reports/duplicate-report",
      candidateSpotId: canonical.id,
    });
    expect(previewResult.data.eligibleCanonicalSpotIds).toEqual([canonical.id]);
    expect(previewResult.data.reported.media).toHaveLength(0);
    expect(previewResult.data.candidate.media).toHaveLength(1);

    const resolve = httpsCallable<
      ResolveSpotDuplicateRequest,
      ResolveSpotDuplicateResponse
    >(administrator.functions, "resolveSpotDuplicate");
    const resolutionRequest = {
      reportPath: "spots/redundant-spot/reports/duplicate-report",
      canonicalSpotId: canonical.id,
      redundantSpotId: redundant.id,
      previewToken: previewResult.data.previewToken,
    };
    const resolutions = await Promise.all([
      resolve(resolutionRequest),
      resolve(resolutionRequest),
    ]);
    expect(resolutions.map((result) => result.data.replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect((await redundant.get()).exists).toBe(false);
    expect((await db().doc("spot_slugs/lourdes-stairs-copy").get()).data()?.["spot_id"])
      .toBe(canonical.id);
    expect((await resolve(resolutionRequest)).data.replayed).toBe(true);
    expect((await db().collection("moderation_actions")
      .where("action_type", "==", "resolve_duplicate_spot")
      .where("decision.redundant_spot_id", "==", redundant.id)
      .get()).size).toBe(1);
  }, 90_000);

  it("scans unnamed duplicate candidates and records completion", async () => {
    const first = db().doc("spots/scan-spot-with-name");
    const unnamed = db().doc("spots/scan-spot-without-name");
    const sharedLocation = {lat: 40, lng: -75};
    const sharedTile = {z16: {x: 100, y: 200}};
    await Promise.all([
      first.set({
        name: {en: "Named candidate"},
        location_raw: sharedLocation,
        tile_coordinates: sharedTile,
      }),
      unnamed.set({
        location_raw: sharedLocation,
        tile_coordinates: sharedTile,
      }),
    ]);

    const state = db().doc("maintenance/spot-duplicate-scan");
    await db().doc("maintenance/run-detect-duplicate-spots").set({test: true});
    await waitForDocument(state, (data) => data["status"] === "DONE");

    const firstCandidates = (await first.get())
      .data()?.["duplicate_check"]?.candidates;
    expect(firstCandidates).toContainEqual({
      spot_id: unnamed.id,
      distance_m: 0,
    });
    expect((await state.get()).data()).toMatchObject({
      status: "DONE",
      flagged_count: expect.any(Number),
      checked_count: expect.any(Number),
    });
    expect(
      (await db().doc("maintenance/run-detect-duplicate-spots").get()).exists,
    ).toBe(false);
  }, 90_000);
});
