export const HIGH_VOLUME_IMPORT_THRESHOLD = 100;

export interface ImportPolicyReview {
  permissionStatus: "yes" | "no" | null;
  spotCount: number;
  publicSourceConfirmed: boolean;
  contactAttempted: boolean;
  contactTarget: string;
  noObjectionReceived: boolean;
  removalOnRequestConfirmed: boolean;
  highVolumeReviewConfirmed: boolean;
  viewerMapId?: string;
}

export function isHighVolumeImport(spotCount: number): boolean {
  return spotCount > HIGH_VOLUME_IMPORT_THRESHOLD;
}

export function validateImportPolicy(
  review: ImportPolicyReview
): string | null {
  if (!review.permissionStatus) {
    return "Please answer whether you have permission to import this data.";
  }

  if (review.permissionStatus === "yes") {
    return null;
  }

  if (!review.publicSourceConfirmed) {
    return "Confirm that the source map was publicly shared for the parkour community.";
  }
  if (!review.contactAttempted) {
    return "Confirm that you made a reasonable effort to identify and contact the source creator.";
  }
  if (!review.contactTarget.trim()) {
    return "Record who or which account you tried to contact.";
  }
  if (!review.noObjectionReceived) {
    return "Confirm that PK Spot has not received an objection or removal request.";
  }
  if (!review.removalOnRequestConfirmed) {
    return "Confirm that PK Spot will promptly correct or remove the imported data on request.";
  }
  if (!review.viewerMapId) {
    return "Add the original Google My Maps viewer ID so every imported Spot can link back to its source.";
  }
  if (
    isHighVolumeImport(review.spotCount) &&
    !review.highVolumeReviewConfirmed
  ) {
    return "Complete the heightened review for this import of more than 100 spots.";
  }

  return null;
}

export function extractGoogleMyMapsId(
  value: string | null | undefined
): string | undefined {
  const raw = (value ?? "").trim();
  if (!raw) {
    return undefined;
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw.replaceAll("&amp;", "&"));
      const mid = parsed.searchParams.get("mid");
      if (mid) {
        return mid.trim();
      }
    }
  } catch {
    // Fall through to text parsing for URLs embedded in KML/XML.
  }

  const midMatch = raw.match(
    /(?:[?&]|&amp;)mid=([A-Za-z0-9_-]{8,})/i
  );
  if (midMatch?.[1]) {
    return midMatch[1];
  }

  const candidate = raw.replace(/^@+/, "").trim();
  if (/^[A-Za-z0-9_-]{8,}$/.test(candidate)) {
    return candidate;
  }

  return undefined;
}
