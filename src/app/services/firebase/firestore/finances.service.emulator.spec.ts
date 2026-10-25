import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, signOut, Auth } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, memoryLocalCache, doc, getDoc, getDocs, collection, setDoc, Firestore } from 'firebase/firestore';
import * as admin from 'firebase-admin';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FinancesService } from './finances.service';
import { AuthenticationService } from '../authentication.service';
import { FirestoreAdapterService } from '../firestore-adapter.service';
import { FIREBASE_FIRESTORE } from '../firebase-client.providers';
import { FirebaseAppCheckService } from '../app-check.service';
import { PlatformService } from '../../platform.service';
import { FeatureTelemetryService } from '../../feature-telemetry.service';
import { FinanceEntry, compileFinanceRates } from '../../../shared/finance';

const host = process.env['FIRESTORE_EMULATOR_HOST'];
const authHost = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
const emulator = host && authHost ? describe : describe.skip;

emulator('private finances through the app service and Firestore adapter', () => {
  let app: FirebaseApp;
  let db: Firestore;
  let auth: Auth;
  let service: FinancesService;
  let uid: string;
  let adminApp: admin.app.App;
  const isAdmin = signal(true);
  const base: FinanceEntry = { id: 'finance-integration', date: '2026-10-01', kind: 'income',
    description: 'Partnership', partner: 'Test partner', category: 'partnership', status: 'pending',
    amount_chf_cents: 20000, notes: 'Expected, not received' };

  beforeEach(async () => {
    const projectId = process.env['GCLOUD_PROJECT'] ?? 'demo-pkspot';
    adminApp ??= admin.initializeApp({ projectId }, 'finance-tests');
    app = initializeApp({ projectId, apiKey: 'demo-key' }, `finance-${Date.now()}-${Math.random()}`);
    auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
    const [hostname, port] = host!.split(':');
    connectFirestoreEmulator(db, hostname, Number(port));
    uid = (await signInAnonymously(auth)).user.uid;
    await admin.firestore(adminApp).doc(`users/${uid}`).set({ is_admin: true });
    isAdmin.set(true);
    TestBed.configureTestingModule({ providers: [
      FinancesService, FirestoreAdapterService,
      { provide: AuthenticationService, useValue: { isAdmin } },
      { provide: FIREBASE_FIRESTORE, useValue: db },
      { provide: FirebaseAppCheckService, useValue: { initialize: async () => undefined } },
      { provide: PlatformService, useValue: { isNative: () => false, getPlatform: () => 'web' } },
      { provide: FeatureTelemetryService, useValue: { run: (_provider: string, _operation: string, work: () => unknown) => work() } },
    ] });
    service = TestBed.inject(FinancesService);
  });
  afterEach(async () => { await deleteApp(app); TestBed.resetTestingModule(); });
  afterAll(async () => { await adminApp?.delete(); });

  it('round-trips pending income, unknown in-kind values, notes and a compiled rate snapshot', async () => {
    await service.saveEntry(2026, base);
    await service.saveEntry(2026, { ...base, id: 'ticket', kind: 'in_kind', amount_chf_cents: null });
    const settings = { notes: 'Reimbursements end on incorporation.', rates: compileFinanceRates('Date,CHF,USD\n2026-01-02,0.9,1.1', 2026, '2026-10-06') };
    await service.saveSettings(2026, settings);
    const ledger = await service.load(2026);
    expect(ledger.settings).toEqual(settings);
    expect(ledger.entries).toEqual(expect.arrayContaining([base, { ...base, id: 'ticket', kind: 'in_kind', amount_chf_cents: null }]));
    await service.saveEntry(2026, { ...base, status: 'settled' });
    expect((await getDoc(doc(db, 'finance_years/2026/entries/finance-integration'))).data()?.['status']).toBe('settled');
    await service.deleteEntry(2026, base.id);
    expect((await service.load(2026)).entries.some(e => e.id === base.id)).toBe(false);
  });

  it('denies anonymous and ordinary users even when the UI admin flag is spoofed', async () => {
    await service.saveEntry(2026, base);
    await admin.firestore(adminApp).doc(`users/${uid}`).set({ is_admin: false });
    // Leave isAdmin true: the real rules, not the UI, must reject these calls.
    await expect(service.load(2026)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(service.saveEntry(2026, base)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(service.deleteEntry(2026, base.id)).rejects.toMatchObject({ code: 'permission-denied' });
    await signOut(auth);
    await expect(getDoc(doc(db, 'finance_years/2026'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getDocs(collection(db, 'finance_years/2026/entries'))).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects malformed data at the rules boundary', async () => {
    const { id, ...data } = base;
    await expect(setDoc(doc(db, `finance_years/2026/entries/${id}`), { ...data, amount_chf_cents: null })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(db, 'finance_years/2026'), { notes: '', rates: { eur_per_chf: -1 } })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
