import { TestBed } from "@angular/core/testing";
import {
  FirebaseApp,
  deleteApp,
  initializeApp,
} from "firebase/app";
import {
  Auth,
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import {
  Firestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  initializeFirestore,
  memoryLocalCache,
  setDoc,
} from "firebase/firestore";
import {
  Functions,
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import * as admin from "firebase-admin";
import { BehaviorSubject, Observable } from "rxjs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  CancelEventRegistrationResponse,
  RegisterForEventResponse,
} from "../../../../db/schemas/EventRegistrationSchema";
import { PlatformService } from "../../platform.service";
import { AuthenticationService } from "../authentication.service";
import { FirebaseAppCheckService } from "../app-check.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import {
  FIREBASE_APP,
  FIREBASE_FIRESTORE,
  FIREBASE_FUNCTIONS,
} from "../firebase-client.providers";
import { EventRegistrationsService } from "./event-registrations.service";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const functionsHost =
  process.env["FUNCTIONS_EMULATOR_HOST"] || "127.0.0.1:5001";
const runWithEmulator = firestoreHost && authHost ? describe : describe.skip;
let adminApp: admin.app.App | undefined;

const adminDb = (): admin.firestore.Firestore => {
  adminApp ??= admin.initializeApp(
    { projectId: process.env["GCLOUD_PROJECT"] || "demo-pkspot" },
    "event-registration-emulator-admin",
  );
  return admin.firestore(adminApp);
};

const parseHostPort = (value: string): [string, number] => {
  const [host, portValue] = value.split(":");
  const port = Number(portValue);
  if (!host || !Number.isInteger(port)) {
    throw new Error(`Invalid emulator host: ${value}`);
  }
  return [host, port];
};

interface TestClient {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
  uid: string;
}

const createClient = async (name: string): Promise<TestClient> => {
  const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      authDomain: `${projectId}.firebaseapp.com`,
      projectId,
    },
    `${name}-${Date.now()}-${Math.random()}`,
  );
  const auth = getAuth(app);
  const [authEmulatorHost, authPort] = parseHostPort(authHost!);
  connectAuthEmulator(auth, `http://${authEmulatorHost}:${authPort}`, {
    disableWarnings: true,
  });
  const firestore = initializeFirestore(app, {
    localCache: memoryLocalCache(),
  });
  const [firestoreEmulatorHost, firestorePort] = parseHostPort(firestoreHost!);
  connectFirestoreEmulator(
    firestore,
    firestoreEmulatorHost,
    firestorePort,
  );
  const functions = getFunctions(app, "europe-west1");
  const [functionsEmulatorHost, functionsPort] = parseHostPort(functionsHost);
  connectFunctionsEmulator(
    functions,
    functionsEmulatorHost,
    functionsPort,
  );
  const credential = await signInAnonymously(auth);
  return {
    app,
    auth,
    firestore,
    functions,
    uid: credential.user.uid,
  };
};

const register = (client: TestClient, eventId: string) =>
  httpsCallable<{ eventId: string }, RegisterForEventResponse>(
    client.functions,
    "registerForEvent",
  )({ eventId });

const cancel = (client: TestClient, eventId: string) =>
  httpsCallable<{ eventId: string }, CancelEventRegistrationResponse>(
    client.functions,
    "cancelEventRegistration",
  )({ eventId });

const futureEvent = (
  ownerId: string,
  attendance: Record<string, unknown>,
): FirebaseFirestore.DocumentData => ({
  name: "Registration emulator event",
  venue_string: "Gym",
  locality_string: "Zurich",
  location: new admin.firestore.GeoPoint(47.37, 8.54),
  location_raw: { lat: 47.37, lng: 8.54 },
  start: admin.firestore.Timestamp.fromMillis(Date.now() + 86_400_000),
  end: admin.firestore.Timestamp.fromMillis(Date.now() + 90_000_000),
  publication_state: "published",
  published: true,
  visibility: "public",
  discoverability: { audience: "global" },
  owner: { type: "user", user_id: ownerId },
  lifecycle_status: "planned",
  attendance: {
    social: "rsvp",
    admission: "registration",
    ...attendance,
  },
});

