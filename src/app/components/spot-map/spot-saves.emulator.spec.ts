import { Injector, NgZone } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  signOut,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import * as admin from "firebase-admin";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Spot } from "../../../db/models/Spot";
import type { SpotSchema } from "../../../db/schemas/SpotSchema";
import { SpotAccess, SpotTypes } from "../../../db/schemas/SpotTypeAndAccess";
import { AnalyticsService } from "../../services/analytics.service";
import { ConsentService } from "../../services/consent.service";
import { FirebaseAppCheckService } from "../../services/firebase/app-check.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  FIREBASE_APP,
  FIREBASE_FIRESTORE,
  FIREBASE_FUNCTIONS,
} from "../../services/firebase/firebase-client.providers";
import { FirestoreAdapterService } from "../../services/firebase/firestore-adapter.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { FunctionsAdapterService } from "../../services/firebase/functions-adapter.service";
import { OsmDataService } from "../../services/osm-data.service";
import { PlatformService } from "../../services/platform.service";
import { SearchService } from "../../services/search.service";
import { SpotMapDataManager } from "./SpotMapDataManager";

/**
 * Pins how the Spot editor saves today, through the real client save path:
 * `SpotMapDataManager.saveSpot` computes the diff against the unedited copy,
 * `SpotEditsService` writes the edit with the client SDK, rules check it, and
 * the edit-processing function applies it. Each case changes one thing the
 * editor can change and checks that exactly that change reaches the Spot.
 * The editor refactor for 1.2.2 must keep all of these passing.
 */

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const functionsHost = process.env["FUNCTIONS_EMULATOR_HOST"] || "127.0.0.1:5001";
const runWithEmulator = firestoreHost && authHost ? describe : describe.skip;
const timeoutMs = 60_000;

let adminApp: admin.app.App | undefined;
function adminDb(): admin.firestore.Firestore {
  adminApp ??= admin.initializeApp(
    { projectId: process.env["GCLOUD_PROJECT"] || "demo-pkspot" },
    "spot-saves-emulator-admin",
  );
  return admin.firestore(adminApp);
}

function parseHostPort(value: string): [string, number] {
  const [host, port] = value.split(":");
  return [host, Number(port)];
}

const START = { lat: 47.3769, lng: 8.5417 };
const MOVED = { lat: 47.37755, lng: 8.54301 };
const OUTLINE = [
  { lat: 47.3768, lng: 8.5416 },
  { lat: 47.3768, lng: 8.5419 },
  { lat: 47.3771, lng: 8.5419 },
  { lat: 47.3771, lng: 8.5416 },
];
const LARGER_OUTLINE = [
  { lat: 47.3765, lng: 8.5412 },
  { lat: 47.3765, lng: 8.5422 },
  { lat: 47.3774, lng: 8.5422 },
  { lat: 47.3774, lng: 8.5412 },
];

function storedSpotData(): Record<string, unknown> {
  return {
    name: { en: { text: "Pinned Spot", provider: "user" } },
    description: { en: { text: "A wall and some rails.", provider: "user" } },
    location: new admin.firestore.GeoPoint(START.lat, START.lng),
    location_raw: START,
    bounds: OUTLINE.map((point) => new admin.firestore.GeoPoint(point.lat, point.lng)),
    bounds_raw: OUTLINE,
    type: SpotTypes.Park,
    access: SpotAccess.Public,
    amenities: { outdoor: true, lighting: false },
    media: [],
    source: "pkspot",
    is_iconic: false,
  };
}

