import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import {
  makeManagedSpotIndexData,
  makeOrganizationReference,
  makeVerifiedSpotIndexData,
  SpotManagementData,
  SpotStewardshipData,
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
 * Keep denormalized spot badges and organization-owned spot indexes fresh when
 * an organization changes its public identity fields.
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
    const [stewardedSnapshot, managedSnapshot] = await Promise.all([
      db
        .collection("spots")
        .where("stewardship.organization_ids", "array-contains", organizationId)
        .get(),
      db
        .collection("spots")
        .where("management.organization_id", "==", organizationId)
        .get(),
    ]);

    let batch = db.batch();
    let batchWrites = 0;
    let stewardedCount = 0;
    let managedCount = 0;

    async function commitIfNeeded(force = false): Promise<void> {
      if (batchWrites === 0 || (!force && batchWrites < BATCH_LIMIT)) return;
      await batch.commit();
      batch = db.batch();
      batchWrites = 0;
    }

    for (const spotDoc of stewardedSnapshot.docs) {
      const spotData = spotDoc.data() as Record<string, unknown>;
      const stewardship = spotData["stewardship"] as
        | { organizations?: Record<string, SpotStewardshipData> }
        | undefined;
      const currentSteward = stewardship?.organizations?.[organizationId];
      if (!currentSteward) continue;

      const steward: SpotStewardshipData = {
        ...currentSteward,
        status: "active",
        organization_id: organizationId,
        organization,
      };
      const updatedAt = FieldValue.serverTimestamp();

      batch.update(spotDoc.ref, {
        [`stewardship.organizations.${organizationId}`]: steward,
        verification: FieldValue.delete(),
      });
      batch.set(
        db.doc(`organizations/${organizationId}/verified_spots/${spotDoc.id}`),
        makeVerifiedSpotIndexData(spotDoc.id, spotData, steward, updatedAt),
        { merge: true }
      );
      batchWrites += 2;
      stewardedCount++;
      await commitIfNeeded();
    }

    for (const spotDoc of managedSnapshot.docs) {
      const spotData = spotDoc.data() as Record<string, unknown>;
      const currentManagement = spotData["management"] as
        | SpotManagementData
        | undefined;
      if (!currentManagement) continue;

      const management: SpotManagementData = {
        ...currentManagement,
        status: "managed",
        organization_id: organizationId,
        organization,
        lock_edits: true,
      };
      const updatedAt = FieldValue.serverTimestamp();

      batch.update(spotDoc.ref, { management, verification: FieldValue.delete() });
      batch.set(
        db.doc(`organizations/${organizationId}/managed_spots/${spotDoc.id}`),
        makeManagedSpotIndexData(spotDoc.id, spotData, management, updatedAt),
        { merge: true }
      );
      batchWrites += 2;
      managedCount++;
      await commitIfNeeded();
    }

    await commitIfNeeded(true);
    console.log(
      `Synced organization snapshots for ${organizationId}: ${stewardedCount} stewarded, ${managedCount} managed.`
    );
  }
);
