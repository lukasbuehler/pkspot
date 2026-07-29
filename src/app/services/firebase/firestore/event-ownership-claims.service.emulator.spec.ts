import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from "firebase/functions";
import * as admin from "firebase-admin";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const functionsHost =
  process.env["FUNCTIONS_EMULATOR_HOST"] || "127.0.0.1:5001";
const runWithEmulator =
  firestoreHost && authHost ? describe : describe.skip;
const timeoutMs = 90_000;
let adminApp: admin.app.App | undefined;

interface Client {
  app: FirebaseApp;
  auth: Auth;
  functions: Functions;
  uid: string;
}

function parseHostPort(value: string): [string, number] {
  const [host, rawPort] = value.split(":");
  const port = Number(rawPort);
  if (!host || !Number.isInteger(port)) {
    throw new Error(`Invalid emulator host: ${value}`);
  }
  return [host, port];
}

function db(): admin.firestore.Firestore {
  adminApp ??= admin.initializeApp(
    { projectId: process.env["GCLOUD_PROJECT"] || "demo-pkspot" },
    `event-claim-admin-${Date.now()}`,
  );
  return admin.firestore(adminApp);
}

async function client(label: string): Promise<Client> {
  const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
  const [authEmulatorHost, authPort] = parseHostPort(authHost!);
  const [functionsEmulatorHost, functionsPort] =
    parseHostPort(functionsHost);
  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      authDomain: `${projectId}.firebaseapp.com`,
      projectId,
    },
    `${label}-${Date.now()}-${Math.random()}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authEmulatorHost}:${authPort}`, {
    disableWarnings: true,
  });
  const functions = getFunctions(app, "europe-west1");
  connectFunctionsEmulator(
    functions,
    functionsEmulatorHost,
    functionsPort,
  );
  const credential = await signInAnonymously(auth);
  return { app, auth, functions, uid: credential.user.uid };
}