runWithEmulator("Spot editor saves (emulator)", () => {
  let app: FirebaseApp;
  let auth: Auth;
  let uid: string;
  let manager: SpotMapDataManager;

  beforeEach(async () => {
    const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
    app = initializeApp(
      { apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId },
      `spot-saves-${Date.now()}-${Math.random()}`,
    );
    auth = getAuth(app);
    const [authHostName, authPort] = parseHostPort(authHost!);
    connectAuthEmulator(auth, `http://${authHostName}:${authPort}`, { disableWarnings: true });
    let firestore: Firestore;
    try {
      firestore = initializeFirestore(app, { localCache: memoryLocalCache() });
    } catch {
      firestore = getFirestore(app);
    }
    const [firestoreHostName, firestorePort] = parseHostPort(firestoreHost!);
    connectFirestoreEmulator(firestore, firestoreHostName, firestorePort);
    const functions = getFunctions(app, "europe-west1");
    const [functionsHostName, functionsPort] = parseHostPort(functionsHost);
    connectFunctionsEmulator(functions, functionsHostName, functionsPort);

    const credential = await signInAnonymously(auth);
    uid = credential.user.uid;
    // An admin's edits apply immediately, so the stored Spot shows the result.
    await adminDb().doc(`users/${uid}`).set({ display_name: "Spot Editor", is_admin: true });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: FIREBASE_APP, useValue: app },
        { provide: FIREBASE_FIRESTORE, useValue: firestore },
        { provide: FIREBASE_FUNCTIONS, useValue: functions },
        SpotEditsService,
        FirestoreAdapterService,
        FunctionsAdapterService,
        {
          provide: AuthenticationService,
          useValue: {
            isSignedIn: true,
            user: {
              uid,
              data: { uid, displayName: "Spot Editor", display_name: "Spot Editor", isAdmin: true },
            },
          },
        },
        { provide: UsersService, useValue: { getUserRefernceById: async () => null } },
        { provide: SpotsService, useValue: {} },
        { provide: OsmDataService, useValue: {} },
        { provide: SearchService, useValue: {} },
        { provide: ConsentService, useValue: { hasConsent: () => true } },
        { provide: AnalyticsService, useValue: { trackEvent: () => undefined } },
        {
          provide: PlatformService,
          useValue: {
            isNative: () => false,
            isWeb: () => true,
            getPlatform: () => "web",
            getAppType: () => "web",
          },
        },
        {
          provide: FirebaseAppCheckService,
          useValue: { readyForDataRequests: () => Promise.resolve() },
        },
      ],
    });
    manager = new SpotMapDataManager("en", TestBed.inject(Injector));
    void TestBed.inject(NgZone);
  });

  afterEach(async () => {
    await signOut(auth).catch(() => undefined);
    await deleteApp(app).catch(() => undefined);
    TestBed.resetTestingModule();
  });

  afterAll(async () => {
    await adminApp?.delete();
    adminApp = undefined;
  });

  /** Seed a Spot, load it like the app does, and return it with its unedited copy. */
  async function openSpotForEditing(): Promise<{ spot: Spot; unedited: Spot }> {
    const ref = adminDb().collection("spots").doc();
    await ref.set(storedSpotData());
    const snapshot = (await ref.get()).data()!;
    const spot = new Spot(ref.id, toClientSchema(snapshot), "en");
    return { spot, unedited: spot.clone() };
  }

  async function saveAndWait(spot: Spot, unedited: Spot): Promise<admin.firestore.DocumentData> {
    const { spotId, editId } = await manager.saveSpot(spot, unedited);
    expect(editId).toBeTruthy();
    const editRef = adminDb().doc(`spots/${spotId}/edits/${editId}`);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const edit = (await editRef.get()).data();
      const status = edit?.["processing_status"];
      if (typeof status === "string" && status !== "PENDING") {
        expect(status).toMatch(/^APPROVED/);
        return (await adminDb().doc(`spots/${spotId}`).get()).data()!;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Timed out waiting for edit ${editId}`);
  }

  async function editPayload(spot: Spot, unedited: Spot): Promise<Record<string, unknown>> {
    const { spotId, editId } = await manager.saveSpot(spot, unedited);
    return (await adminDb().doc(`spots/${spotId}/edits/${editId}`).get()).data()!["data"];
  }

  it("saves a moved pin without touching the outline", async () => {
    const { spot, unedited } = await openSpotForEditing();
    spot.location.set(MOVED);

    const payload = await editPayload(spot, unedited);
    expect(Object.keys(payload).sort()).toEqual(["location", "location_raw"]);

    const { spot: second, unedited: secondUnedited } = await openSpotForEditing();
    second.location.set(MOVED);
    const stored = await saveAndWait(second, secondUnedited);
    expect(stored["location_raw"]).toEqual(MOVED);
    expect(stored["location"].latitude).toBe(MOVED.lat);
    expect(stored["location"].longitude).toBe(MOVED.lng);
    expect(stored["bounds_raw"]).toEqual(OUTLINE);
  }, timeoutMs);

  it("saves a new outline without moving the pin", async () => {
    const { spot, unedited } = await openSpotForEditing();
    spot.paths.set([LARGER_OUTLINE]);

    const stored = await saveAndWait(spot, unedited);
    expect(stored["bounds_raw"]).toEqual(LARGER_OUTLINE);
    expect(stored["location_raw"]).toEqual(START);
  }, timeoutMs);

  it("saves a moved pin and a new outline together", async () => {
    const { spot, unedited } = await openSpotForEditing();
    spot.location.set(MOVED);
    spot.paths.set([LARGER_OUTLINE]);

    const stored = await saveAndWait(spot, unedited);
    expect(stored["location_raw"]).toEqual(MOVED);
    expect(stored["bounds_raw"]).toEqual(LARGER_OUTLINE);
  }, timeoutMs);

  it("saves the name and description", async () => {
    const { spot, unedited } = await openSpotForEditing();
    spot.setName("Renamed Spot", "en");
    spot.setDescription("Now with a bar.", "en");

    const stored = await saveAndWait(spot, unedited);
    expect(stored["name"]["en"]["text"]).toBe("Renamed Spot");
    expect(stored["description"]["en"]["text"]).toBe("Now with a bar.");
    expect(stored["location_raw"]).toEqual(START);
  }, timeoutMs);

  it("saves the type and access", async () => {
    const { spot, unedited } = await openSpotForEditing();
    spot.type.set(SpotTypes.Playground);
    spot.access.set(SpotAccess.Residential);

    const stored = await saveAndWait(spot, unedited);
    expect(stored["type"]).toBe(SpotTypes.Playground);
    expect(stored["access"]).toBe(SpotAccess.Residential);
  }, timeoutMs);

  it("saves one amenity without losing the others", async () => {
    const { spot, unedited } = await openSpotForEditing();
    spot.amenities.set({ ...spot.amenities(), lighting: true });

    const payload = await editPayload(spot, unedited);
    expect(payload["amenities"]).toEqual({ lighting: true });

    const { spot: second, unedited: secondUnedited } = await openSpotForEditing();
    second.amenities.set({ ...second.amenities(), lighting: true });
    const stored = await saveAndWait(second, secondUnedited);
    expect(stored["amenities"]).toMatchObject({ outdoor: true, lighting: true });
  }, timeoutMs);

  it("creates no edit when nothing changed", async () => {
    const { spot, unedited } = await openSpotForEditing();

    const result = await manager.saveSpot(spot, unedited);
    expect(result.editId).toBeNull();
  }, timeoutMs);
});

/** Shape an Admin SDK snapshot like the client SDK delivers it to the app. */
function toClientSchema(data: admin.firestore.DocumentData): SpotSchema {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      value instanceof admin.firestore.GeoPoint
        ? { latitude: value.latitude, longitude: value.longitude }
        : value,
    ),
  ) as SpotSchema;
}
