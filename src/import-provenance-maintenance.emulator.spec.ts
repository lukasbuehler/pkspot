import * as admin from "firebase-admin";
import {afterAll, describe, expect, it} from "vitest";

const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const runWithEmulator = firestoreHost ? describe : describe.skip;
let app: admin.app.App | undefined;
const createdReferences: admin.firestore.DocumentReference[] = [];

const db = (): admin.firestore.Firestore => {
  app ??= admin.initializeApp(
    {projectId: process.env["GCLOUD_PROJECT"] ?? "demo-pkspot"},
    `import-provenance-${Date.now()}`,
  );
  return admin.firestore(app);
};

const waitForDone = async (
  previousEventId: string | null,
): Promise<admin.firestore.DocumentData> => {
  const deadline = Date.now() + 20_000;
  const state = db().doc("maintenance/public-import-provenance-backfill");
  while (Date.now() < deadline) {
    const snapshot = await state.get();
    const data = snapshot.data();
    if (
      data?.["status"] === "DONE" &&
      typeof data["active_event_id"] === "string" &&
      data["active_event_id"] !== previousEventId
    ) return data;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the provenance backfill");
};

const waitForProjectionFields = async (
  references: admin.firestore.DocumentReference[],
): Promise<void> => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const snapshots = await Promise.all(references.map((ref) => ref.get()));
    if (snapshots.every((snapshot) =>
      Object.hasOwn(snapshot.data() ?? {}, "public_import_provenance")
    )) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for live provenance projections");
};

runWithEmulator("public import provenance maintenance", () => {
  afterAll(async () => {
    await Promise.all(
      createdReferences.map((reference) =>
        reference.delete().catch(() => undefined),
      ),
    );
    if (app) await app.delete();
  });

  it("dry-runs, writes tri-state projections, and reruns idempotently", async () => {
    const store = db();
    const suffix = Date.now().toString(36);
    const attributedImport = `attributed-${suffix}`;
    const uncreditedImport = `uncredited-${suffix}`;
    const attributedSpot = store.doc(`spots/provenance-attributed-${suffix}`);
    const uncreditedSpot = store.doc(`spots/provenance-uncredited-${suffix}`);
    const ordinarySpot = store.doc(`spots/provenance-ordinary-${suffix}`);
    const attributedImportRef = store.doc(`imports/${attributedImport}`);
    const uncreditedImportRef = store.doc(`imports/${uncreditedImport}`);
    createdReferences.push(
      attributedSpot,
      uncreditedSpot,
      ordinarySpot,
      attributedImportRef,
      uncreditedImportRef,
    );

    await Promise.all([
      attributedSpot.set({
        name: {en: "Attributed"},
        import_id: attributedImport,
        source: attributedImport,
      }),
      uncreditedSpot.set({
        name: {en: "Uncredited"},
        source: uncreditedImport,
      }),
      ordinarySpot.set({name: {en: "Ordinary"}, source: "pkspot"}),
    ]);
    await Promise.all([
      attributedImportRef.set({
        credits: {
          source_name: "Community Source",
          attribution_text: "Used with permission",
        },
        viewer_url: "https://example.test/map",
      }),
      uncreditedImportRef.set({credits: {}}),
    ]);
    await waitForProjectionFields([attributedSpot]);
    await attributedSpot.update({
      public_import_provenance: admin.firestore.FieldValue.delete(),
    });

    const trigger = store.doc(
      "maintenance/run-backfill-public-import-provenance",
    );
    const previousEventId = (await store.doc(
      "maintenance/public-import-provenance-backfill",
    ).get()).data()?.["active_event_id"];
    await trigger.set({dry_run: true, page_size: 2});
    const dryRun = await waitForDone(
      typeof previousEventId === "string" ? previousEventId : null,
    );
    expect(dryRun["dry_run"]).toBe(true);
    expect(dryRun["counts"]).toMatchObject({changed: 2, written: 0});
    expect((await attributedSpot.get()).data()).not.toHaveProperty(
      "public_import_provenance",
    );

    await trigger.set({dry_run: false, page_size: 2});
    const liveRun = await waitForDone(dryRun["active_event_id"]);
    expect(liveRun["dry_run"]).toBe(false);
    expect(liveRun["counts"]).toMatchObject({changed: 2, written: 2});
    expect((await attributedSpot.get()).data()?.["public_import_provenance"])
      .toEqual({
        source_name: "Community Source",
        attribution_text: "Used with permission",
        viewer_url: "https://example.test/map",
      });
    expect((await uncreditedSpot.get()).data()?.["public_import_provenance"])
      .toBeNull();
    expect((await ordinarySpot.get()).data()).not.toHaveProperty(
      "public_import_provenance",
    );

    await trigger.set({dry_run: false, page_size: 2});
    const rerun = await waitForDone(liveRun["active_event_id"]);
    expect(rerun["counts"]).toMatchObject({changed: 0, written: 0});
  }, 30_000);
});
