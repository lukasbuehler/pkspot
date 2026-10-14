import { TestBed } from '@angular/core/testing';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection, collectionGroup, connectFirestoreEmulator, deleteDoc, doc,
  getDocFromServer, getDocsFromServer, initializeFirestore, memoryLocalCache,
  setDoc, Timestamp, updateDoc, type Firestore,
} from 'firebase/firestore';
import * as admin from 'firebase-admin';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogEntriesService } from './log-entries.service';
import { AuthenticationService } from '../authentication.service';
import { FirestoreAdapterService } from '../firestore-adapter.service';
import { FIREBASE_FIRESTORE } from '../firebase-client.providers';
import { FirebaseAppCheckService } from '../app-check.service';
import { PlatformService } from '../../platform.service';
import { FeatureTelemetryService } from '../../feature-telemetry.service';
import type { SessionRecordDocument } from '../../../../db/schemas/SessionRecordSchema';

const firestoreHost = process.env['FIRESTORE_EMULATOR_HOST'];
const authHost = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
const emulator = firestoreHost && authHost ? describe : describe.skip;

emulator('owner-only training logs through the real service and adapter', () => {
  const apps: FirebaseApp[] = [];
  let adminApp: admin.app.App;
  let owner: { db: Firestore; uid: string };
  let service: LogEntriesService;
  const start = Timestamp.fromDate(new Date('2026-10-14T08:00:00Z'));
  const session: SessionRecordDocument = {
    id: 'manual-session', owner_id: '', source: 'manual',
    started_at: start, started_at_raw_ms: start.toMillis(),
    ended_at: Timestamp.fromMillis(start.toMillis() + 3_600_000),
    ended_at_raw_ms: start.toMillis() + 3_600_000,
    last_activity_at: start, last_activity_raw_ms: start.toMillis(),
    time_zone: 'Europe/Zurich', spot_visits: [], people_present: [],
    time_created: start, time_created_raw_ms: start.toMillis(),
    time_updated: start, time_updated_raw_ms: start.toMillis(),
  };

  async function client(signedIn = true) {
    const projectId = process.env['GCLOUD_PROJECT'] ?? 'demo-pkspot';
    if (!projectId.startsWith('demo-')) throw new Error('Training log tests require a demo project');
    for (const host of [firestoreHost, authHost]) {
      if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) {
        throw new Error('Training log tests require local emulators');
      }
    }
    const app = initializeApp({ projectId, apiKey: 'demo-key' }, `private-log-${Date.now()}-${Math.random()}`);
    apps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    const db = initializeFirestore(app, { localCache: memoryLocalCache() });
    const [hostname, port] = firestoreHost!.split(':');
    connectFirestoreEmulator(db, hostname, Number(port));
    const uid = signedIn ? (await signInAnonymously(auth)).user.uid : '';
    return { db, uid };
  }

  beforeEach(async () => {
    owner = await client();
    adminApp ??= admin.initializeApp(
      { projectId: process.env['GCLOUD_PROJECT'] ?? 'demo-pkspot' },
      `private-log-admin-${Date.now()}`,
    );
    TestBed.configureTestingModule({ providers: [
      LogEntriesService, FirestoreAdapterService,
      { provide: AuthenticationService, useValue: { user: { uid: owner.uid } } },
      { provide: FIREBASE_FIRESTORE, useValue: owner.db },
      { provide: FirebaseAppCheckService, useValue: { initialize: async () => undefined } },
      { provide: PlatformService, useValue: { isNative: () => false, getPlatform: () => 'web' } },
      { provide: FeatureTelemetryService, useValue: {
        run: (_feature: string, _action: string, work: () => unknown) => work(),
        failure: () => undefined,
      } },
    ] });
    service = TestBed.inject(LogEntriesService);
  });

  afterEach(async () => {
    TestBed.resetTestingModule();
    await Promise.all(apps.splice(0).map(app => deleteApp(app)));
  });
  afterAll(async () => { await adminApp?.delete(); });

  function input(note = 'Private training note') {
    return { note, sessions: [{ ...session, owner_id: owner.uid }] };
  }

  it('round-trips private notes and timestamps through the app write path', async () => {
    const id = await service.create(input());
    expect(await service.getMine(id)).toMatchObject({
      note: 'Private training note', visibility: 'private', owner_id: owner.uid,
      session_record_ids: ['manual-session'], activity_at_raw_ms: start.toMillis(),
    });
    await service.update(id, input('Updated private note'));
    expect((await service.listMine()).find(entry => entry.id === id)?.note).toBe('Updated private note');
    expect((await getDocFromServer(doc(owner.db, `users/${owner.uid}/log_entries/${id}`))).data()?.['visibility']).toBe('private');
    await service.delete(id);
    expect((await getDocFromServer(doc(owner.db, `users/${owner.uid}/log_entries/${id}`))).exists()).toBe(false);
  });

  it('preserves legacy shared entries for their owner and makes an edited entry private', async () => {
    const id = await service.create(input());
    const path = `users/${owner.uid}/log_entries/${id}`;
    const original = (await getDocFromServer(doc(owner.db, path))).data()!;
    await admin.firestore(adminApp).doc(path).update({ visibility: 'public' });
    expect((await service.listMine()).find(entry => entry.id === id)).toMatchObject({ note: 'Private training note' });
    await service.update(id, input());
    const saved = (await getDocFromServer(doc(owner.db, path))).data();
    expect(saved).toMatchObject({ visibility: 'private', note: 'Private training note' });
    expect(saved?.['time_created'].toMillis()).toBe(original['time_created'].toMillis());
    expect(saved?.['time_created_raw_ms']).toBe(original['time_created_raw_ms']);
  });

  it('denies direct and collection reads for every non-owner, including legacy audiences', async () => {
    const id = await service.create(input());
    const collectionPath = `users/${owner.uid}/log_entries`;
    const source = (await admin.firestore(adminApp).doc(`${collectionPath}/${id}`).get()).data()!;
    const audiences = ['private', 'public', 'followers', 'friends'];
    await Promise.all(audiences.map(visibility => admin.firestore(adminApp)
      .doc(`${collectionPath}/legacy-${visibility}`).set({ ...source, visibility })));
    const [anonymous, stranger, follower, mutual, administrator] = await Promise.all([
      client(false), client(), client(), client(), client(),
    ]);
    const db = admin.firestore(adminApp);
    await Promise.all([
      db.doc(`users/${follower.uid}/following/${owner.uid}`).set({}),
      db.doc(`users/${mutual.uid}/following/${owner.uid}`).set({}),
      db.doc(`users/${mutual.uid}/followers/${owner.uid}`).set({}),
      db.doc(`users/${administrator.uid}`).set({ is_admin: true }),
    ]);
    expect((await service.listMine()).length).toBe(5);
    for (const viewer of [anonymous, stranger, follower, mutual, administrator]) {
      for (const visibility of audiences) {
        await expect(getDocFromServer(doc(viewer.db, `${collectionPath}/legacy-${visibility}`)))
          .rejects.toMatchObject({ code: 'permission-denied' });
      }
      await expect(getDocsFromServer(collection(viewer.db, collectionPath)))
        .rejects.toMatchObject({ code: 'permission-denied' });
      await expect(getDocsFromServer(collectionGroup(viewer.db, 'log_entries')))
        .rejects.toMatchObject({ code: 'permission-denied' });
    }
  });

  it('rejects sharing writes from old clients and cross-owner mutations', async () => {
    const id = await service.create(input());
    const path = `users/${owner.uid}/log_entries/${id}`;
    const saved = (await getDocFromServer(doc(owner.db, path))).data()!;
    for (const visibility of ['public', 'followers', 'friends']) {
      await expect(setDoc(doc(owner.db, `users/${owner.uid}/log_entries/forged-${visibility}`), { ...saved, visibility }))
        .rejects.toMatchObject({ code: 'permission-denied' });
      await expect(updateDoc(doc(owner.db, path), { visibility }))
        .rejects.toMatchObject({ code: 'permission-denied' });
    }
    const other = await client();
    await expect(setDoc(doc(other.db, `users/${owner.uid}/log_entries/forged-owner`), saved))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(doc(other.db, path), { note: 'Changed by someone else' }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(deleteDoc(doc(other.db, path))).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
