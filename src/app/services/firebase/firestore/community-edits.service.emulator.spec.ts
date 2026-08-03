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
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
} from "firebase/functions";
import * as admin from "firebase-admin";
import { BehaviorSubject, Observable } from "rxjs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
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

async function waitForAdminDocument<T>(
  path: string,
  predicate: (data: FirebaseFirestore.DocumentData | undefined) => T | null,
  timeoutMs = 30_000,
): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await adminDb().doc(path).get();
    const match = predicate(snapshot.data());
    if (match !== null) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${path}`);
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
    app = initializeApp(
      {
        apiKey: "demo-api-key",
        authDomain: `${projectId}.firebaseapp.com`,
        projectId,
      },
      appName,
    );
    auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authEmulatorHost}:${authPort}`, {
      disableWarnings: true,
    });
    let firestore: Firestore;
    try {
      firestore = initializeFirestore(app, { localCache: memoryLocalCache() });
    } catch {
      firestore = getFirestore(app);
    }
    connectFirestoreEmulator(firestore, firestoreEmulatorHost, firestorePort);
    const functions = getFunctions(app, "europe-west1");
    connectFunctionsEmulator(functions, functionsEmulatorHost, functionsPort);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        { provide: FIREBASE_APP, useValue: app },
        { provide: FIREBASE_FIRESTORE, useValue: firestore },
        { provide: FIREBASE_FUNCTIONS, useValue: functions },
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

  it("merges and restores a locality that has no community page", async () => {
    const uid = auth.currentUser?.uid;
    expect(uid).toBeTruthy();
    const targetKey = "locality:dk:84:copenhagen";
    const sourceKey = "locality:dk:84:frederiksberg";
    const spotDocument = (
      locality: string,
      index: number,
      includeDerivedLanding = true,
    ) => ({
      name: { en: `${locality} spot ${index}` },
      address: {
        locality,
        localityLocal: locality,
        region: { code: "84", name: "Capital Region of Denmark" },
        country: { code: "DK", name: "Denmark", localName: "Danmark" },
      },
      ...(includeDerivedLanding
        ? {
            landing: {
              countryCode: "DK",
              countryNameEn: "Denmark",
              countrySlug: "denmark",
              regionCode: "84",
              regionName: "Capital Region of Denmark",
              regionSlug: "84",
              localityName: locality,
              localitySlug: locality.toLowerCase(),
              isDry: false,
              organizationVerified: false,
            },
          }
        : {}),
      location_raw: {
        lat:
          locality === "Frederiksberg"
            ? 55.68 + index / 10_000
            : 55.67 + index / 10_000,
        lng: locality === "Frederiksberg" ? 12.53 : 12.57,
      },
      type: "parkour park",
      access: "public",
      rating: 0,
      num_reviews: 0,
      media: [],
    });
    const writes: Promise<unknown>[] = [];
    for (let index = 0; index < 5; index += 1) {
      writes.push(
        adminDb().doc(`spots/dk-copenhagen-${uid}-${index}`).set(
          spotDocument("Copenhagen", index),
        ),
      );
    }
    for (let index = 0; index < 3; index += 1) {
      writes.push(
        adminDb().doc(`spots/dk-frederiksberg-${uid}-${index}`).set(
          spotDocument("Frederiksberg", index, false),
        ),
      );
    }
    await Promise.all(writes);
    await adminDb().doc(`community_pages/${targetKey}`).set({
      communityKey: targetKey,
      scope: "locality",
      displayName: "Copenhagen",
      preferredSlug: "copenhagen",
      allSlugs: ["copenhagen"],
      canonicalPath: "/map/communities/copenhagen",
      title: "Parkour in Copenhagen, Denmark | PK Spot Community",
      description: "Copenhagen community",
      geography: {
        countryCode: "DK",
        countryName: "Denmark",
        countrySlug: "denmark",
        regionCode: "84",
        regionName: "Capital Region of Denmark",
        regionSlug: "84",
        localityName: "Copenhagen",
        localitySlug: "copenhagen",
      },
      breadcrumbs: [
        { name: "Map", path: "/map" },
        { name: "Denmark", path: "/map/communities/denmark" },
        { name: "Copenhagen", path: "/map/communities/copenhagen" },
      ],
      relationships: { parentKeys: ["country:dk"], childKeys: [], relatedKeys: [] },
      counts: { totalSpots: 5, topRated: 0, dry: 0 },
      spots: [],
      topRatedSpots: [],
      drySpots: [],
      links: {},
      infoCards: [],
      resources: [],
      organisations: [],
      athletes: [],
      events: [],
      image: { type: "default", url: "assets/banner_1200x630.png" },
      published: true,
      bounds_center: [55.67, 12.57],
      bounds_radius_m: 1000,
    });

    await expect(
      functionsAdapter.call("getCommunityMergeAdminState", {
        targetCommunityKey: targetKey,
      }),
    ).rejects.toThrow();
    await adminDb().doc(`users/${uid}`).set({ is_admin: true });

    const state = await functionsAdapter.call<
      { targetCommunityKey: string },
      {
        candidates: { communityKey: string; spotCount: number }[];
        mergedLocalities: unknown[];
      }
    >("getCommunityMergeAdminState", { targetCommunityKey: targetKey });
    expect(state.candidates).toContainEqual(
      expect.objectContaining({ communityKey: sourceKey, spotCount: 3 }),
    );

    await functionsAdapter.call("mergeUnpublishedLocality", {
      sourceCommunityKey: sourceKey,
      targetCommunityKey: targetKey,
    });
    const [merge, sourcePage, targetPage, sourceSpot] = await Promise.all([
      adminDb().doc(`community_merges/${sourceKey}`).get(),
      adminDb().doc(`community_pages/${sourceKey}`).get(),
      adminDb().doc(`community_pages/${targetKey}`).get(),
      adminDb().doc(`spots/dk-frederiksberg-${uid}-0`).get(),
    ]);
    expect(merge.data()).toEqual(
      expect.objectContaining({
        source_origin: "unpublished_locality",
        target_community_key: targetKey,
      }),
    );
    expect(sourcePage.data()).toEqual(
      expect.objectContaining({
        published: false,
        redirect_to_community_key: targetKey,
      }),
    );
    expect(targetPage.data()?.["counts"]?.totalSpots).toBe(8);
    expect(sourceSpot.data()?.["address"]?.locality).toBe("Frederiksberg");

    await functionsAdapter.call("unmergeUnpublishedLocality", {
      sourceCommunityKey: sourceKey,
      targetCommunityKey: targetKey,
    });
    const [restoredMerge, restoredSource] = await Promise.all([
      adminDb().doc(`community_merges/${sourceKey}`).get(),
      adminDb().doc(`community_pages/${sourceKey}`).get(),
    ]);
    expect(restoredMerge.exists).toBe(false);
    expect(restoredSource.exists).toBe(false);
    const restoredTotalSpots = await waitForAdminDocument(
      `community_pages/${targetKey}`,
      (data) => (data?.["counts"]?.totalSpots === 5 ? 5 : null),
    );
    expect(restoredTotalSpots).toBe(5);
  }, 180_000);

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

  it("runs the edit metadata backfill from the Firestore maintenance sentinel", async () => {
    const uid = auth.currentUser?.uid;
    expect(uid).toBeTruthy();
    const eventId = `maintenance-backfill-${uid}-${Date.now()}`;
    const timestamp = admin.firestore.Timestamp.now();
    const editRef = adminDb().doc(`events/${eventId}/edits/edit-1`);
    const maintenanceRef = adminDb().doc(
      "maintenance/run-backfill-edit-target-metadata",
    );

    await maintenanceRef.delete();
    await adminDb().doc(`events/${eventId}`).set({
      name: { en: "Maintenance backfill event" },
    });
    await editRef.set({
      type: "UPDATE",
      timestamp,
      timestamp_raw_ms: timestamp.toMillis(),
      approved: false,
      user: { uid, display_name: "Legacy Editor" },
      data: { description: { en: "After migration" } },
    });

    await maintenanceRef.create({
      dry_run: false,
      migrate_legacy_community_suggestions: false,
    });

    const result = await waitForAdminDocument(
      maintenanceRef.path,
      (data) => {
        if (data?.["status"] === "ERROR") {
          throw new Error(String(data["error"] ?? "Maintenance backfill failed"));
        }
        return data?.["status"] === "DONE" ? data["result"] : null;
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        updated_edits: expect.any(Number),
        conflicting_edits: 0,
        unsupported_edit_paths: 0,
      }),
    );
    expect(result["updated_edits"]).toBeGreaterThanOrEqual(1);
    expect((await editRef.get()).data()).toEqual(
      expect.objectContaining({
        target_type: "event",
        target_id: eventId,
        schema_version: 1,
      }),
    );
  }, integrationTimeoutMs);
});
