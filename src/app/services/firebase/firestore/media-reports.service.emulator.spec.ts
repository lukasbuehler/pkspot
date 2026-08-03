import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithCustomToken,
  signOut,
  type Auth,
} from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from "firebase/functions";
import * as admin from "firebase-admin";
import {
  SubmitMediaReportRequest,
  SubmitMediaReportResponse,
} from "../../../../db/schemas/MediaReportPolicy";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const functionsHost =
  process.env["FUNCTIONS_EMULATOR_HOST"] || "127.0.0.1:5001";
const runWithEmulator =
  firestoreHost && authHost && functionsHost ? describe : describe.skip;
const timeoutMs = 60_000;
let adminApp: admin.app.App | undefined;

function adminDb(): admin.firestore.Firestore {
  adminApp ??= admin.initializeApp(
    { projectId: process.env["GCLOUD_PROJECT"] || "demo-pkspot" },
    `media-report-admin-${Date.now()}`,
  );
  return admin.firestore(adminApp);
}

function parseHostPort(value: string): [string, number] {
  const [host, rawPort] = value.split(":");
  const port = Number(rawPort);
  if (!host || !Number.isInteger(port)) {
    throw new Error(`Invalid emulator host: ${value}`);
  }
  return [host, port];
}

async function waitForReport(
  reportId: string,
  predicate: (data: admin.firestore.DocumentData) => boolean,
): Promise<admin.firestore.DocumentData> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const snapshot = await adminDb().doc(`reports/${reportId}`).get();
    const data = snapshot.data();
    if (data && predicate(data)) return data;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for reports/${reportId}`);
}

runWithEmulator("media report submission callable", () => {
  let app: FirebaseApp;
  let auth: Auth;
  let functions: Functions;

  beforeEach(async () => {
    const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
    const [authEmulatorHost, authPort] = parseHostPort(authHost!);
    const [functionsEmulatorHost, functionsPort] =
      parseHostPort(functionsHost);

    app = initializeApp(
      {
        apiKey: "demo-api-key",
        authDomain: `${projectId}.firebaseapp.com`,
        projectId,
      },
      `media-report-client-${Date.now()}-${Math.random()}`,
    );
    auth = getAuth(app);
    connectAuthEmulator(
      auth,
      `http://${authEmulatorHost}:${authPort}`,
      { disableWarnings: true },
    );
    functions = getFunctions(app, "europe-west1");
    connectFunctionsEmulator(
      functions,
      functionsEmulatorHost,
      functionsPort,
    );
  });

  afterEach(async () => {
    await signOut(auth).catch(() => undefined);
    await deleteApp(app);
  });

  afterAll(async () => {
    await adminApp?.delete();
    adminApp = undefined;
  });

  it("accepts an affected guest and records private request context", async () => {
    const submit = httpsCallable<
      SubmitMediaReportRequest,
      SubmitMediaReportResponse
    >(functions, "submitMediaReport");
    const result = await submit({
      media: {
        type: "image",
        src: "https://example.test/non-consensual.jpg",
        userId: "uploader-1",
      },
      reason: "person did not consent",
      comment: "I am visible in this image.",
      reporterEmail: "affected@example.test",
      locale: "en",
      context: "media",
      targetId: "guest-target",
    });
    const report = await waitForReport(
      result.data.reportId,
      (data) => data["submission"]?.["ip_hash"],
    );

    expect(report["user"]).toEqual(
      expect.objectContaining({
        email: "affected@example.test",
        email_verified: false,
      }),
    );
    expect(report["submission"]).toEqual(
      expect.objectContaining({
        channel: "callable",
        authenticated: false,
        app_check: false,
        ip_hash: expect.any(String),
        metadata_expires_at: expect.anything(),
      }),
    );
  }, timeoutMs);

  it("rejects guest quality reports", async () => {
    const submit = httpsCallable<
      SubmitMediaReportRequest,
      SubmitMediaReportResponse
    >(functions, "submitMediaReport");

    await expect(
      submit({
        media: {
          type: "image",
          src: "https://example.test/duplicate.jpg",
        },
        reason: "duplicate",
        comment: "",
      }),
    ).rejects.toThrow(/sign in/i);
  }, timeoutMs);

  it("accepts authenticated quality reports and resolves account identity", async () => {
    const uid = `media-reporter-${Date.now()}`;
    adminDb();
    const adminAuth = admin.auth(adminApp);
    await adminAuth.createUser({
      uid,
      email: `${uid}@example.test`,
      emailVerified: true,
      displayName: "Media Reporter",
    });
    const token = await adminAuth.createCustomToken(uid);
    await signInWithCustomToken(auth, token);
    const submit = httpsCallable<
      SubmitMediaReportRequest,
      SubmitMediaReportResponse
    >(functions, "submitMediaReport");
    const result = await submit({
      media: {
        type: "image",
        src: "https://example.test/duplicate-authenticated.jpg",
      },
      reason: "duplicate",
      comment: "",
      reporterEmail: "spoofed@example.test",
    });
    const report = await waitForReport(
      result.data.reportId,
      (data) => data["user"]?.["email"] === `${uid}@example.test`,
    );

    expect(report["user"]).toEqual(
      expect.objectContaining({
        uid,
        email: `${uid}@example.test`,
        email_verified: true,
      }),
    );
    expect(report["user"]["email"]).not.toBe("spoofed@example.test");
    expect(report["submission"]["authenticated"]).toBe(true);
  }, timeoutMs);
});
