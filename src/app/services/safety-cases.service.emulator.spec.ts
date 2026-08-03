import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from "firebase/functions";
import {
  connectAuthEmulator,
  getAuth,
  signInWithCustomToken,
} from "firebase/auth";
import { CustomProvider, initializeAppCheck } from "firebase/app-check";
import * as admin from "firebase-admin";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SafetyCasePublicView } from "../../db/schemas/SafetyCaseSchema";
import type {
  SubmitSafetyCaseInput,
  SubmitSafetyCaseResult,
} from "./safety-cases.service";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const functionsHost =
  process.env["FUNCTIONS_EMULATOR_HOST"] || "127.0.0.1:5001";
const authHost =
  process.env["FIREBASE_AUTH_EMULATOR_HOST"] || "127.0.0.1:9099";
const runWithEmulator =
  firestoreHost && functionsHost ? describe : describe.skip;
const timeoutMs = 90_000;
let adminApp: admin.app.App | undefined;

function db(): admin.firestore.Firestore {
  adminApp ??= admin.initializeApp(
    { projectId: process.env["GCLOUD_PROJECT"] || "demo-pkspot" },
    `safety-case-admin-${Date.now()}`,
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

function emulatorAppCheckToken(projectId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: Record<string, unknown>): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return (
    `${encode({ alg: "none", typ: "JWT" })}.` +
    `${encode({
      sub: "safety-case-emulator-app",
      aud: [projectId],
      iat: now,
      exp: now + 3600,
    })}.`
  );
}

async function caseEmail(caseId: string): Promise<admin.firestore.DocumentData> {
  const snapshot = await db()
    .collection("safety_case_email_outbox")
    .where("case_id", "==", caseId)
    .limit(1)
    .get();
  const email = snapshot.docs[0]?.data();
  if (!email) throw new Error(`No case email for ${caseId}`);
  return email;
}

runWithEmulator("safety case callable flow", () => {
  let app: FirebaseApp;
  let functions: Functions;

  beforeEach(() => {
    const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
    const [host, port] = parseHostPort(functionsHost);
    app = initializeApp(
      {
        apiKey: "demo-api-key",
        authDomain: `${projectId}.firebaseapp.com`,
        projectId,
      },
      `safety-case-client-${Date.now()}-${Math.random()}`,
    );
    functions = getFunctions(app, "europe-west1");
    connectFunctionsEmulator(functions, host, port);
  });

  afterEach(async () => {
    await deleteApp(app);
  });

  afterAll(async () => {
    await adminApp?.delete();
    adminApp = undefined;
  });

  it("requires guest email verification and grants only a scoped case session", async () => {
    const submit = httpsCallable<
      SubmitSafetyCaseInput,
      SubmitSafetyCaseResult
    >(functions, "submitSafetyCase");
    const payload: SubmitSafetyCaseInput = {
      case_type: "report",
      category: "privacy_or_doxxing",
      subject: {
        type: "profile",
        path: "users/reported-user",
        owner_uid: "reported-user",
      },
      summary: "Private information on a profile",
      description:
        "The profile appears to disclose a private home address without consent.",
      locale: "en",
    };

    await expect(submit(payload)).rejects.toThrow(/email is required/i);
    const submitted = await submit({
      ...payload,
      contact_email: "reporter@example.test",
    });
    expect(submitted.data.email_verification_required).toBe(true);

    const caseId = submitted.data.case_id;
    const [caseDocument, intake, email] = await Promise.all([
      db().doc(`safety_cases/${caseId}`).get(),
      db().doc(`safety_cases/${caseId}/private/intake`).get(),
      caseEmail(caseId),
    ]);
    expect(caseDocument.data()).toEqual(
      expect.objectContaining({
        public_reference: submitted.data.public_reference,
        status: "received",
        contact_email_verified: false,
      }),
    );
    expect(intake.data()).toEqual(
      expect.objectContaining({
        contact_email: "reporter@example.test",
        authenticated: false,
        contact_email_verified: false,
        metadata_expires_at: expect.anything(),
      }),
    );

    const html = String(email["message"]?.["html"] ?? "");
    const tokenMatch = html.match(/[?&]access=([^"&<]+)/u);
    expect(tokenMatch?.[1]).toBeTruthy();
    const accessToken = decodeURIComponent(tokenMatch![1]);
    const exchange = httpsCallable<
      { access_token: string },
      {
        session_token: string;
        expires_at: string;
        case: SafetyCasePublicView;
      }
    >(functions, "exchangeSafetyCaseAccessLink");
    const accessed = await exchange({ access_token: accessToken });
    expect(accessed.data.case.public_reference).toBe(
      submitted.data.public_reference,
    );
    expect(accessed.data.case.events.map((event) => event.type)).toContain(
      "contact_verified",
    );

    await expect(exchange({ access_token: accessToken })).rejects.toThrow(
      /invalid or expired/i,
    );

    const addMessage = httpsCallable<
      {
        public_reference: string;
        session_token: string;
        message: string;
      },
      { ok: true }
    >(functions, "addSafetyCaseMessage");
    await addMessage({
      public_reference: submitted.data.public_reference,
      session_token: accessed.data.session_token,
      message: "The exact address is visible in the biography field.",
    });
    const events = await db()
      .collection(`safety_cases/${caseId}/events`)
      .where("type", "==", "message")
      .get();
    expect(events.size).toBe(1);
    expect(events.docs[0].data()["visibility"]).toBe("submitter");

    const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
    const subjectApp = initializeApp(
      {
        apiKey: "demo-api-key",
        authDomain: `${projectId}.firebaseapp.com`,
        projectId,
      },
      `safety-case-subject-${Date.now()}-${Math.random()}`,
    );
    try {
      await admin.auth(adminApp).createUser({
        uid: "reported-user",
        email: "subject@example.test",
      });
      const [authEmulatorHost, authEmulatorPort] = parseHostPort(authHost);
      const auth = getAuth(subjectApp);
      connectAuthEmulator(
        auth,
        `http://${authEmulatorHost}:${authEmulatorPort}`,
        { disableWarnings: true },
      );
      await signInWithCustomToken(
        auth,
        await admin.auth(adminApp).createCustomToken("reported-user"),
      );
      const subjectFunctions = getFunctions(subjectApp, "europe-west1");
      const [functionsEmulatorHost, functionsEmulatorPort] =
        parseHostPort(functionsHost);
      connectFunctionsEmulator(
        subjectFunctions,
        functionsEmulatorHost,
        functionsEmulatorPort,
      );
      const getView = httpsCallable<
        { public_reference: string },
        SafetyCasePublicView
      >(subjectFunctions, "getSafetyCaseView");
      const subjectView = await getView({
        public_reference: submitted.data.public_reference,
      });
      expect(subjectView.data.summary).not.toBe(payload.summary);
      expect(subjectView.data.description).not.toContain("home address");
      expect(
        subjectView.data.events.some((event) =>
          event.message?.includes("exact address"),
        ),
      ).toBe(false);
      expect(subjectView.data.subject).toEqual({
        type: "profile",
      });

      const moderatorApp = initializeApp(
        {
          apiKey: "demo-api-key",
          authDomain: `${projectId}.firebaseapp.com`,
          projectId,
        },
        `safety-case-moderator-${Date.now()}-${Math.random()}`,
      );
      try {
        await admin.auth(adminApp).createUser({ uid: "moderator" });
        await db().doc("users/moderator").set({ is_admin: true });
        const moderatorAuth = getAuth(moderatorApp);
        connectAuthEmulator(
          moderatorAuth,
          `http://${authEmulatorHost}:${authEmulatorPort}`,
          { disableWarnings: true },
        );
        await signInWithCustomToken(
          moderatorAuth,
          await admin.auth(adminApp).createCustomToken("moderator"),
        );
        initializeAppCheck(moderatorApp, {
          provider: new CustomProvider({
            getToken: async () => ({
              token: emulatorAppCheckToken(projectId),
              expireTimeMillis: Date.now() + 60 * 60 * 1000,
            }),
          }),
          isTokenAutoRefreshEnabled: false,
        });
        const moderatorFunctions = getFunctions(
          moderatorApp,
          "europe-west1",
        );
        connectFunctionsEmulator(
          moderatorFunctions,
          functionsEmulatorHost,
          functionsEmulatorPort,
        );
        const updateCase = httpsCallable<
          {
            public_reference: string;
            participant_role: "subject";
            message: string;
          },
          { ok: true }
        >(moderatorFunctions, "updateSafetyCase");
        await updateCase({
          public_reference: submitted.data.public_reference,
          participant_role: "subject",
          message: "We have restricted the profile while reviewing this case.",
        });
        const updateEmails = await db()
          .collection("safety_case_email_outbox")
          .where("case_id", "==", caseId)
          .where("template", "==", "case_update")
          .get();
        expect(updateEmails.size).toBe(1);
        expect(updateEmails.docs[0].data()["to"]).toEqual([
          "subject@example.test",
        ]);
        expect(updateEmails.docs[0].data()["to"]).not.toContain(
          "reporter@example.test",
        );

        await db().doc("users/reported-user").set(
          {
            display_name: "Affected athlete",
            account_privacy: "public",
            profile_visibility: "public",
            public_profile_enabled: true,
            public_search: true,
            age_policy: {
              adult_eligibility: "verified",
              age_range: { lower: 18 },
              assurance: {
                status: "active",
                client_integrity: "play_integrity_request_bound",
              },
            },
          },
          { merge: true },
        );
        await db().doc("public_user_profiles/reported-user").set({
          display_name: "Affected athlete",
          public_profile_enabled: true,
          public_search: true,
          profile_access: "full",
        });
        const reversibleCase = await submit({
          ...payload,
          summary: "Public profile restriction test",
          description:
            "The public profile needs a temporary reversible restriction.",
          contact_email: "second-reporter@example.test",
        });
        const decideCase = httpsCallable<
          {
            public_reference: string;
            decision_type: "restrict_profile";
            outcome: "action_taken";
            public_reason: string;
          },
          { ok: true; hold_path?: string }
        >(moderatorFunctions, "decideSafetyCase");
        const decision = await decideCase({
          public_reference: reversibleCase.data.public_reference,
          decision_type: "restrict_profile",
          outcome: "action_taken",
          public_reason:
            "The public profile is restricted while the safety concern applies.",
        });
        expect(decision.data.hold_path).toBe(
          `safety_case_holds/${reversibleCase.data.case_id}`,
        );
        const [heldUser, heldProfile, hold, decidedCase] = await Promise.all([
          db().doc("users/reported-user").get(),
          db().doc("public_user_profiles/reported-user").get(),
          db().doc(decision.data.hold_path!).get(),
          db().doc(`safety_cases/${reversibleCase.data.case_id}`).get(),
        ]);
        expect(heldUser.data()?.["moderation_state"]?.["status"]).toBe(
          "profile_restricted",
        );
        expect(heldProfile.exists).toBe(false);
        expect(hold.data()?.["state"]).toBe("held");
        expect(decidedCase.data()?.["decision"]?.["hold_path"]).toBe(
          decision.data.hold_path,
        );

        const subjectDecisionEmails = await db()
          .collection("safety_case_email_outbox")
          .where("case_id", "==", reversibleCase.data.case_id)
          .where("template", "==", "case_subject_decision")
          .get();
        expect(subjectDecisionEmails.size).toBe(1);
        expect(subjectDecisionEmails.docs[0].data()["to"]).toEqual([
          "subject@example.test",
        ]);

        const restoreCase = httpsCallable<
          { public_reference: string },
          { ok: true }
        >(moderatorFunctions, "restoreSafetyCaseDecision");
        await restoreCase({
          public_reference: reversibleCase.data.public_reference,
        });
        const [restoredUser, restoredProfile, restoredHold, restoredCase] =
          await Promise.all([
            db().doc("users/reported-user").get(),
            db().doc("public_user_profiles/reported-user").get(),
            db().doc(decision.data.hold_path!).get(),
            db().doc(`safety_cases/${reversibleCase.data.case_id}`).get(),
          ]);
        expect(restoredUser.data()?.["moderation_state"]).toBeUndefined();
        expect(restoredUser.data()?.["public_profile_enabled"]).toBe(true);
        expect(restoredUser.data()?.["public_search"]).toBe(true);
        expect(restoredProfile.data()?.["display_name"]).toBe(
          "Affected athlete",
        );
        expect(restoredHold.data()?.["state"]).toBe("restored");
        expect(
          restoredCase.data()?.["decision"]?.["restored_at"],
        ).toBeTruthy();
      } finally {
        await deleteApp(moderatorApp);
      }

      const decidedAt = admin.firestore.Timestamp.now();
      await db().doc(`safety_cases/${caseId}`).set(
        {
          status: "resolved",
          resolved_at: decidedAt,
          updated_at: decidedAt,
          original_reviewer: { uid: "moderator" },
          decision: {
            type: "restrict_profile",
            outcome: "action_taken",
            public_reason: "The public profile exposed private information.",
            decided_at: decidedAt,
            decided_by: { uid: "moderator" },
          },
        },
        { merge: true },
      );
      const decidedSubjectView = await getView({
        public_reference: submitted.data.public_reference,
      });
      expect(decidedSubjectView.data.can_appeal).toBe(true);
      const appeal = httpsCallable<
        { public_reference: string; reason: string },
        { case_id: string; public_reference: string }
      >(subjectFunctions, "appealSafetyCaseDecision");
      const subjectAppeal = await appeal({
        public_reference: submitted.data.public_reference,
        reason: "The address has been removed and the profile should be restored.",
      });
      const [appealCase, appealIntake, parentAfterAppeal] = await Promise.all([
        db().doc(`safety_cases/${subjectAppeal.data.case_id}`).get(),
        db()
          .doc(`safety_cases/${subjectAppeal.data.case_id}/private/intake`)
          .get(),
        db().doc(`safety_cases/${caseId}`).get(),
      ]);
      expect(appealCase.data()).toEqual(
        expect.objectContaining({
          appellant_role: "subject",
          submitter_uid: "reported-user",
          parent_case_id: caseId,
        }),
      );
      expect(appealIntake.data()?.["contact_email"]).toBe(
        "subject@example.test",
      );
      expect(appealIntake.data()?.["contact_email"]).not.toBe(
        "reporter@example.test",
      );
      expect(parentAfterAppeal.data()?.["appeal_case_ids"]).toEqual({
        subject: subjectAppeal.data.case_id,
      });
      expect(parentAfterAppeal.data()?.["appeal_case_id"]).toBeUndefined();

      const reporterView = httpsCallable<
        { public_reference: string; session_token: string },
        SafetyCasePublicView
      >(functions, "getSafetyCaseView");
      const reporterAfterSubjectAppeal = await reporterView({
        public_reference: submitted.data.public_reference,
        session_token: accessed.data.session_token,
      });
      expect(reporterAfterSubjectAppeal.data.can_appeal).toBe(true);
    } finally {
      await deleteApp(subjectApp);
    }
  }, timeoutMs);
});
