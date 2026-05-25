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
  });
});
