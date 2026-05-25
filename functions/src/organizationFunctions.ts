import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import {
  makeOrganizationReference,
  makeVerifiedSpotIndexData,
  SpotVerificationData,
} from "./organizationVerificationHelpers";

const BATCH_LIMIT = 450;

function organizationSnapshotFieldsChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): boolean {
  return (
    before["name"] !== after["name"] ||
    before["slug"] !== after["slug"] ||
    before["logo_url"] !== after["logo_url"] ||
    before["logo_background_color"] !== after["logo_background_color"]
  );
}

/**
 * Keep denormalized spot verification badges and the organization-owned spot
 * index fresh when an organization changes its public identity fields.
 */
export const syncVerifiedSpotOrganizationSnapshots = onDocumentUpdated(
  "organizations/{organizationId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    const organizationId = event.params.organizationId;

    if (!before || !after || !organizationSnapshotFieldsChanged(before, after)) {
      return;
    }

    const db = admin.firestore();
    const organization = makeOrganizationReference(organizationId, after);
    const spotsSnapshot = await db
      .collection("spots")
      .where("verification.organization_id", "==", organizationId)
      .get();

    let batch = db.batch();
    let batchWrites = 0;
    let updatedCount = 0;

    async function commitIfNeeded(force = false): Promise<void> {
      if (batchWrites === 0 || (!force && batchWrites < BATCH_LIMIT)) {
        return;
      }
      await batch.commit();
      batch = db.batch();
      batchWrites = 0;
    }

    for (const spotDoc of spotsSnapshot.docs) {
      const spotData = spotDoc.data() as Record<string, unknown>;
      const currentVerification = spotData["verification"] as
        | SpotVerificationData
        | undefined;
      if (!currentVerification) continue;

      const verification: SpotVerificationData = {
        ...currentVerification,
        status: "verified",
        organization_id: organizationId,
        organization,
        lock_edits: true,
      };
      const updatedAt = FieldValue.serverTimestamp();

      batch.update(spotDoc.ref, { verification });
      batch.set(
        db.doc(`organizations/${organizationId}/verified_spots/${spotDoc.id}`),
        makeVerifiedSpotIndexData(spotDoc.id, spotData, verification, updatedAt),
        { merge: true }
      );
      batchWrites += 2;
      updatedCount++;
      await commitIfNeeded();
    }

    await commitIfNeeded(true);
    console.log(
      `Synced organization verification snapshots for ${updatedCount} spots in ${organizationId}.`
    );
  }
);
