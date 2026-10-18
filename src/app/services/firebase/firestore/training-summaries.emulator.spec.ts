import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { CustomProvider, initializeAppCheck } from "firebase/app-check";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from "firebase/firestore";
import * as admin from "firebase-admin";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type {
  ConfirmCheckInRequest,
  ConfirmCheckInResponse,
  DeleteCheckInResponse,
} from "../../../../db/schemas/CheckInActivitySchema";
import type {
  SetCheckInSessionDurationRequest,
  SetCheckInSessionDurationResponse,
  TrainingMonthSchema,
  TrainingRanksSchema,
} from "../../../../db/schemas/TrainingSummarySchema";
import { legendTallyId, localDateKey } from "../../../../db/utils/training-summary";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const functionsHost = process.env["FUNCTIONS_EMULATOR_HOST"] ?? "127.0.0.1:5001";
const runWithEmulator = firestoreHost && authHost ? describe : describe.skip;
const apps: FirebaseApp[] = [];
let adminApp: admin.app.App | undefined;
const TIME_ZONE = "Europe/Zurich";

function parseHostPort(value: string): [string, number] {
  const [host, rawPort] = value.split(":");
  return [host, Number(rawPort)];
}

function db(): admin.firestore.Firestore {
  adminApp ??= admin.initializeApp(
    { projectId: process.env["GCLOUD_PROJECT"] ?? "demo-pkspot" },
    `training-summaries-admin-${Date.now()}`,
  );
  return admin.firestore(adminApp);
}

function emulatorAppCheckToken(projectId: string): string {
  const now = Math.floor(Date.now() / 1_000);
  const encode = (value: Record<string, unknown>): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    sub: "training-summary-emulator-app",
    aud: [projectId],
    iat: now,
    exp: now + 3_600,
  })}.`;
}

async function signedInClient() {
  const projectId = process.env["GCLOUD_PROJECT"] ?? "demo-pkspot";
  if (!projectId.startsWith("demo-")) throw new Error("Training summary tests require a demo project");
  const app = initializeApp(
    { apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId },
    `training-summaries-${Date.now()}-${Math.random()}`,
  );
  apps.push(app);
  const auth = getAuth(app);
  const [authEmulatorHost, authPort] = parseHostPort(authHost!);
  connectAuthEmulator(auth, `http://${authEmulatorHost}:${authPort}`, { disableWarnings: true });
  const credential = await signInAnonymously(auth);
  await db().doc(`users/${credential.user.uid}`).set({
    display_name: "Training summary test user",
    age_policy: { participation_state: "allowed" },
  });
  initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: async () => ({
        token: emulatorAppCheckToken(projectId),
        expireTimeMillis: Date.now() + 3_600_000,
      }),
    }),
    isTokenAutoRefreshEnabled: false,
  });
  const functions = getFunctions(app, "europe-west1");
  const [functionsEmulatorHost, functionsPort] = parseHostPort(functionsHost);
  connectFunctionsEmulator(functions, functionsEmulatorHost, functionsPort);
  const firestore = getFirestore(app);
  const [firestoreEmulatorHost, firestorePort] = parseHostPort(firestoreHost!);
  connectFirestoreEmulator(firestore, firestoreEmulatorHost, firestorePort);
  return {
    uid: credential.user.uid,
    firestore,
    confirm: httpsCallable<ConfirmCheckInRequest, ConfirmCheckInResponse>(functions, "confirmCheckIn"),
    deleteOne: httpsCallable<{ checkInId: string }, DeleteCheckInResponse>(functions, "deleteCheckIn"),
    setDuration: httpsCallable<SetCheckInSessionDurationRequest, SetCheckInSessionDurationResponse>(
      functions,
      "setCheckInSessionDuration",
    ),
  };
}

async function seedSpot(spotId: string): Promise<void> {
  await db().doc(`spots/${spotId}`).set({
    name: { en: { text: `Spot ${spotId}`, provider: "user" } },
    location_raw: { lat: 47.3769, lng: 8.5417 },
  });
}

const checkInRequest = (spotId: string): ConfirmCheckInRequest => ({
  spotId,
  location: { lat: 47.3769, lng: 8.5417 },
  accuracyMeters: 10,
  timeZone: TIME_ZONE,
});

/** Triggers run asynchronously in the emulator; poll until they settle. */
async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 30_000;
  let value = await read();
  while (!done(value)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for trigger: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    value = await read();
  }
  return value;
}

const currentMonth = () => localDateKey(Date.now(), TIME_ZONE).slice(0, 7);
const monthDoc = (uid: string) => db().doc(`users/${uid}/training_months/${currentMonth()}`);

