import * as admin from "firebase-admin";
import { defineString } from "firebase-functions/params";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { info } from "firebase-functions/logger";
import type { CommunityPageSchema } from "../../src/db/schemas/CommunityPageSchema";
import { canEnrichPlace, enrichPlaceNames, placeFingerprint } from "./communityPlaceNames";
import { enqueueCommunityPlace, enqueueCommunityPlaceBatch, processCommunityPlaces } from "./communityPlaceLocalizationStore";

const username = defineString("GEONAMES_USERNAME", { default: "" });

export const enqueueCommunityPlaceLocalization = onDocumentWritten(
  { document: "community_pages/{communityKey}", region: "europe-west1" },
  async (event) => {
    const after = event.data?.after.data() as CommunityPageSchema | undefined;
    const before = event.data?.before.data() as CommunityPageSchema | undefined;
    if (!canEnrichPlace(after)) return;
    if (canEnrichPlace(before) && placeFingerprint(before) === placeFingerprint(after)) return;
    await enqueueCommunityPlace(admin.firestore(), event.params.communityKey);
  },
);

export const enrichCommunityPlaceLocalizations = onSchedule(
  { schedule: "every 60 minutes", region: "europe-west1", timeoutSeconds: 540, maxInstances: 1 },
  async () => {
    if (!username.value()) return;
    const counts = await processCommunityPlaces(admin.firestore(), (page) => enrichPlaceNames(page, username.value()));
    info("Community place localization batch", counts);
  },
);

// Explicit admin maintenance; never run a production backfill just by deploying.
export const backfillCommunityPlaceLocalizations = onCall(
  { region: "europe-west1", enforceAppCheck: true, timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const user = await admin.firestore().doc(`users/${request.auth.uid}`).get();
    if (user.data()?.is_admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
    const after: unknown = request.data?.startAfter;
    if (after !== undefined && (typeof after !== "string" || after.length > 200 || after.includes("/"))) {
      throw new HttpsError("invalid-argument", "Invalid pagination cursor.");
    }
    return enqueueCommunityPlaceBatch(admin.firestore(), after as string | undefined);
  },
);
