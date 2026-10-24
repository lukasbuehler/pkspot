import { TestBed } from "@angular/core/testing";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { environment } from "../../../../environments/environment.default";
import { PlatformService } from "../../platform.service";
import { FirebaseAppCheckService } from "../app-check.service";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FIREBASE_APP, FIREBASE_FUNCTIONS } from "../firebase-client.providers";
import { SessionRecordsService } from "./session-records.service";

import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { CustomProvider, initializeAppCheck } from "firebase/app-check";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import * as admin from "firebase-admin";
import {
  collection, collectionGroup, connectFirestoreEmulator, deleteDoc, doc,
  getDoc, getDocs, getFirestore, setDoc, updateDoc,
} from "firebase/firestore";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConfirmCheckInRequest,
  ConfirmCheckInResponse,
  DeleteAllCheckInsResponse,
  DeleteCheckInResponse,
} from "../../../../db/schemas/CheckInActivitySchema";

// Only the native credential bridge is substituted. Both platform paths use
// the real app services, HTTP transport, callable handlers and Firestore.
vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {getIdToken: vi.fn()},
}));
const originalProduction = environment.production;
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
  if (!projectId.startsWith("demo-")) throw new Error("Check-in tests require a demo project");
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
  const firestore = getFirestore(app);
  const [firestoreEmulatorHost, firestorePort] = parseHostPort(firestoreHost!);
  connectFirestoreEmulator(firestore, firestoreEmulatorHost, firestorePort);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${await credential.user.getIdToken()}`,
    "X-Firebase-AppCheck": emulatorAppCheckToken(projectId),
  };
  return {
    app, functions,
    uid: credential.user.uid,
    firestore,
    headers,
    post: (name: string, data: unknown, requestHeaders: Record<string, string> = headers) => fetch(
      `http://${functionsHost}/${projectId}/europe-west1/${name}`,
      {method: "POST", headers: requestHeaders, body: JSON.stringify({data})},
    ),
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
    name: { en: { text: `Spot ${spotId}`, provider: "user" } },
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
    localStorage.removeItem("pkspot:e2e:firebaseEmulators");
    environment.production = originalProduction;
    await Promise.all(apps.splice(0).map((app) => deleteApp(app)));
  });

  afterAll(async () => {
    await adminApp?.delete();
    adminApp = undefined;
  });

  it.each([false, true])("confirms and deletes through the real app service and HTTP adapter (native=%s)", async native => {
    const client = await authenticatedCallable();
    const spotId = `adapter-${client.uid}`;
    await seedSpot(spotId);
    environment.production = false;
    const [host, port] = parseHostPort(functionsHost);
    localStorage.setItem("pkspot:e2e:firebaseEmulators", JSON.stringify({functions: {host, port}}));
    vi.mocked(FirebaseAuthentication.getIdToken).mockResolvedValue({
      token: client.headers.Authorization.slice("Bearer ".length),
    });
    TestBed.configureTestingModule({providers: [
      SessionRecordsService,
      {provide: FIREBASE_APP, useValue: client.app},
      {provide: FIREBASE_FUNCTIONS, useValue: client.functions},
      {provide: PlatformService, useValue: {isNative: () => native}},
      {provide: AuthenticationService, useValue: {user: {uid: client.uid}}},
      {provide: FirestoreAdapterService, useValue: {}},
      {provide: FirebaseAppCheckService, useValue: {
        getTokenForRequest: async () => client.headers["X-Firebase-AppCheck"],
      }},
    ]});
    const service = TestBed.inject(SessionRecordsService);
    const confirmed = await service.confirmCheckIn(request(spotId));
    expect(confirmed.duplicate).toBe(false);
    const session = await getDoc(doc(client.firestore, `users/${client.uid}/session_records/${confirmed.sessionRecordId}`));
    expect(session.data()?.["spot_visits"]).toEqual(expect.arrayContaining([
      expect.objectContaining({spot_id: spotId, check_in_id: confirmed.checkInId}),
    ]));
    await service.deleteCheckIn(confirmed.checkInId);
    expect((await getDoc(session.ref)).exists()).toBe(false);
  }, 90_000);

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
    expect(session["spot_visits"]).toEqual([expect.objectContaining({spot_name: expect.stringMatching(/^Spot /)})]);
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

  it("does not reopen a historical session when one of its visits is deleted", async () => {
    const client = await authenticatedCallable();
    const spotId = `historical-${client.uid}`;
    const nextSpotId = `next-${client.uid}`;
    await seedSpot(spotId);
    await seedSpot(nextSpotId);
    const first = (await client.confirm(request(spotId))).data;
    const ref = db().doc(`users/${client.uid}/session_records/${first.sessionRecordId}`);
    const session = (await ref.get()).data()!;
    const oldMs = Date.now() - 30 * 24 * 60 * 60_000;
    const old = admin.firestore.Timestamp.fromMillis(oldMs);
    const visit = {...session["spot_visits"][0], arrived_at: old, arrived_at_raw_ms: oldMs};
    await ref.update({
      started_at: old, started_at_raw_ms: oldMs,
      last_activity_at: old, last_activity_raw_ms: oldMs,
      spot_visits: [visit, {...visit, check_in_id: "remaining-visit"}],
    });
    await client.deleteOne({checkInId: first.checkInId});
    const remaining = (await ref.get()).data()!;
    expect(remaining["spot_visits"]).toHaveLength(1);
    expect(remaining["last_activity_raw_ms"]).toBe(oldMs);
    expect(remaining["last_activity_at"].toMillis()).toBe(oldMs);
    expect(remaining["time_updated_raw_ms"]).toBeGreaterThan(oldMs);
    const next = (await client.confirm(request(nextSpotId))).data;
    expect(next.sessionRecordId).not.toBe(first.sessionRecordId);
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

  it("bridges an older client's check-in into private visited history without public activity", async () => {
    const client = await authenticatedCallable();
    const spotId = `legacy-only-${client.uid}`;
    await seedSpot(spotId);
    await db().doc(`users/${client.uid}/check_ins/legacy`).set({spot_id: spotId});

    await expect.poll(async () =>
      (await db().doc(`users/${client.uid}/legacy_check_in_spot_index/${spotId}`).get()).data()?.["legacy_visited"],
    {timeout: 20_000}).toBe(true);
    expect((await db().doc(`users/${client.uid}/private_data/main`).get()).data()?.["visited_spots"])
      .toContain(spotId);
    expect((await db().collection(`spots/${spotId}/check_in_aggregate_contributions`).get()).empty).toBe(true);
    expect((await db().doc(`spot_activity_public/${spotId}`).get()).exists).toBe(false);
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

  it("enforces Auth and App Check at the HTTP boundary, including deletion", async () => {
    const client = await authenticatedCallable();
    for (const name of ["confirmCheckIn", "deleteCheckIn", "deleteAllCheckIns"]) {
      for (const missing of ["Authorization", "X-Firebase-AppCheck"] as const) {
        const headers = {...client.headers};
        delete (headers as Partial<typeof headers>)[missing];
        const response = await client.post(name, request("untrusted"), headers);
        expect(response.status, `${name} without ${missing}`).toBe(401);
        expect(await response.json()).toMatchObject({error: {status: "UNAUTHENTICATED"}});
      }
      // The emulator accepts unsigned App Check tokens; genuine attestation
      // remains a device/deployment check, not something this suite can prove.
    }
    expect((await db().collection(`users/${client.uid}/session_records`).get()).empty).toBe(true);
  }, 90_000);

  it("requires App Check for share preparation and refuses private targets even when authenticated", async () => {
    const client = await authenticatedCallable();
    const id = `private-share-${client.uid}`;
    await db().doc(`spots/${id}`).set({name: "Private fixture", visibility: "private"});
    const withoutAppCheck = {"Content-Type": "application/json", Authorization: client.headers.Authorization};
    const missing = await client.post("prepareShareCard", {kind: "spot", id}, withoutAppCheck);
    expect(missing.status).toBe(401);
    const forbidden = await client.post("prepareShareCard", {kind: "spot", id});
    expect(forbidden.status).toBe(403);
    // Signed-out sharing is allowed in principle but must never reveal a private
    // entity. This request uses only the emulator's unsigned App Check token.
    const signedOut = {"Content-Type": "application/json", "X-Firebase-AppCheck": client.headers["X-Firebase-AppCheck"]};
    expect((await client.post("prepareShareCard", {kind: "spot", id}, signedOut)).status).toBe(403);
    for (const data of [{kind: "users", id}, {kind: "spot", id: "../users"}, {kind: "spot", id: "."}]) {
      expect((await client.post("prepareShareCard", data)).status).toBe(400);
    }
  }, 90_000);

  it("prepares, reuses and serves a public share card through callable HTTP with no authentication", async () => {
    const client = await authenticatedCallable();
    const id = `http-share-${client.uid}`;
    await db().doc(`spots/${id}`).set({name: "Public HTTP card"});
    const headers = {"Content-Type": "application/json", "X-Firebase-AppCheck": client.headers["X-Firebase-AppCheck"]};
    const first = await client.post("prepareShareCard", {kind: "spot", id}, headers);
    expect(first.status, await first.clone().text()).toBe(200);
    expect(await first.json()).toMatchObject({result: {reused: false, imageUrl: expect.stringContaining("shareCardImage?")}});
    const reused = await client.post("prepareShareCard", {kind: "spot", id}, headers);
    expect(await reused.json()).toMatchObject({result: {reused: true}});
    const url = `http://${functionsHost}/${client.app.options.projectId}/europe-west1/shareCardImage?kind=spot&id=${id}`;
    const image = await fetch(url);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/png");
    expect([...new Uint8Array(await image.arrayBuffer()).slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    await db().doc(`spots/${id}`).update({visibility: "private"});
    expect((await fetch(url)).status).toBe(404);
  }, 90_000);

  it("rejects malformed coordinates, document paths and time zones without writing history", async () => {
    const client = await authenticatedCallable();
    const spotId = `validation-${client.uid}`;
    await seedSpot(spotId);
    for (const changes of [
      {spotId: "../users"}, {spotId: "."}, {spotId: ".."},
      {location: {lat: 91, lng: 8}}, {location: {lat: 47, lng: -181}},
      {location: {lat: "47", lng: 8}}, {location: null},
      {accuracyMeters: -1}, {accuracyMeters: 10_001},
      {timeZone: "not/a-time-zone"}, {timeZone: ""},
    ]) {
      const response = await client.post("confirmCheckIn", {...request(spotId), ...changes});
      expect(response.status, JSON.stringify(changes)).toBe(400);
      expect(await response.json()).toMatchObject({error: {status: "INVALID_ARGUMENT"}});
    }
    expect((await db().collection(`users/${client.uid}/session_records`).get()).empty).toBe(true);
    expect((await db().collection(`spots/${spotId}/check_in_aggregate_contributions`).get()).empty).toBe(true);
  }, 90_000);

  it("keeps history owner-only and denies direct writes to check-ins and aggregation internals", async () => {
    const owner = await authenticatedCallable();
    const attacker = await authenticatedCallable();
    const spotId = `privacy-${owner.uid}`;
    await seedSpot(spotId);
    const {data: checkIn} = await owner.confirm(request(spotId));
    const sessionPath = `users/${owner.uid}/session_records/${checkIn.sessionRecordId}`;
    expect((await getDoc(doc(owner.firestore, sessionPath))).exists()).toBe(true);
    const denied = {code: "permission-denied"};
    await expect(getDoc(doc(attacker.firestore, sessionPath))).rejects.toMatchObject(denied);
    await expect(getDocs(collection(attacker.firestore, `users/${owner.uid}/session_records`))).rejects.toMatchObject(denied);
    await expect(getDocs(collectionGroup(attacker.firestore, "session_records"))).rejects.toMatchObject(denied);
    for (const client of [owner, attacker]) {
      for (const path of [
        `spots/${spotId}/check_in_aggregate_contributions/${checkIn.checkInId}`,
        `users/${owner.uid}/check_in_lookup/${checkIn.checkInId}`,
        `users/${owner.uid}/check_in_integrity/main`,
        `users/${owner.uid}/check_in_dedup/${spotId}`,
        `check_in_activity_rollups/${spotId}`,
      ]) {
        await expect(getDoc(doc(client.firestore, path))).rejects.toMatchObject(denied);
        await expect(setDoc(doc(client.firestore, path), {owner_id: client.uid, eligibility: "accepted"})).rejects.toMatchObject(denied);
      }
      await expect(deleteDoc(doc(client.firestore, sessionPath))).rejects.toMatchObject(denied);
      await expect(updateDoc(doc(client.firestore, sessionPath), {source: "manual"})).rejects.toMatchObject(denied);
      await expect(updateDoc(doc(client.firestore, `spots/${spotId}`), {recent_activity_min_30d: 25})).rejects.toMatchObject(denied);
      await expect(setDoc(doc(client.firestore, `spot_activity_public/${spotId}`), {bucket: "25+"})).rejects.toMatchObject(denied);
    }
    // Knowing the victim's opaque ID never authorizes deleting their occurrence.
    await expect(attacker.deleteOne({checkInId: checkIn.checkInId})).resolves.toMatchObject({data: {deleted: false}});
    await expect(attacker.post("deleteAllCheckIns", {uid: owner.uid})).resolves.toHaveProperty("status", 200);
    expect((await db().doc(sessionPath).get()).exists).toBe(true);
  }, 90_000);

  it("deduplicates concurrent confirmations and ignores forged ownership and public statistics", async () => {
    const client = await authenticatedCallable();
    const spotId = `parallel-${client.uid}`;
    await seedSpot(spotId);
    const results = await Promise.all(Array.from({length: 5}, () => client.post("confirmCheckIn", {
      ...request(spotId), owner_id: "victim", accepted_at: 1, eligibility: "accepted",
      recent_activity_min_30d: 25,
    }).then(async response => {
      expect(response.status).toBe(200);
      return (await response.json()).result as ConfirmCheckInResponse;
    })));
    expect(new Set(results.map(result => result.checkInId)).size).toBe(1);
    expect(results.filter(result => !result.duplicate)).toHaveLength(1);
    const contributions = await db().collection(`spots/${spotId}/check_in_aggregate_contributions`).get();
    expect(contributions.size).toBe(1);
    expect(contributions.docs[0].get("owner_id")).toBe(client.uid);
    expect(contributions.docs[0].get("accepted_at").toMillis()).toBeGreaterThan(Date.now() - 60_000);
    expect((await db().doc(`spots/${spotId}`).get()).get("recent_activity_min_30d")).toBeUndefined();
    expect((await db().doc(`spot_activity_public/${spotId}`).get()).exists).toBe(false);
  }, 90_000);

  it("accepts both mobile raw bounds and GeoPoints, but excludes an outside geofence", async () => {
    const client = await authenticatedCallable();
    const polygon = [
      {lat: 47.376, lng: 8.541}, {lat: 47.378, lng: 8.541},
      {lat: 47.378, lng: 8.543}, {lat: 47.376, lng: 8.543},
    ];
    for (const shape of ["raw", "geopoint", "outside"] as const) {
      const spotId = `${shape}-${client.uid}`;
      await db().doc(`spots/${spotId}`).set({
        name: {de: "Testplatz"},
        ...(shape === "raw" ? {bounds_raw: polygon} : shape === "geopoint"
          ? {bounds: polygon.map(p => new admin.firestore.GeoPoint(p.lat, p.lng))}
          : {location_raw: {lat: 47.4, lng: 8.6}}),
      });
      const {data} = await client.confirm(request(spotId));
      const contribution = await db().doc(`spots/${spotId}/check_in_aggregate_contributions/${data.checkInId}`).get();
      expect(contribution.get("eligibility")).toBe(shape === "outside" ? "excluded" : "accepted");
      const session = await db().doc(`users/${client.uid}/session_records/${data.sessionRecordId}`).get();
      expect(session.get("spot_visits").at(-1).spot_name).toBe("Testplatz");
    }
  }, 90_000);
});
