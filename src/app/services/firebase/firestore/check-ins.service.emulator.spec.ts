import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { CustomProvider, initializeAppCheck } from "firebase/app-check";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import * as admin from "firebase-admin";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type {
  ConfirmCheckInRequest,
  ConfirmCheckInResponse,
  DeleteAllCheckInsResponse,
  DeleteCheckInResponse,
} from "../../../../db/schemas/CheckInActivitySchema";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const functionsHost = process.env["FUNCTIONS_EMULATOR_HOST"] ?? "127.0.0.1:5001";
const runWithEmulator = firestoreHost && authHost ? describe : describe.skip;
const apps: FirebaseApp[] = [];
let adminApp: admin.app.App | undefined;

function parseHostPort(value: string): [string, number] {
  const [host, rawPort] = value.split(":");
  return [host, Number(rawPort)];
}

function db(): admin.firestore.Firestore {
  adminApp ??= admin.initializeApp(
    { projectId: process.env["GCLOUD_PROJECT"] ?? "demo-pkspot" },
    `check-ins-admin-${Date.now()}`,
  );
  return admin.firestore(adminApp);
}

function emulatorAppCheckToken(projectId: string): string {
  const now = Math.floor(Date.now() / 1_000);
  const encode = (value: Record<string, unknown>): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return (
    `${encode({ alg: "none", typ: "JWT" })}.` +
    `${encode({
      sub: "check-in-emulator-app",
      aud: [projectId],
      iat: now,
      exp: now + 3_600,
    })}.`
  );
}

async function authenticatedCallable() {
  const projectId = process.env["GCLOUD_PROJECT"] ?? "demo-pkspot";
  const app = initializeApp(
    { apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId },
    `check-ins-${Date.now()}-${Math.random()}`,
  );
  apps.push(app);
  const auth = getAuth(app);
  const [authEmulatorHost, authPort] = parseHostPort(authHost!);
  connectAuthEmulator(auth, `http://${authEmulatorHost}:${authPort}`, {
    disableWarnings: true,
  });
  const credential = await signInAnonymously(auth);
  await db().doc(`users/${credential.user.uid}`).set({
    display_name: "Check-in test user",
    age_policy: { participation_state: "allowed" },
  });
  initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: async () => ({
        token: emulatorAppCheckToken(projectId),
        expireTimeMillis: Date.now() + 60 * 60 * 1_000,
      }),
    }),
    isTokenAutoRefreshEnabled: false,
  });
  const functions = getFunctions(app, "europe-west1");
  const [functionsEmulatorHost, functionsPort] = parseHostPort(functionsHost);
  connectFunctionsEmulator(functions, functionsEmulatorHost, functionsPort);
  return {
    uid: credential.user.uid,
    confirm: httpsCallable<ConfirmCheckInRequest, ConfirmCheckInResponse>(
      functions,
      "confirmCheckIn",
    ),
    deleteOne: httpsCallable<{ checkInId: string }, DeleteCheckInResponse>(
      functions,
      "deleteCheckIn",
    ),
    deleteAll: httpsCallable<Record<string, never>, DeleteAllCheckInsResponse>(
      functions,
      "deleteAllCheckIns",
    ),
  };
}

async function seedSpot(
  spotId: string,
  location: { lat: number; lng: number } = { lat: 47.3769, lng: 8.5417 },
): Promise<void> {
  await db().doc(`spots/${spotId}`).set({
    name: { en: `Spot ${spotId}` },
    location_raw: location,
  });
}

function request(spotId: string): ConfirmCheckInRequest {
  return {
    spotId,
    location: { lat: 47.3769, lng: 8.5417 },
    accuracyMeters: 10,
    timeZone: "Europe/Zurich",
  };
}

