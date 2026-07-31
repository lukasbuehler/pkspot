import { inject, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FirebaseApp, deleteApp, initializeApp, provideFirebaseApp } from "@angular/fire/app";
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
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  provideFirestore,
} from "@angular/fire/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
  provideFunctions,
} from "@angular/fire/functions";
import * as admin from "firebase-admin";
import { BehaviorSubject, firstValueFrom, take } from "rxjs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlatformService } from "../../platform.service";
import { FirebaseAppCheckService } from "../app-check.service";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { EventLiveUpdatesService } from "./event-live-updates.service";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const functionsHost = process.env["FUNCTIONS_EMULATOR_HOST"] || "127.0.0.1:5001";
const runWithEmulator = firestoreHost && authHost ? describe : describe.skip;
const timeoutMs = 90_000;
let adminApp: admin.app.App | undefined;

function db(): admin.firestore.Firestore {
  adminApp ??= admin.initializeApp(
    { projectId: process.env["GCLOUD_PROJECT"] || "demo-pkspot" },
    `live-update-admin-${Date.now()}`,
  );
  return admin.firestore(adminApp);
}

function parseHostPort(value: string): [string, number] {
  const [host, rawPort] = value.split(":");
  const port = Number(rawPort);
  if (!host || !Number.isInteger(port)) throw new Error(`Invalid emulator host: ${value}`);
  return [host, port];
}

async function waitForDocument(
  path: string,
  predicate: (data: admin.firestore.DocumentData) => boolean = () => true,
): Promise<admin.firestore.DocumentData> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const snapshot = await db().doc(path).get();
    if (snapshot.exists && predicate(snapshot.data()!)) return snapshot.data()!;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

