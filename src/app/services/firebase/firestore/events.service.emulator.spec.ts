import { inject } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  FirebaseApp,
  deleteApp,
  initializeApp,
  provideFirebaseApp,
} from "@angular/fire/app";
import {
  Auth,
  connectAuthEmulator,
  getAuth,
  provideAuth,
  signInAnonymously,
  signOut,
} from "@angular/fire/auth";
import {
  Firestore,
  Timestamp,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  provideFirestore,
} from "@angular/fire/firestore";
import * as admin from "firebase-admin";
import { BehaviorSubject, Observable } from "rxjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnalyticsService } from "../../analytics.service";
import { AssetUrlService } from "../../asset-url.service";
import { ConsentService } from "../../consent.service";
import { PlatformService } from "../../platform.service";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { EventsService } from "./events.service";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const runWithEmulator = firestoreHost && authHost ? describe : describe.skip;
const rsvpIntegrationTimeoutMs = 45_000;
const eventTypesenseIntegrationTimeoutMs = 20_000;
let adminApp: admin.app.App | undefined;

function adminDb(): admin.firestore.Firestore {
  if (!adminApp) {
    adminApp = admin.initializeApp({
      projectId: process.env["GCLOUD_PROJECT"] || "demo-pkspot",
    });
  }
  return admin.firestore(adminApp);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForRsvpCounts(
  eventId: string,
  expected: {
    going: number;
    interested: number;
    notgoing: number;
    total: number;
  },
): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const snapshot = await adminDb().doc(`events/${eventId}`).get();
    const counts = snapshot.data()?.["rsvp_counts"];
    if (
      counts?.going === expected.going &&
      counts?.interested === expected.interested &&
      counts?.notgoing === expected.notgoing &&
      counts?.total === expected.total
    ) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for RSVP counts on events/${eventId}`);
}

async function waitForEventTypesenseFields(eventId: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const snapshot = await adminDb().doc(`events/${eventId}`).get();
    const data = snapshot.data();
    if (
      data?.["start_seconds"] === 1_780_311_600 &&
      data?.["end_seconds"] === 1_780_318_800 &&
      data?.["promo_starts_at_seconds"] === 1_779_793_200 &&
      data?.["bounds_radius_m"] > 0 &&
      data?.["promo_region_radius_m"] === 150_000 &&
      data?.["location"] instanceof admin.firestore.GeoPoint &&
      data?.["bounds_center"] instanceof admin.firestore.GeoPoint &&
      data?.["promo_region_center"] instanceof admin.firestore.GeoPoint &&
      data?.["start"] instanceof admin.firestore.Timestamp &&
      data?.["end"] instanceof admin.firestore.Timestamp &&
      data?.["promo_starts_at"] instanceof admin.firestore.Timestamp &&
      data?.["has_organization"] === true &&
      data?.["has_venue_spot"] === true &&
      data?.["venue_spot_count"] === 2
    ) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for event helper fields on events/${eventId}`);
}

async function waitForNoAreaEventBounds(eventId: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const snapshot = await adminDb().doc(`events/${eventId}`).get();
    const data = snapshot.data();
    if (
      data?.["bounds_radius_m"] > 0 &&
      data?.["bounds_center"] instanceof admin.firestore.GeoPoint &&
      data?.["bounds"]?.north === 47.2418983544606 &&
      data?.["bounds"]?.south === 47.2395741198416 &&
      data?.["bounds"]?.east === 8.73119948180532 &&
      data?.["bounds"]?.west === 8.729841149520867
    ) {
      return;
    }
    await sleep(250);
  }
  throw new Error(
    `Timed out waiting for no-area event bounds on events/${eventId}`,
  );
}

function parseHostPort(value: string): [string, number] {
  const [host, portValue] = value.split(":");
  const port = Number(portValue);
  if (!host || !Number.isInteger(port)) {
    throw new Error(`Invalid emulator host: ${value}`);
  }
  return [host, port];
}