const waitForAdminDocument = async (
  path: string,
  predicate: (data: FirebaseFirestore.DocumentData | undefined) => boolean,
): Promise<FirebaseFirestore.DocumentData | undefined> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const data = (await adminDb().doc(path).get()).data();
    if (predicate(data)) return data;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${path}`);
};

runWithEmulator("EventRegistrationsService emulator integration", () => {
  let app: FirebaseApp;
  let auth: Auth;
  let service: EventRegistrationsService;
  let primaryUid: string;
  const extraClients: TestClient[] = [];
  const authState$ = new BehaviorSubject<{ uid: string } | null>(null);

  beforeEach(async () => {
    const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
    const [firestoreEmulatorHost, firestorePort] = parseHostPort(firestoreHost!);
    const [authEmulatorHost, authPort] = parseHostPort(authHost!);
    const [functionsEmulatorHost, functionsPort] = parseHostPort(functionsHost);
    app = initializeApp(
      {
        apiKey: "demo-api-key",
        authDomain: `${projectId}.firebaseapp.com`,
        projectId,
      },
      `event-registration-primary-${Date.now()}-${Math.random()}`,
    );
    auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authEmulatorHost}:${authPort}`, {
      disableWarnings: true,
    });
    const firestore = initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
    connectFirestoreEmulator(firestore, firestoreEmulatorHost, firestorePort);
    const functions = getFunctions(app, "europe-west1");
    connectFunctionsEmulator(functions, functionsEmulatorHost, functionsPort);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        { provide: FIREBASE_APP, useValue: app },
        { provide: FIREBASE_FIRESTORE, useValue: firestore },
        { provide: FIREBASE_FUNCTIONS, useValue: functions },
        EventRegistrationsService,
        FirestoreAdapterService,
        FunctionsAdapterService,
        {
          provide: AuthenticationService,
          useValue: {
            user: { get uid() { return primaryUid; } },
            authState$: authState$ as Observable<{ uid: string } | null>,
          },
        },
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
          useValue: { initialize: () => Promise.resolve() },
        },
      ],
    }).compileComponents();

    const credential = await TestBed.runInInjectionContext(() =>
      signInAnonymously(auth),
    );
    primaryUid = credential.user.uid;
    authState$.next({ uid: primaryUid });
    service = TestBed.inject(EventRegistrationsService);
    await adminDb().doc(`users/${primaryUid}`).set({});
  });

  afterEach(async () => {
    authState$.next(null);
    for (const client of extraClients.splice(0)) {
      await signOut(client.auth).catch(() => undefined);
      await deleteApp(client.app).catch(() => undefined);
    }
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

  afterAll(async () => {
    await adminApp?.delete();
    adminApp = undefined;
  });

  it("registers, waitlists, and atomically promotes the oldest waiter", async () => {
    const eventId = `registration-${primaryUid}`;
    await adminDb()
      .doc(`events/${eventId}`)
      .set(futureEvent(primaryUid, { capacity: 1, waitlist: true }));
    const waiter = await createClient("event-registration-waiter");
    extraClients.push(waiter);
    await adminDb().doc(`users/${waiter.uid}`).set({});

    await expect(service.register(eventId)).resolves.toMatchObject({
      status: "registered",
      registered: 1,
      waitlisted: 0,
    });
    await expect(register(waiter, eventId)).resolves.toMatchObject({
      data: {
        status: "waitlisted",
        registered: 1,
        waitlisted: 1,
      },
    });
    await expect(
      setDoc(
        doc(waiter.firestore, `events/${eventId}/registrations/${waiter.uid}`),
        { status: "registered" },
      ),
    ).rejects.toBeTruthy();

    await expect(service.cancel(eventId)).resolves.toMatchObject({
      status: "cancelled",
      promotedUserId: waiter.uid,
      registered: 1,
      waitlisted: 0,
    });
    const promoted = (
      await adminDb()
        .doc(`events/${eventId}/registrations/${waiter.uid}`)
        .get()
    ).data();
    expect(promoted?.["status"]).toBe("registered");

    await expect(service.cancel(eventId, waiter.uid)).resolves.toMatchObject({
      status: "cancelled",
      registered: 0,
      waitlisted: 0,
    });
  });

  it("does not promote while reduced capacity is still met", async () => {
    const eventId = `reduced-capacity-${primaryUid}`;
    const remainingUid = "remaining-user";
    const waitingUid = "waiting-user";
    const now = admin.firestore.Timestamp.now();
    await adminDb()
      .doc(`events/${eventId}`)
      .set(futureEvent(primaryUid, { capacity: 1, waitlist: true }));
    await adminDb().doc(`events/${eventId}/admission/state`).set({
      registered: 2,
      waitlisted: 1,
      time_updated: now,
    });
    await Promise.all(
      [
        [primaryUid, "registered"],
        [remainingUid, "registered"],
        [waitingUid, "waitlisted"],
      ].map(([uid, status]) =>
        adminDb()
          .doc(`events/${eventId}/registrations/${uid}`)
          .set({
            user_id: uid,
            event_id: eventId,
            status,
            time_created: now,
            time_updated: now,
            ...(status === "waitlisted" ? { waitlisted_at: now } : {}),
          }),
      ),
    );

    await expect(service.cancel(eventId)).resolves.toMatchObject({
      registered: 1,
      waitlisted: 1,
    });
    const waiting = (
      await adminDb()
        .doc(`events/${eventId}/registrations/${waitingUid}`)
        .get()
    ).data();
    expect(waiting?.["status"]).toBe("waitlisted");

    await adminDb().doc(`events/${eventId}`).update({
      "attendance.capacity": 2,
    });
    await waitForAdminDocument(
      `events/${eventId}/registrations/${waitingUid}`,
      (data) => data?.["status"] === "registered",
    );
    const reconciledState = (
      await adminDb().doc(`events/${eventId}/admission/state`).get()
    ).data();
    expect(reconciledState).toMatchObject({ registered: 2, waitlisted: 0 });
  });

  it("enforces organization-member attendance eligibility", async () => {
    const eventId = `member-event-${primaryUid}`;
    await adminDb()
      .doc(`events/${eventId}`)
      .set(
        futureEvent("different-owner", {
          eligibility: {
            type: "organization_members",
            organization_id: "club-1",
          },
        }),
      );

    await expect(service.register(eventId)).rejects.toBeTruthy();
    await adminDb()
      .doc(`organizations/club-1/members/${primaryUid}`)
      .set({ role: "member" });

    await expect(service.register(eventId)).resolves.toMatchObject({
      status: "registered",
    });
  });

  it("does not expose another attendee's registration document", async () => {
    const eventId = `private-registration-${primaryUid}`;
    const other = await createClient("event-registration-private");
    extraClients.push(other);
    await adminDb()
      .doc(`events/${eventId}`)
      .set(futureEvent(primaryUid, {}));
    await adminDb()
      .doc(`events/${eventId}/registrations/${primaryUid}`)
      .set({
        user_id: primaryUid,
        event_id: eventId,
        status: "registered",
        time_created: admin.firestore.Timestamp.now(),
        time_updated: admin.firestore.Timestamp.now(),
      });

    await expect(
      getDoc(
        doc(
          other.firestore,
          `events/${eventId}/registrations/${primaryUid}`,
        ),
      ),
    ).rejects.toBeTruthy();
  });
});