runWithEmulator("EventLiveUpdatesService emulator integration", () => {
  let app: FirebaseApp;
  let auth: Auth;
  let service: EventLiveUpdatesService;
  let userId = "";
  const authState$ = new BehaviorSubject<{ uid: string } | null>(null);
  const authService = {
    user: { uid: "" },
    authState$,
    isAdmin: signal(false),
  };

  beforeEach(async () => {
    const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
    const [firestoreEmulatorHost, firestorePort] = parseHostPort(firestoreHost!);
    const [authEmulatorHost, authPort] = parseHostPort(authHost!);
    const [functionsEmulatorHost, functionsPort] = parseHostPort(functionsHost);
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        provideFirebaseApp(() => {
          app = initializeApp(
            { apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId },
            `live-update-client-${Date.now()}-${Math.random()}`,
          );
          return app;
        }),
        provideAuth(() => {
          const instance = getAuth(inject(FirebaseApp));
          connectAuthEmulator(instance, `http://${authEmulatorHost}:${authPort}`, { disableWarnings: true });
          return instance;
        }),
        provideFirestore(() => {
          const firebaseApp = inject(FirebaseApp);
          let instance: Firestore;
          try {
            instance = initializeFirestore(firebaseApp, { localCache: memoryLocalCache() });
          } catch {
            instance = getFirestore(firebaseApp);
          }
          connectFirestoreEmulator(instance, firestoreEmulatorHost, firestorePort);
          return instance;
        }),
        provideFunctions(() => {
          const instance = getFunctions(inject(FirebaseApp), "europe-west1");
          connectFunctionsEmulator(instance, functionsEmulatorHost, functionsPort);
          return instance;
        }),
        EventLiveUpdatesService,
        FirestoreAdapterService,
        FunctionsAdapterService,
        { provide: AuthenticationService, useValue: authService },
        {
          provide: PlatformService,
          useValue: {
            isNative: () => false,
            isWeb: () => true,
            getPlatform: () => "web",
            getAppType: () => "web",
          },
        },
        { provide: FirebaseAppCheckService, useValue: { initialize: async () => undefined } },
      ],
    }).compileComponents();

    auth = TestBed.inject(Auth);
    const credential = await TestBed.runInInjectionContext(() => signInAnonymously(auth));
    userId = credential.user.uid;
    authService.user.uid = userId;
    authState$.next({ uid: userId });
    service = TestBed.inject(EventLiveUpdatesService);

    await Promise.all([
      db().doc(`users/${userId}`).set({ display_name: "Event Organizer", is_admin: false }),
      db().doc("organizations/live-org").set({ name: "Live Org", slug: "live-org", active: true }),
      db().doc("events/live-event").set({
        name: "Live Jam",
        slug: "live-jam",
        published: true,
        organizer: {
          type: "organization",
          organization: { id: "live-org", name: "Live Org", slug: "live-org" },
        },
        organizer_access: "edit",
        start: admin.firestore.Timestamp.fromMillis(Date.now() + 60_000),
        end: admin.firestore.Timestamp.fromMillis(Date.now() + 86_400_000),
        venue_string: "Main park",
        locality_string: "Zurich",
        location_raw: { lat: 47.37, lng: 8.54 },
        inline_spots: [{ id: "west", name: "West entrance", location: { lat: 47.37, lng: 8.54 } }],
      }),
    ]);
  });

  afterEach(async () => {
    authState$.next(null);
    authService.user.uid = "";
    await TestBed.runInInjectionContext(() => signOut(auth)).catch(() => undefined);
    await TestBed.runInInjectionContext(() => deleteApp(app)).catch(() => undefined);
    TestBed.resetTestingModule();
  });

  afterAll(async () => {
    await adminApp?.delete();
    adminApp = undefined;
  });

  it("rejects attendees, validates controlled fields, enforces cooldown, and fans out only to active subscribers", async () => {
    const request = {
      eventId: "live-event",
      type: "location_spot_change" as const,
      title: "Meet at the west entrance",
      message: "The main gate is closed.",
      eventSpotId: "west",
    };
    await expect(service.publish(request)).rejects.toThrow(/editing access|organizer/i);

    await db().doc(`organizations/live-org/members/${userId}`).set({
      role: "owner",
      user: { uid: userId, display_name: "Event Organizer" },
    });
    await expect(
      service.publish({ ...request, title: "x".repeat(81) }),
    ).rejects.toThrow(/80/);
    await expect(
      service.publish({ ...request, eventSpotId: "not-part-of-event" }),
    ).rejects.toThrow(/not part of this event/i);

    await Promise.all([
      db().doc(`events/live-event/live_update_subscribers/${userId}`).set({
        user_id: userId,
        active: true,
        subscribed_at: admin.firestore.Timestamp.now(),
        updated_at: admin.firestore.Timestamp.now(),
      }),
      db().doc("events/live-event/live_update_subscribers/inactive-user").set({
        user_id: "inactive-user",
        active: false,
        subscribed_at: admin.firestore.Timestamp.now(),
        updated_at: admin.firestore.Timestamp.now(),
      }),
    ]);

    const result = await service.publish(request);
    const update = await waitForDocument(`events/live-event/live_updates/${result.updateId}`);
    expect(update).toEqual(expect.objectContaining({
      created_by: userId,
      type: "location_spot_change",
      title: "Meet at the west entrance",
      status: "published",
    }));

    const intentId = `event_live_update_live-event_${result.updateId}_${userId}`;
    const intent = await waitForDocument(`notification_intents/${intentId}`);
    expect(intent).toEqual(expect.objectContaining({
      recipient_uid: userId,
      type: "event_update",
      payload: expect.objectContaining({ update_id: result.updateId }),
    }));
    expect(
      (await db().doc(`notification_intents/event_live_update_live-event_${result.updateId}_inactive-user`).get()).exists,
    ).toBe(false);

    await expect(service.publish(request)).rejects.toThrow(/wait a minute/i);
  }, timeoutMs);

  it("rejects publishing to a past event", async () => {
    await Promise.all([
      db().doc(`organizations/live-org/members/${userId}`).set({
        role: "admin",
        user: { uid: userId },
      }),
      db().doc("events/live-event").update({
        end: admin.firestore.Timestamp.fromMillis(Date.now() - 1_000),
      }),
    ]);
    await expect(
      service.publish({
        eventId: "live-event",
        type: "general_update",
        title: "Too late",
      }),
    ).rejects.toThrow(/past events/i);
  }, timeoutMs);

  it("atomically cancels an event, notifies an affected attendee, and invalidates reminders", async () => {
    const attendeeId = `affected-${userId}`;
    const start = admin.firestore.Timestamp.fromMillis(
      Date.now() + 4 * 60 * 60 * 1000,
    );
    await Promise.all([
      db().doc(`organizations/live-org/members/${userId}`).set({
        role: "admin",
        user: { uid: userId },
      }),
      db().doc("events/live-event").update({
        start,
        end: admin.firestore.Timestamp.fromMillis(start.toMillis() + 3_600_000),
        lifecycle_status: "planned",
        notification_policy: "all",
        organizer_access: "edit",
        owner: { type: "user", user_id: userId },
      }),
      db().doc(`users/${attendeeId}`).set({ display_name: "Affected attendee" }),
      db().doc(`users/${attendeeId}/private_data/main`).set({
        notification_preferences: { event_updates: true, event_reminders: true },
      }),
    ]);
    await db().doc(`events/live-event/rsvps/${attendeeId}`).set({
      user_id: attendeeId,
      event_id: "live-event",
      rsvp: "going",
      time_created: admin.firestore.Timestamp.now(),
      time_updated: admin.firestore.Timestamp.now(),
    });
    await waitForDocument(
      `notification_intents/event_reminder_live-event_${attendeeId}`,
      (data) => data["status"] === "pending",
    );

    const result = await service.applyOperationalChange({
      eventId: "live-event",
      operation: "cancel_event",
      reason: "Severe storm warning",
    });

    const cancelledEvent = await waitForDocument("events/live-event", (data) =>
      data["lifecycle_status"] === "cancelled",
    );
    expect(cancelledEvent["published"]).toBe(true);
    expect(cancelledEvent["lifecycle_update"]["note"]).toBe("Severe storm warning");
    const update = await waitForDocument(
      `events/live-event/live_updates/${result.operationId}`,
    );
    expect(update).toEqual(expect.objectContaining({
      operation_type: "cancel_event",
      type: "event_cancelled",
    }));
    await waitForDocument(
      `notification_intents/event_live_update_live-event_${result.operationId}_${attendeeId}`,
      (data) => data["status"] === "pending",
    );
    const reminder = await waitForDocument(
      `notification_intents/event_reminder_live-event_${attendeeId}`,
      (data) => data["status"] === "cancelled",
    );
    expect(reminder["failure_reason"]).toBe("event_cancelled");
  }, timeoutMs);

  it("creates and lists the current user's event notification subscriptions", async () => {
    await service.setNotificationLevel("live-event", "all");
    await db()
      .doc("events/live-event/live_update_subscribers/someone-else")
      .set({
        user_id: "someone-else",
        active: true,
        event_reminders: true,
        subscribed_at: admin.firestore.Timestamp.now(),
        updated_at: admin.firestore.Timestamp.now(),
      });

    await expect(
      firstValueFrom(service.observeCurrentUserSubscriptions().pipe(take(1))),
    ).resolves.toEqual([{ eventId: "live-event", level: "all" }]);
  }, timeoutMs);

  it("allows reminders for published events without an organizer", async () => {
    await db().doc("events/community-session").set({
      name: "Community session",
      slug: "community-session",
      published: true,
      notification_policy: "reminders",
      start: admin.firestore.Timestamp.fromMillis(Date.now() + 60_000),
      end: admin.firestore.Timestamp.fromMillis(Date.now() + 86_400_000),
      venue_string: "Main park",
      locality_string: "Zurich",
      location_raw: { lat: 47.37, lng: 8.54 },
    });

    await expect(
      service.ensureDefaultNotificationLevel(
        "community-session",
        "reminders",
      ),
    ).resolves.toBe(true);
    await expect(
      db()
        .doc(`events/community-session/live_update_subscribers/${userId}`)
        .get()
        .then((snapshot) => snapshot.data()),
    ).resolves.toEqual(
      expect.objectContaining({
        user_id: userId,
        active: false,
        event_reminders: true,
      }),
    );
  }, timeoutMs);
});