runWithEmulator("private training summaries and Spot ranks", () => {
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => deleteApp(app)));
  });

  afterAll(async () => {
    await adminApp?.delete();
    adminApp = undefined;
  });

  it("summarizes a check-in privately, adds a logged duration, and forgets it after deletion", async () => {
    const client = await signedInClient();
    const spotId = `summary-${client.uid}`;
    await seedSpot(spotId);

    const confirmed = (await client.confirm(checkInRequest(spotId))).data;
    expect(confirmed).toMatchObject({ duplicate: false, spotVisitCount: 1, verified: true });

    const month = await eventually(
      async () => (await monthDoc(client.uid).get()).data() as TrainingMonthSchema | undefined,
      (value) => !!value?.spots[spotId],
    );
    expect(month!.spots[spotId]).toMatchObject({ visits: 1, verified_days: 1, minutes: 0 });
    expect(month!.session_count).toBe(1);

    // The owner can read the summaries; another account cannot.
    const own = await getDoc(doc(client.firestore, `users/${client.uid}/training_spots/${spotId}`));
    expect(own.data()).toMatchObject({ visits: 1, verified_days: 1 });
    const stranger = await signedInClient();
    await expect(
      getDoc(doc(stranger.firestore, `users/${client.uid}/training_months/${currentMonth()}`)),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      getDoc(doc(client.firestore, `spot_legend_tallies/${legendTallyId(currentMonth(), spotId, client.uid)}`)),
    ).rejects.toMatchObject({ code: "permission-denied" });

    // Self-reported duration closes the session and feeds training time only.
    await client.setDuration({ sessionRecordId: confirmed.sessionRecordId, durationMinutes: 90 });
    const timed = await eventually(
      async () => (await monthDoc(client.uid).get()).data() as TrainingMonthSchema | undefined,
      (value) => value?.minutes === 90,
    );
    expect(timed!.spots[spotId]).toMatchObject({ minutes: 90, verified_days: 1 });
    await expect(
      stranger.setDuration({ sessionRecordId: confirmed.sessionRecordId, durationMinutes: 60 }),
    ).rejects.toMatchObject({ code: "functions/not-found" });
    await expect(
      client.setDuration({ sessionRecordId: confirmed.sessionRecordId, durationMinutes: 2 }),
    ).rejects.toMatchObject({ code: "functions/invalid-argument" });

    await client.deleteOne({ checkInId: confirmed.checkInId });
    await eventually(async () => (await monthDoc(client.uid).get()).exists, (exists) => !exists);
    await eventually(
      async () => (await db().doc(`users/${client.uid}/training_spots/${spotId}`).get()).exists,
      (exists) => !exists,
    );
    expect(
      (await db().doc(`spot_legend_tallies/${legendTallyId(currentMonth(), spotId, client.uid)}`).get()).exists,
    ).toBe(false);
  }, 120_000);

  it("keeps published ranks private and withdraws them when the owner removes visits", async () => {
    const regular = await signedInClient();
    const spotId = `rank-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await seedSpot(spotId);

    // Two verified days this month, written as server data.
    const today = Date.now();
    const days = [0, 1, 2].map((offset) => today - offset * 26 * 3_600_000)
      .filter((time) => localDateKey(time, TIME_ZONE).startsWith(currentMonth()))
      .slice(0, 2);
    if (days.length < 2) return; // The first day of a month has only one local day.
    await Promise.all(days.map((time, index) =>
      db().doc(`users/${regular.uid}/session_records/seeded-${index}`).set({
        owner_id: regular.uid,
        source: "check_in",
        started_at_raw_ms: time,
        last_activity_raw_ms: time,
        time_zone: TIME_ZONE,
        spot_visits: [{ spot_id: spotId, check_in_id: `seeded-check-${index}`, arrived_at_raw_ms: time, verified: true }],
        people_present: [],
      })));
    await eventually(
      async () => (await monthDoc(regular.uid).get()).data() as TrainingMonthSchema | undefined,
      (value) => value?.spots[spotId]?.verified_days === 2,
    );
    const tally = await db().doc(`spot_legend_tallies/${legendTallyId(currentMonth(), spotId, regular.uid)}`).get();
    expect(tally.data()).toMatchObject({ verified_days: 2, spot_id: spotId });

    // Ranks are never written by the session trigger; the nightly job publishes them.
    const ranksPath = `users/${regular.uid}/training_ranks/${currentMonth()}`;
    expect((await db().doc(ranksPath).get()).exists).toBe(false);
    const published: TrainingRanksSchema = {
      version: 1,
      month: currentMonth(),
      final: false,
      computed_at_raw_ms: today,
      spots: { [spotId]: { status: "ranked", verified_days: 2, rank: 1, tied_with: 0, legend: true } },
    };
    await db().doc(ranksPath).set(published);

    const own = await getDoc(doc(regular.firestore, ranksPath));
    expect(own.data()?.["spots"][spotId]).toMatchObject({ rank: 1 });
    const stranger = await signedInClient();
    await expect(getDoc(doc(stranger.firestore, ranksPath))).rejects.toMatchObject({ code: "permission-denied" });

    // Dropping below two verified days withdraws the rank right away.
    await db().doc(`users/${regular.uid}/session_records/seeded-1`).delete();
    await eventually(async () => (await db().doc(ranksPath).get()).exists, (exists) => !exists);
  }, 120_000);
});