runWithEmulator("private check-in callables", () => {
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => deleteApp(app)));
  });

  afterAll(async () => {
    await adminApp?.delete();
    adminApp = undefined;
  });

  it("keeps confirmation private, deduplicates it, and removes one occurrence without touching authored logs", async () => {
    const client = await authenticatedCallable();
    const spotId = `spot-${client.uid}`;
    await seedSpot(spotId);
    await db().doc(`users/${client.uid}/log_entries/authored`).set({
      owner_id: client.uid,
      note: "A separately authored entry",
    });

    const first = await client.confirm(request(spotId));
    const duplicate = await client.confirm(request(spotId));
    expect(duplicate.data).toMatchObject({
      checkInId: first.data.checkInId,
      sessionRecordId: first.data.sessionRecordId,
      duplicate: true,
    });

    const sessionRef = db().doc(
      `users/${client.uid}/session_records/${first.data.sessionRecordId}`,
    );
    const session = (await sessionRef.get()).data()!;
    expect(session["source"]).toBe("check_in");
    expect(session["spot_visits"]).toHaveLength(1);
    expect(JSON.stringify(session)).not.toContain("47.3769");
    expect((await db().doc(`users/${client.uid}/private_data/main`).get()).data()?.["visited_spots"])
      .toContain(spotId);

    await expect(client.deleteOne({ checkInId: first.data.checkInId })).resolves.toMatchObject({
      data: { deleted: true },
    });
    expect((await sessionRef.get()).exists).toBe(false);
    await expect(client.confirm(request(spotId))).rejects.toThrow(/wait before checking in/i);
    const integrity = (await db().doc(`users/${client.uid}/check_in_integrity/main`).get()).data()!;
    expect(integrity["last_accepted_spot_id"]).toBe(spotId);
    expect(integrity["expires_at"].toMillis()).toBeGreaterThan(Date.now());
    const farSpot = `after-delete-${client.uid}`;
    await seedSpot(farSpot, { lat: 48.8566, lng: 2.3522 });
    const far = await client.confirm({ ...request(farSpot), location: { lat: 48.8566, lng: 2.3522 } });
    expect((await db().doc(`spots/${farSpot}/check_in_aggregate_contributions/${far.data.checkInId}`).get()).data()?.["exclusion_reason"])
      .toBe("impossible_travel");
    expect((await db().doc(`users/${client.uid}/private_data/main`).get()).data()?.["visited_spots"])
      .not.toContain(spotId);
    expect((await db().doc(`users/${client.uid}/log_entries/authored`).get()).exists).toBe(true);
    expect((await db().doc(`spots/${spotId}/check_in_aggregate_contributions/${first.data.checkInId}`).get()).exists)
      .toBe(false);
  }, 90_000);

  it("accepts eligible participation and excludes inaccurate or impossible confirmations from activity", async () => {
    const client = await authenticatedCallable();
    const firstSpot = `first-${client.uid}`;
    const farSpot = `far-${client.uid}`;
    const inaccurateSpot = `inaccurate-${client.uid}`;
    await Promise.all([
      seedSpot(firstSpot),
      seedSpot(farSpot, { lat: 48.8566, lng: 2.3522 }),
      seedSpot(inaccurateSpot),
    ]);

    const accepted = await client.confirm(request(firstSpot));
    const impossible = await client.confirm({
      ...request(farSpot),
      location: { lat: 48.8566, lng: 2.3522 },
    });
    const inaccurate = await client.confirm({
      ...request(inaccurateSpot),
      accuracyMeters: 80,
    });

    await expect(
      client.confirm({ ...request(`missing-${client.uid}`), spotId: `missing-${client.uid}` }),
    ).rejects.toThrow(/Spot no longer exists/i);
    const [acceptedContribution, impossibleContribution, inaccurateContribution] = await Promise.all([
      db().doc(`spots/${firstSpot}/check_in_aggregate_contributions/${accepted.data.checkInId}`).get(),
      db().doc(`spots/${farSpot}/check_in_aggregate_contributions/${impossible.data.checkInId}`).get(),
      db().doc(`spots/${inaccurateSpot}/check_in_aggregate_contributions/${inaccurate.data.checkInId}`).get(),
    ]);
    expect(acceptedContribution.data()?.["eligibility"]).toBe("accepted");
    expect(impossibleContribution.data()).toMatchObject({
      eligibility: "excluded",
      exclusion_reason: "impossible_travel",
    });
    expect(inaccurateContribution.data()).toMatchObject({
      eligibility: "excluded",
      exclusion_reason: "location_accuracy",
    });
    expect(JSON.stringify(impossibleContribution.data())).not.toContain("48.8566");

    await db().doc(`users/${client.uid}`).set(
      { age_policy: { participation_state: "verification_required" } },
      { merge: true },
    );
    await expect(client.confirm(request(firstSpot))).rejects.toThrow(/cannot check in/i);
  }, 90_000);

  it("does not remove a visited Spot marker that is also backed by a legacy check-in", async () => {
    const client = await authenticatedCallable();
    const spotId = `legacy-${client.uid}`;
    await seedSpot(spotId);
    const checkIn = await client.confirm(request(spotId));
    await db().doc(`users/${client.uid}/check_ins/legacy`).set({spot_id: spotId});

    await client.deleteOne({checkInId: checkIn.data.checkInId});

    expect((await db().doc(`users/${client.uid}/private_data/main`).get()).data()?.["visited_spots"])
      .toContain(spotId);
  }, 90_000);

  it("caps an account at twelve distinct confirmations per hour and can clear its check-ins", async () => {
    const client = await authenticatedCallable();
    const spotIds = Array.from(
      { length: 13 },
      (_, index) => `rate-${client.uid}-${index}`,
    );
    await Promise.all(spotIds.map((spotId) => seedSpot(spotId)));

    for (const spotId of spotIds.slice(0, 12)) {
      await expect(client.confirm(request(spotId))).resolves.toBeDefined();
    }
    await expect(client.confirm(request(spotIds[12]))).rejects.toThrow(/Too many check-ins/i);
    await expect(client.deleteAll({})).resolves.toMatchObject({ data: { deleted: 12 } });
    expect((await db().collection(`users/${client.uid}/check_in_lookup`).get()).empty).toBe(true);
  }, 90_000);
});