runWithEmulator("event ownership claim workflow", () => {
  const clients: Client[] = [];
  let claimant: Client;
  let owner: Client;
  let administrator: Client;
  let outsider: Client;

  beforeEach(async () => {
    [claimant, owner, administrator, outsider] = await Promise.all([
      client("claimant"),
      client("owner"),
      client("administrator"),
      client("outsider"),
    ]);
    clients.push(claimant, owner, administrator, outsider);
    await Promise.all([
      db().doc(`users/${claimant.uid}`).set({ is_admin: false }),
      db().doc(`users/${owner.uid}`).set({ is_admin: false }),
      db().doc(`users/${administrator.uid}`).set({ is_admin: true }),
      db().doc(`users/${outsider.uid}`).set({ is_admin: false }),
      db().doc("organizations/claim-org").set({
        name: "Claiming Parkour Club",
        slug: "claiming-club",
        active: true,
      }),
      db().doc(`organizations/claim-org/members/${claimant.uid}`).set({
        role: "owner",
        user: { uid: claimant.uid },
      }),
      db().doc("events/claimed-event").set({
        name: "Claimed Jam",
        owner: { type: "user", user_id: owner.uid },
        organizer_name: "Claiming Parkour Club",
        published: true,
        start: admin.firestore.Timestamp.fromDate(
          new Date("2026-08-01T10:00:00.000Z"),
        ),
        end: admin.firestore.Timestamp.fromDate(
          new Date("2026-08-01T12:00:00.000Z"),
        ),
      }),
    ]);
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((entry) => deleteApp(entry.app)));
  });

  afterAll(async () => {
    await adminApp?.delete();
    adminApp = undefined;
  });

  it("submits, protects, responds to, and transactionally approves a claim", async () => {
    const submit = httpsCallable<
      {
        eventId: string;
        organizationId: string;
        explanation: string;
        evidenceUrls: string[];
        suggestedFormerOwnerOutcome: "retain_editor";
      },
      { claimId: string }
    >(claimant.functions, "submitEventOwnershipClaim");
    const input = {
      eventId: "claimed-event",
      organizationId: "claim-org",
      explanation: "This is our club's publicly announced annual event.",
      evidenceUrls: ["https://example.org/events/claimed-jam"],
      suggestedFormerOwnerOutcome: "retain_editor" as const,
    };
    const submitted = await submit(input);
    const claimId = submitted.data.claimId;

    await expect(submit(input)).rejects.toThrow(/pending claim/i);

    const outsiderRespond = httpsCallable(
      outsider.functions,
      "respondToEventOwnershipClaim",
    );
    await expect(
      outsiderRespond({ claimId, position: "support" }),
    ).rejects.toThrow(/current owner/i);

    const ownerRespond = httpsCallable(owner.functions, "respondToEventOwnershipClaim");
    await ownerRespond({
      claimId,
      position: "contest",
      message: "Please retain my editor access.",
    });

    const review = httpsCallable(
      administrator.functions,
      "reviewEventOwnershipClaim",
    );
    await review({
      claimId,
      approve: true,
      transferOwnership: true,
      linkOrganizer: true,
      formerOwnerOutcome: "retain_editor",
      reason: "The public evidence and owner response are sufficient.",
    });

    const [event, claim, access, audits] = await Promise.all([
      db().doc("events/claimed-event").get(),
      db().doc(`event_ownership_claims/${claimId}`).get(),
      db().doc(`events/claimed-event/access/${owner.uid}`).get(),
      db()
        .collection("event_ownership_claim_audits")
        .where("claim_id", "==", claimId)
        .get(),
    ]);
    expect(event.data()).toEqual(
      expect.objectContaining({
        owner: { type: "organization", organization_id: "claim-org" },
        organizer: expect.objectContaining({
          type: "organization",
          organization: expect.objectContaining({ id: "claim-org" }),
        }),
      }),
    );
    expect(access.data()?.["role"]).toBe("collaborator");
    expect(claim.data()).toEqual(
      expect.objectContaining({
        status: "approved",
        owner_response: expect.objectContaining({ position: "contest" }),
        decision: expect.objectContaining({
          transfer_ownership: true,
          link_organizer: true,
          former_owner_outcome: "retain_editor",
          decided_by: administrator.uid,
        }),
      }),
    );
    expect(audits.size).toBe(1);
    expect(audits.docs[0].data()).toEqual(
      expect.objectContaining({
        owner_before: { type: "user", user_id: owner.uid },
        owner_after: {
          type: "organization",
          organization_id: "claim-org",
        },
      }),
    );
  }, timeoutMs);

  it("requires a rejection reason and leaves ownership unchanged", async () => {
    const submit = httpsCallable(claimant.functions, "submitEventOwnershipClaim");
    const submitted = await submit({
      eventId: "claimed-event",
      organizationId: "claim-org",
      explanation: "The name matches our public organization.",
      evidenceUrls: ["https://example.org/club"],
      suggestedFormerOwnerOutcome: "remove_access",
    });
    const claimId = (submitted.data as { claimId: string }).claimId;
    const review = httpsCallable(
      administrator.functions,
      "reviewEventOwnershipClaim",
    );
    await expect(
      review({
        claimId,
        approve: false,
        transferOwnership: false,
        linkOrganizer: false,
        formerOwnerOutcome: "remove_access",
      }),
    ).rejects.toThrow(/rejection reason/i);
    await review({
      claimId,
      approve: false,
      transferOwnership: false,
      linkOrganizer: false,
      formerOwnerOutcome: "remove_access",
      reason: "The evidence does not prove event ownership.",
    });

    expect(
      (await db().doc("events/claimed-event").get()).data()?.["owner"],
    ).toEqual({ type: "user", user_id: owner.uid });
    expect(
      (await db().doc(`event_ownership_claims/${claimId}`).get()).data()?.[
        "status"
      ],
    ).toBe("rejected");
  }, timeoutMs);

  it("can link the public organizer without transferring ownership", async () => {
    const submit = httpsCallable(claimant.functions, "submitEventOwnershipClaim");
    const submitted = await submit({
      eventId: "claimed-event",
      organizationId: "claim-org",
      explanation: "Link our verified organization to the public listing.",
      evidenceUrls: ["https://example.org/club/events"],
      suggestedFormerOwnerOutcome: "retain_editor",
    });
    const claimId = (submitted.data as { claimId: string }).claimId;
    const review = httpsCallable(
      administrator.functions,
      "reviewEventOwnershipClaim",
    );
    await review({
      claimId,
      approve: true,
      transferOwnership: false,
      linkOrganizer: true,
      formerOwnerOutcome: "remove_access",
      reason: "Organizer evidence is sufficient; ownership remains unchanged.",
    });

    const [event, formerOwnerAccess] = await Promise.all([
      db().doc("events/claimed-event").get(),
      db().doc(`events/claimed-event/access/${owner.uid}`).get(),
    ]);
    expect(event.data()?.["owner"]).toEqual({
      type: "user",
      user_id: owner.uid,
    });
    expect(event.data()?.["organizer"]).toEqual(
      expect.objectContaining({
        type: "organization",
        organization: expect.objectContaining({ id: "claim-org" }),
      }),
    );
    expect(formerOwnerAccess.exists).toBe(false);
  }, timeoutMs);
});