runWithEmulator("EventsService emulator integration", () => {
  let app: FirebaseApp;
  let service: EventsService;
  let auth: Auth;
  let firestore: Firestore;
  const authState$ = new BehaviorSubject<{ uid: string } | null>(null);
  const authService = {
    user: { uid: null as string | null, data: { isAdmin: false } },
    authState$: authState$ as Observable<{ uid: string } | null>,
  };

  beforeEach(async () => {
    const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
    const appName = `events-service-emulator-${Date.now()}-${Math.random()}`;
    const [firestoreEmulatorHost, firestorePort] = parseHostPort(firestoreHost!);
    const [authEmulatorHost, authPort] = parseHostPort(authHost!);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        provideFirebaseApp(() => {
          app = initializeApp(
            {
              apiKey: "demo-api-key",
              authDomain: `${projectId}.firebaseapp.com`,
              projectId,
            },
            appName,
          );
          return app;
        }),
        provideAuth(() => {
          const instance = getAuth(inject(FirebaseApp));
          connectAuthEmulator(
            instance,
            `http://${authEmulatorHost}:${authPort}`,
            { disableWarnings: true },
          );
          return instance;
        }),
        provideFirestore(() => {
          const firebaseApp = inject(FirebaseApp);
          let instance: Firestore;
          try {
            instance = initializeFirestore(firebaseApp, {
              localCache: memoryLocalCache(),
            });
          } catch {
            instance = getFirestore(firebaseApp);
          }
          connectFirestoreEmulator(
            instance,
            firestoreEmulatorHost,
            firestorePort,
          );
          return instance;
        }),
        EventsService,
        FirestoreAdapterService,
        {
          provide: AuthenticationService,
          useValue: authService,
        },
        {
          provide: AssetUrlService,
          useValue: { resolveEventAssetUrls: (event: unknown) => event },
        },
        {
          provide: ConsentService,
          useValue: {
            hasConsent: () => true,
            executeWithConsent: (fn: () => unknown) => Promise.resolve(fn()),
            executeWhenConsent: (fn: () => unknown) => Promise.resolve(fn()),
            consentGranted$: new BehaviorSubject(true).asObservable(),
            isSSR: () => false,
            isBrowser: () => true,
          },
        },
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
      ],
    }).compileComponents();

    auth = TestBed.inject(Auth);
    firestore = TestBed.inject(Firestore);
    const credential = await TestBed.runInInjectionContext(() =>
      signInAnonymously(auth),
    );
    authService.user.uid = credential.user.uid;
    authState$.next({ uid: credential.user.uid });
    service = TestBed.inject(EventsService);
  });

  afterEach(async () => {
    authState$.next(null);
    authService.user.uid = null;
    if (auth) {
      await TestBed.runInInjectionContext(() => signOut(auth)).catch(
        () => undefined,
      );
    }
    if (app) {
      await TestBed.runInInjectionContext(() => deleteApp(app)).catch(
        () => undefined,
      );
    }
    TestBed.resetTestingModule();
  });

  it("writes, updates, and aggregates my RSVP through the real web Firestore adapter", async () => {
    const uid = authService.user.uid;
    expect(uid).toBeTruthy();
    const eventId = `rsvp-emulator-${uid}`;
    const rsvpPath = `events/${eventId}/rsvps/${uid}`;
    await adminDb()
      .doc(`events/${eventId}`)
      .set({
        name: "RSVP emulator event",
        location_raw: { lat: 47.3769, lng: 8.5417 },
        start: admin.firestore.Timestamp.fromDate(
          new Date("2026-06-01T10:00:00.000Z"),
        ),
        end: admin.firestore.Timestamp.fromDate(
          new Date("2026-06-01T12:00:00.000Z"),
        ),
      });

    await service.setMyRsvp(eventId, "going");

    const created = await TestBed.runInInjectionContext(() =>
      getDoc(doc(firestore, rsvpPath)),
    );
    expect(created.exists()).toBe(true);
    expect(created.data()).toEqual(
      expect.objectContaining({
        user_id: uid,
        event_id: eventId,
        rsvp: "going",
      }),
    );
    expect(created.data()?.["time_created"]?.toDate()).toBeInstanceOf(Date);
    expect(created.data()?.["time_updated"]?.toDate()).toBeInstanceOf(Date);
    await waitForRsvpCounts(eventId, {
      going: 1,
      interested: 0,
      notgoing: 0,
      total: 1,
    });

    await service.setMyRsvp(eventId, "interested");

    const updated = await TestBed.runInInjectionContext(() =>
      getDoc(doc(firestore, rsvpPath)),
    );
    expect(updated.data()).toEqual(
      expect.objectContaining({
        user_id: uid,
        event_id: eventId,
        rsvp: "interested",
      }),
    );
    expect(updated.data()?.["time_created"]?.toDate()).toBeInstanceOf(Date);
    expect(updated.data()?.["time_updated"]?.toDate()).toBeInstanceOf(Date);
    await waitForRsvpCounts(eventId, {
      going: 0,
      interested: 1,
      notgoing: 0,
      total: 1,
    });
  }, rsvpIntegrationTimeoutMs);

  it("updates event edit fields through the real web Firestore adapter", async () => {
    const uid = authService.user.uid;
    expect(uid).toBeTruthy();
    authService.user.data.isAdmin = true;
    await adminDb().doc(`users/${uid}`).set({ is_admin: true });

    const eventId = `event-edit-emulator-${uid}`;
    await adminDb()
      .doc(`events/${eventId}`)
      .set({
        name: "Editable emulator event",
        venue_string: "Old venue",
        locality_string: "Zurich, Switzerland",
        location_raw: { lat: 47.3769, lng: 8.5417 },
        start: admin.firestore.Timestamp.fromDate(
          new Date("2026-06-01T10:00:00.000Z"),
        ),
        end: admin.firestore.Timestamp.fromDate(
          new Date("2026-06-01T12:00:00.000Z"),
        ),
      });

    await service.updateEvent(eventId, {
      name: "Updated emulator event",
      venue_string: "New venue",
      locality_string: "Zurich, Switzerland",
      location_raw: { lat: 47.4, lng: 8.5 },
      start: Timestamp.fromDate(new Date("2026-06-02T10:00:00.000Z")),
      end: Timestamp.fromDate(new Date("2026-06-02T12:00:00.000Z")),
      area_polygon: [
        {
          area_name: "Main area",
          points: [
            { lat: 47.45, lng: 8.5 },
            { lat: 47.45, lng: 8.6 },
            { lat: 47.35, lng: 8.6 },
            { lat: 47.35, lng: 8.5 },
          ],
        },
      ],
      custom_markers: [
        {
          name: "Camp",
          location: { lat: 47.4, lng: 8.5 },
          icons: ["camping"],
        },
      ],
    });

    const snapshot = await adminDb().doc(`events/${eventId}`).get();
    const data = snapshot.data();

    expect(data).toEqual(
      expect.objectContaining({
        name: "Updated emulator event",
        venue_string: "New venue",
        location_raw: { lat: 47.4, lng: 8.5 },
      }),
    );
    expect(data?.["start"]).toBeInstanceOf(admin.firestore.Timestamp);
    expect(data?.["end"]).toBeInstanceOf(admin.firestore.Timestamp);
    expect(data?.["time_updated"]).toBeInstanceOf(admin.firestore.Timestamp);
    expect(data?.["area_polygon"]).toEqual([
      {
        area_name: "Main area",
        points: [
          { lat: 47.45, lng: 8.5 },
          { lat: 47.45, lng: 8.6 },
          { lat: 47.35, lng: 8.6 },
          { lat: 47.35, lng: 8.5 },
        ],
      },
    ]);
  });

  it("normalizes event Typesense helper fields to Firestore runtime types", async () => {
    const eventId = `typesense-contract-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    await adminDb()
      .doc(`events/${eventId}`)
      .set({
        name: "Typesense contract event",
        venue_string: "Contract venue",
        locality_string: "Zurich, Switzerland",
        location: { latitude: 47.39732893509323, longitude: 8.548509576285669 },
        location_raw: { lat: 47.39732893509323, lng: 8.548509576285669 },
        start: { seconds: 1_780_311_600, nanoseconds: 0 },
        end: { seconds: 1_780_318_800, nanoseconds: 0 },
        promo_starts_at: { seconds: 1_779_793_200, nanoseconds: 0 },
        area_polygon: [
          {
            points: [
              { lat: 0, lng: -90 },
              { lat: 0, lng: 90 },
              { lat: 90, lng: -90 },
              { lat: 90, lng: 90 },
            ],
          },
          {
            area_name: "Main area",
            points: [
              { lat: 47.45, lng: 8.5 },
              { lat: 47.45, lng: 8.6 },
              { lat: 47.35, lng: 8.6 },
              { lat: 47.35, lng: 8.5 },
            ],
          },
        ],
        promo_region: {
          center: { lat: 46.8, lng: 8.2 },
          radius_m: 150_000,
        },
        organizer: {
          type: "organization",
          organization: {
            id: "org-a",
            name: "Organization A",
            slug: "org-a",
          },
        },
        spot_ids: ["spot-a", "spot-a"],
        inline_spots: [
          {
            id: "inline-a",
            name: "Inline venue spot",
            location: { lat: 47.4, lng: 8.55 },
          },
        ],
      });

    await waitForEventTypesenseFields(eventId);

    const snapshot = await adminDb().doc(`events/${eventId}`).get();
    const data = snapshot.data();

    expect(data?.["location"]).toBeInstanceOf(admin.firestore.GeoPoint);
    expect(data?.["bounds_center"]).toBeInstanceOf(admin.firestore.GeoPoint);
    expect(data?.["bounds_center"].latitude).toBeCloseTo(47.4, 6);
    expect(data?.["bounds_center"].longitude).toBeCloseTo(8.55, 6);
    expect(data?.["bounds"]).toEqual({
      north: 47.45,
      south: 47.35,
      east: 8.6,
      west: 8.5,
    });
    expect(data?.["promo_region_center"]).toBeInstanceOf(
      admin.firestore.GeoPoint,
    );
    expect(data?.["promo_region_center"].latitude).toBeCloseTo(46.8, 6);
    expect(data?.["promo_region_center"].longitude).toBeCloseTo(8.2, 6);
    expect(data?.["start"]).toBeInstanceOf(admin.firestore.Timestamp);
    expect(data?.["end"]).toBeInstanceOf(admin.firestore.Timestamp);
    expect(data?.["promo_starts_at"]).toBeInstanceOf(
      admin.firestore.Timestamp,
    );
    expect(data).toEqual(
      expect.objectContaining({
        start_seconds: 1_780_311_600,
        end_seconds: 1_780_318_800,
        promo_starts_at_seconds: 1_779_793_200,
        bounds_radius_m: expect.any(Number),
        promo_region_radius_m: 150_000,
        has_organization: true,
        has_venue_spot: true,
        venue_spot_count: 2,
        location_raw: {
          lat: 47.39732893509323,
          lng: 8.548509576285669,
        },
      }),
    );
  }, eventTypesenseIntegrationTimeoutMs);

  it("derives Typesense bounds from custom markers when an event has no area or spots", async () => {
    const eventId = `typesense-no-area-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    await adminDb()
      .doc(`events/${eventId}`)
      .set({
        name: "No area event",
        venue_string: "Pausenplatz Kirchbuhl",
        locality_string: "Stafa, Switzerland",
        location: { latitude: 47.23957411984155, longitude: 8.729841149520867 },
        location_raw: { lat: 47.23957411984155, lng: 8.729841149520867 },
        start: { seconds: 1_781_942_400, nanoseconds: 0 },
        end: { seconds: 1_782_054_000, nanoseconds: 0 },
        custom_markers: [
          {
            priority: "required",
            name: "Pausenplatz Kirchbuhl",
            location: {
              lat: 47.2395741198416,
              lng: 8.729841149520867,
            },
            color: "secondary",
            icons: ["trophy"],
          },
          {
            priority: "required",
            name: "Turnhalle Obstgarten",
            location: {
              lat: 47.2418983544606,
              lng: 8.73119948180532,
            },
            color: "tertiary",
            icons: ["home", "trophy"],
          },
        ],
      });

    await waitForNoAreaEventBounds(eventId);

    const snapshot = await adminDb().doc(`events/${eventId}`).get();
    const data = snapshot.data();

    expect(data?.["bounds_center"]).toBeInstanceOf(admin.firestore.GeoPoint);
    expect(data?.["bounds_center"].latitude).toBeCloseTo(
      (47.2418983544606 + 47.2395741198416) / 2,
      6,
    );
    expect(data?.["bounds_center"].longitude).toBeCloseTo(
      (8.73119948180532 + 8.729841149520867) / 2,
      6,
    );
    expect(data).toEqual(
      expect.objectContaining({
        bounds: {
          north: 47.2418983544606,
          south: 47.2395741198416,
          east: 8.73119948180532,
          west: 8.729841149520867,
        },
        bounds_radius_m: expect.any(Number),
      }),
    );
  }, eventTypesenseIntegrationTimeoutMs);
});
