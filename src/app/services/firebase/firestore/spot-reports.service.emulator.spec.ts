import {deleteApp, initializeApp, type FirebaseApp} from "firebase/app";
import {connectAuthEmulator, getAuth, signInWithCustomToken, signOut, type Auth} from "firebase/auth";
import {connectFunctionsEmulator, getFunctions, httpsCallable, type Functions} from "firebase/functions";
import * as admin from "firebase-admin";
import type {
  SubmitSpotReportRequest,
  SubmitSpotReportResponse,
} from "../../../../db/schemas/ReportLifecycleSchema";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const functionsHost = process.env["FUNCTIONS_EMULATOR_HOST"] || "127.0.0.1:5001";
const runWithEmulator = firestoreHost && authHost && functionsHost ? describe : describe.skip;
const timeoutMs = 60_000;
let adminApp: admin.app.App | undefined;

function adminDb(): admin.firestore.Firestore {
  adminApp ??= admin.initializeApp(
    {projectId: process.env["GCLOUD_PROJECT"] || "demo-pkspot"},
    `spot-report-admin-${Date.now()}`,
  );
  return admin.firestore(adminApp);
}

function parseHostPort(value: string): [string, number] {
  const [host, rawPort] = value.split(":");
  const port = Number(rawPort);
  if (!host || !Number.isInteger(port)) throw new Error(`Invalid emulator host: ${value}`);
  return [host, port];
}

runWithEmulator("Spot report lifecycle", () => {
  let app: FirebaseApp;
  let auth: Auth;
  let functions: Functions;

  beforeEach(async () => {
    const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
    const [authEmulatorHost, authPort] = parseHostPort(authHost!);
    const [functionsEmulatorHost, functionsPort] = parseHostPort(functionsHost);
    app = initializeApp({apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId}, `spot-report-client-${Date.now()}-${Math.random()}`);
    auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authEmulatorHost}:${authPort}`, {disableWarnings: true});
    functions = getFunctions(app, "europe-west1");
    connectFunctionsEmulator(functions, functionsEmulatorHost, functionsPort);
  });

  afterEach(async () => {
    await signOut(auth).catch(() => undefined);
    await deleteApp(app);
  });

  afterAll(async () => {
    await adminApp?.delete();
    adminApp = undefined;
  });

  it("serializes retries, preserves one open report, and permits a new report after withdrawal", async () => {
    const uid = `spot-reporter-${Date.now()}`;
    const spotId = `spot-${Date.now()}`;
    const db = adminDb();
    const adminAuth = admin.auth(adminApp);
    await adminAuth.createUser({uid, email: `${uid}@example.test`});
    await db.doc(`spots/${spotId}`).set({name: {en: "Reported bench"}, media: []});
    await signInWithCustomToken(auth, await adminAuth.createCustomToken(uid));
    const submit = httpsCallable<SubmitSpotReportRequest, SubmitSpotReportResponse>(functions, "submitSpotReport");

    const [first, retry] = await Promise.all([
      submit({spotId, reasons: ["private"], comment: ""}),
      submit({spotId, reasons: ["torn down"], comment: ""}),
    ]);
    const reports = await db.collection(`spots/${spotId}/reports`).get();
    const reportId = first.data.reportId;

    expect(retry.data.reportId).toBe(reportId);
    expect(reports.docs).toHaveLength(1);
    expect([first.data.created, retry.data.created].filter(Boolean)).toHaveLength(1);

    const listMine = httpsCallable<Record<string, never>, {reports: Array<{id: string; reasons: string[]; status: string}>}>(
      functions,
      "listMyReports",
    );
    await expect(listMine({})).resolves.toEqual({
      data: {reports: [expect.objectContaining({id: reportId, reasons: expect.any(Array), status: "open"})]},
    });

    await expect(submit({spotId, reasons: ["other"], comment: ""})).rejects.toThrow(/comment is required/i);
    await expect(submit({spotId, reasons: ["duplicate"], comment: ""})).rejects.toThrow(/duplicateOf.id is required/i);

    const withdraw = httpsCallable<{kind: "spot"; spotId: string; reportId: string}, {withdrawn: boolean}>(
      functions,
      "withdrawOwnSpotReport",
    );
    await expect(withdraw({kind: "spot", spotId, reportId})).resolves.toEqual({withdrawn: true});
    expect((await db.doc(`spots/${spotId}/reports/${reportId}`).get()).data()?.["status"]).toBe("withdrawn");

    const later = await submit({spotId, reasons: ["does not exist"], comment: ""});
    expect(later.data.created).toBe(true);
    expect(later.data.reportId).not.toBe(reportId);
  }, timeoutMs);
});
