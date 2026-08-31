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
      duplicateMedia: {src: "https://example.test/original-authenticated.jpg"},
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

  it("updates one authenticated open report for the same media target", async () => {
    const uid = `media-report-update-${Date.now()}`;
    adminDb();
    const adminAuth = admin.auth(adminApp);
    await adminAuth.createUser({uid, email: `${uid}@example.test`});
    await signInWithCustomToken(auth, await adminAuth.createCustomToken(uid));
    const submit = httpsCallable<SubmitMediaReportRequest, SubmitMediaReportResponse>(
      functions,
      "submitMediaReport",
    );
    const target = {
      media: {type: "image", src: `https://example.test/${uid}.jpg`},
      comment: "The media should be reviewed.",
      context: "media" as const,
      targetId: uid,
    };

    const first = await submit({...target, reasons: ["bad quality"]});
    const updated = await submit({...target, reasons: ["bad quality", "other"]});
    const report = await waitForReport(
      first.data.reportId,
      (data) => Array.isArray(data["reasons"]) && data["reasons"].length === 2,
    );

    expect(updated.data).toEqual({reportId: first.data.reportId, created: false});
    expect(report["reasons"]).toEqual(["bad quality", "other"]);
    await expect(submit({...target, reasons: ["duplicate"]})).rejects.toThrow(/duplicateMedia.src is required/i);
    await expect(submit({
      ...target,
      reasons: ["duplicate"],
      duplicateMedia: {src: "https://example.test/original-media.jpg"},
    })).resolves.toEqual({data: {reportId: first.data.reportId, created: false}});
  }, timeoutMs);
});
