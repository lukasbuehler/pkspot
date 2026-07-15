import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const MAX_IMPORT_ID_LENGTH = 180;
const MAX_PUBLIC_TEXT_LENGTH = 2_000;

type PublicImportProvenanceResponse = {
  source_name: string;
  attribution_text?: string;
  website_url?: string;
  instagram_url?: string;
  source_url?: string;
  viewer_url?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const publicText = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();
  return text ? text.slice(0, MAX_PUBLIC_TEXT_LENGTH) : undefined;
};

/**
 * Returns only provenance safe to show for an import referenced by a public spot.
 * The imports collection remains private because it also stores uploader and
 * review data.
 */
export const getPublicImportProvenance = onCall(
  { cors: true, invoker: "public" },
  async (request): Promise<PublicImportProvenanceResponse | null> => {
    const data = request.data;
    const importId = isRecord(data) ? publicText(data["importId"]) : undefined;
    if (!importId || importId.length > MAX_IMPORT_ID_LENGTH) {
      throw new HttpsError("invalid-argument", "A valid importId is required.");
    }

    const db = admin.firestore();
    const publicSpotReference = await db
      .collection("spots")
      .where("source", "==", importId)
      .limit(1)
      .get();
    if (publicSpotReference.empty) {
      return null;
    }

    const importSnapshot = await db.collection("imports").doc(importId).get();
    const importData = importSnapshot.data();
    const credits = isRecord(importData?.["credits"])
      ? importData["credits"]
      : null;
    const sourceName = publicText(credits?.["source_name"]);
    if (!sourceName) {
      return null;
    }

    const attributionText = publicText(credits?.["attribution_text"]);
    const websiteUrl = publicText(credits?.["website_url"]);
    const instagramUrl = publicText(credits?.["instagram_url"]);
    const sourceUrl = publicText(importData?.["source_url"]);
    const viewerUrl = publicText(importData?.["viewer_url"]);

    return {
      source_name: sourceName,
      ...(attributionText ? { attribution_text: attributionText } : {}),
      ...(websiteUrl ? { website_url: websiteUrl } : {}),
      ...(instagramUrl ? { instagram_url: instagramUrl } : {}),
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
      ...(viewerUrl ? { viewer_url: viewerUrl } : {}),
    };
  }
);
