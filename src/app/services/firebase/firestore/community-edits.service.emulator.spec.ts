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
import { BehaviorSubject, Observable } from "rxjs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlatformService } from "../../platform.service";
import { AuthenticationService } from "../authentication.service";
import { FirebaseAppCheckService } from "../app-check.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { CommunityEditsService } from "./community-edits.service";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const functionsHost =
  process.env["FUNCTIONS_EMULATOR_HOST"] || "127.0.0.1:5001";
const runWithEmulator = firestoreHost && authHost ? describe : describe.skip;
const integrationTimeoutMs = 90_000;
let adminApp: admin.app.App | undefined;

function adminDb(): admin.firestore.Firestore {
  if (!adminApp) {
    adminApp = admin.initializeApp(
      { projectId: process.env["GCLOUD_PROJECT"] || "demo-pkspot" },
      "community-edits-emulator-admin",
    );
  }
  return admin.firestore(adminApp);
}

function parseHostPort(value: string): [string, number] {
  const [host, portValue] = value.split(":");
  const port = Number(portValue);
  if (!host || !Number.isInteger(port)) {
    throw new Error(`Invalid emulator host: ${value}`);
  }
  return [host, port];
}

runWithEmulator("CommunityEditsService emulator integration", () => {
  let app: FirebaseApp;
  let auth: Auth;
  let service: CommunityEditsService;
  let functionsAdapter: FunctionsAdapterService;
  const authState$ = new BehaviorSubject<{
    uid: string;
    data?: { displayName: string };
  } | null>(null);

  beforeEach(async () => {
    const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
    const appName = `community-edits-${Date.now()}-${Math.random()}`;
    const [firestoreEmulatorHost, firestorePort] = parseHostPort(firestoreHost!);
    const [authEmulatorHost, authPort] = parseHostPort(authHost!);
    const [functionsEmulatorHost, functionsPort] = parseHostPort(functionsHost!);

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
        provideFunctions(() => {
          const instance = getFunctions(inject(FirebaseApp), "europe-west1");
          connectFunctionsEmulator(
            instance,
            functionsEmulatorHost,
            functionsPort,
          );
          return instance;
        }),
        CommunityEditsService,
        FirestoreAdapterService,
        FunctionsAdapterService,
        {
          provide: AuthenticationService,
          useValue: {
            authState$: authState$ as Observable<{
              uid: string;
              data?: { displayName: string };
            } | null>,
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

    auth = TestBed.inject(Auth);
    const credential = await TestBed.runInInjectionContext(() =>
      signInAnonymously(auth),
    );
    authState$.next({
      uid: credential.user.uid,
      data: { displayName: "Community Editor" },
    });
    service = TestBed.inject(CommunityEditsService);
    functionsAdapter = TestBed.inject(FunctionsAdapterService);
  });

  afterEach(async () => {
    authState$.next(null);
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

  it("submits and approves knowledge through the real client, rules, and callable", async () => {
    const uid = auth.currentUser?.uid;
    expect(uid).toBeTruthy();
    const communityKey = `community-edit-${uid}`;
    await adminDb().doc(`community_pages/${communityKey}`).set({
      communityKey,
      displayName: "Emulator Community",
      infoCards: [],
    });

    const editId = await service.submitKnowledgeSuggestion({
      communityKey,
      communityDisplayName: "Emulator Community",
      communityPath: "/map/communities/emulator-community",
      card: {
        id: "community-chat",
        title: { en: "Community chat" },
        category: "chat",
        cta: {
          target: "url",
          label: { en: "Join chat" },
          url: "https://example.com/community-chat",
        },
      },
    });

    const editPath = `community_pages/${communityKey}/edits/${editId}`;
    const submittedEdit = (await adminDb().doc(editPath).get()).data();
    expect(submittedEdit).toEqual(
      expect.objectContaining({
        target_type: "community",
        target_id: communityKey,
        schema_version: 1,
        status: "pending",
        approved: false,
        visibility: "private",
        user: expect.objectContaining({ uid }),
      }),
    );
    expect(submittedEdit?.["timestamp"]).toBeInstanceOf(admin.firestore.Timestamp);

    await adminDb().doc(`users/${uid}`).set({
      is_admin: true,
      display_name: "Community Admin",
    });
    const pending = await service.getPendingKnowledgeEdits(100);
    const edit = pending.find(
      (candidate) =>
        candidate.id === editId && candidate.target_id === communityKey,
    );
    expect(edit).toBeDefined();
    await service.approveEdit(edit!);

    const [pageSnap, privateSnap, approvedEditSnap] = await Promise.all([
      adminDb().doc(`community_pages/${communityKey}`).get(),
      adminDb()
        .doc(`community_pages/${communityKey}/private_info/link_cards`)
        .get(),
      adminDb().doc(editPath).get(),
    ]);
    const publicCard = pageSnap.data()?.["infoCards"]?.[0];
    const privateCard = privateSnap.data()?.["infoCards"]?.[0];
    expect(publicCard).toEqual(
      expect.objectContaining({
        id: "community-chat",
        ctaVisibility: "signed-in",
      }),
    );
    expect(publicCard?.cta).toBeUndefined();
    expect(privateCard?.cta?.url).toBe("https://example.com/community-chat");
    expect(approvedEditSnap.data()).toEqual(
      expect.objectContaining({
        status: "approved",
        approved: true,
        visibility: "public",
        processing_status: "APPROVED_ADMIN_REVIEW",
        prevData: { card: null },
      }),
    );
  }, integrationTimeoutMs);

  it("records admin-authored knowledge replacements as approved edits", async () => {
    const uid = auth.currentUser?.uid;
    expect(uid).toBeTruthy();
    const communityKey = `community-admin-edit-${uid}`;
    await Promise.all([
      adminDb().doc(`users/${uid}`).set({
        is_admin: true,
        display_name: "Community Admin",
      }),
      adminDb().doc(`community_pages/${communityKey}`).set({
        communityKey,
        displayName: "Admin Community",
        infoCards: [{ id: "old", title: { en: "Old card" } }],
      }),
    ]);

    const editId = await service.saveKnowledgeCards({
      communityKey,
      communityDisplayName: "Admin Community",
      cards: [{ id: "new", title: { en: "New card" }, category: "jams" }],
    });

    const [pageSnap, editSnap] = await Promise.all([
      adminDb().doc(`community_pages/${communityKey}`).get(),
      adminDb().doc(`community_pages/${communityKey}/edits/${editId}`).get(),
    ]);
    expect(pageSnap.data()?.["infoCards"]).toEqual([
      { id: "new", title: { en: "New card" }, category: "jams" },
    ]);
    expect(editSnap.data()).toEqual(
      expect.objectContaining({
        operation: "REPLACE_KNOWLEDGE_CARDS",
        status: "approved",
        target_type: "community",
        prevData: {
          cards: [{ id: "old", title: { en: "Old card" } }],
        },
      }),
    );
  }, integrationTimeoutMs);

  it("backfills edit targets and migrates legacy community suggestions", async () => {
    const uid = auth.currentUser?.uid;
    expect(uid).toBeTruthy();
    const suffix = `${uid}-${Date.now()}`;
    const spotId = `legacy-spot-${suffix}`;
    const eventId = `legacy-event-${suffix}`;
    const communityKey = `legacy-community-${suffix}`;
    const legacySuggestionId = `legacy-suggestion-${suffix}`;
    const timestamp = admin.firestore.Timestamp.now();
    await adminDb().doc(`spots/${spotId}`).set({
      name: { en: "Legacy spot" },
      description: { en: "Before migration" },
    });
    await Promise.all([
      adminDb().doc(`users/${uid}`).set({ is_admin: true }),
      adminDb().doc(`spots/${spotId}/edits/edit-1`).set({
        type: "UPDATE",
        timestamp,
        timestamp_raw_ms: timestamp.toMillis(),
        approved: false,
        user: { uid, display_name: "Legacy Editor" },
        data: { description: { en: "After migration" } },
      }),
      adminDb().doc(`events/${eventId}/edits/edit-1`).set({
        type: "UPDATE",
        approved: true,
      }),
      adminDb().doc(`events/${eventId}/edits/version-2`).set({
        target_type: "event",
        target_id: eventId,
        schema_version: 2,
        type: "UPDATE",
        approved: true,
      }),
      adminDb().doc(`community_pages/${communityKey}`).set({
        communityKey,
        displayName: "Legacy Community",
      }),
      adminDb().doc(`community_pages/${communityKey}/edits/edit-1`).set({
        type: "UPDATE",
        approved: true,
      }),
      adminDb().doc(`community_card_suggestions/${legacySuggestionId}`).set({
        community_key: communityKey,
        community_display_name: "Legacy Community",
        status: "pending",
        created_by: { uid, display_name: "Legacy Editor" },
        created_at: timestamp,
        created_at_raw_ms: timestamp.toMillis(),
        card: {
          id: "legacy-card",
          title: { en: "Legacy card" },
        },
      }),
    ]);

    const result = await functionsAdapter.call<
      {
        dryRun: false;
        migrateLegacyCommunitySuggestions: true;
      },
      {
        ok: true;
        updatedEdits: number;
        migratedLegacySuggestions: number;
      }
    >("backfillEditTargetMetadata", {
      dryRun: false,
      migrateLegacyCommunitySuggestions: true,
    });

    expect(result.ok).toBe(true);
    expect(result.updatedEdits).toBeGreaterThanOrEqual(2);
    expect(result.migratedLegacySuggestions).toBeGreaterThanOrEqual(1);
    const [spotEdit, eventEdit, versionedEdit, communityEdit, migratedSuggestion] =
      await Promise.all([
        adminDb().doc(`spots/${spotId}/edits/edit-1`).get(),
        adminDb().doc(`events/${eventId}/edits/edit-1`).get(),
        adminDb().doc(`events/${eventId}/edits/version-2`).get(),
        adminDb().doc(`community_pages/${communityKey}/edits/edit-1`).get(),
        adminDb()
          .doc(
            `community_pages/${communityKey}/edits/${legacySuggestionId}`,
          )
          .get(),
      ]);
    expect(spotEdit.data()).toEqual(
      expect.objectContaining({ target_type: "spot", target_id: spotId }),
    );
    expect(eventEdit.data()).toEqual(
      expect.objectContaining({ target_type: "event", target_id: eventId }),
    );
    expect(versionedEdit.data()?.["schema_version"]).toBe(2);
    expect(communityEdit.data()).toEqual(
      expect.objectContaining({
        target_type: "community",
        target_id: communityKey,
      }),
    );
    expect(migratedSuggestion.data()).toEqual(
      expect.objectContaining({
        target_type: "community",
        target_id: communityKey,
        status: "pending",
        legacy_source: {
          collection: "community_card_suggestions",
          id: legacySuggestionId,
        },
      }),
    );
  }, integrationTimeoutMs);
});
