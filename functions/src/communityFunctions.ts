import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { CommunityPageSchema } from "../../src/db/schemas/CommunityPageSchema";
import { CommunitySlugSchema } from "../../src/db/schemas/CommunitySlugSchema";
import { SpotPreviewData } from "../../src/db/schemas/SpotPreviewData";
import {
  COMMUNITY_DEFAULT_IMAGE_PATH,
  COMMUNITY_PAGE_MIN_SPOTS,
  CommunityCandidate,
  buildCommunityBreadcrumbs,
  buildCommunityLandingPath,
  buildCommunityPageDescription,
  buildCommunityPageTitle,
  buildCommunitySlugCandidates,
  getSpotCommunityCandidates,
} from "../../src/scripts/CommunityHelpers";
import { isDrySpotCandidate } from "../../src/scripts/SpotLandingHelpers";
import {
  getSpotCountryDisplayName,
  getSpotLocalityString,
  getSpotName,
  getSpotPreviewImage,
  SpotSchema,
} from "./spotHelpers";

const COMMUNITY_PAGES_COLLECTION = "community_pages";
const COMMUNITY_SLUGS_COLLECTION = "community_slugs";
const MAINTENANCE_COLLECTION = "maintenance";
const SPOTS_COLLECTION = "spots";
const MANUAL_REBUILD_DOC = `${MAINTENANCE_COLLECTION}/run-rebuild-community-pages`;
const DEFAULT_LOCALE = "en";
const MAX_SPOTS_PER_SECTION = 12;

type CommunitySlugDoc = CommunitySlugSchema & { id: string };

const isSpotRuntimeDoc = (docId: string): boolean =>
  docId !== "typesense" && !docId.startsWith("run-");

const isTimestampValue = (
  value:
    | admin.firestore.Timestamp
    | { seconds: number; nanoseconds: number }
    | undefined
    | null
): value is admin.firestore.Timestamp | { seconds: number; nanoseconds: number } => {
  if (!value) {
    return false;
  }

  if (value instanceof Timestamp) {
    return true;
  }

  const adminTimestampCtor = (admin.firestore as unknown as {
    Timestamp?: typeof Timestamp;
  }).Timestamp;

  if (
    typeof adminTimestampCtor === "function" &&
    value instanceof adminTimestampCtor
  ) {
    return true;
  }

  return typeof (value as { seconds?: unknown }).seconds === "number";
};

const removeUndefinedValues = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => removeUndefinedValues(entry))
      .filter((entry) => entry !== undefined) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([entryKey, entryValue]) => [
        entryKey,
        removeUndefinedValues(entryValue),
      ]);

    return Object.fromEntries(entries) as T;
  }

  return value;
};

const toMillis = (
  value:
    | admin.firestore.Timestamp
    | { seconds: number; nanoseconds: number }
    | undefined
    | null
): number => {
  if (!value) {
    return 0;
  }

  if (isTimestampValue(value) && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000);
  }

  return 0;
};

const compareSpotsForCommunity = (left: SpotSchema, right: SpotSchema): number => {
  const leftRating = left.rating ?? 0;
  const rightRating = right.rating ?? 0;
  if (rightRating !== leftRating) {
    return rightRating - leftRating;
  }

  const leftReviews = left.num_reviews ?? 0;
  const rightReviews = right.num_reviews ?? 0;
  if (rightReviews !== leftReviews) {
    return rightReviews - leftReviews;
  }

  return getSpotName(left, DEFAULT_LOCALE).localeCompare(
    getSpotName(right, DEFAULT_LOCALE)
  );
};

const buildSpotPreview = (
  spotId: string,
  spot: SpotSchema
): SpotPreviewData =>
  removeUndefinedValues({
    id: spotId as SpotPreviewData["id"],
    slug: spot.slug,
    name: getSpotName(spot, DEFAULT_LOCALE),
    location: spot.location,
    location_raw: spot.location_raw,
    type: spot.type,
    access: spot.access,
    locality: getSpotLocalityString(spot),
    countryCode: spot.address?.country?.code,
    countryName: getSpotCountryDisplayName(spot),
    imageSrc: getSpotPreviewImage(spot),
    isIconic: spot.is_iconic ?? false,
    hideStreetview: spot.hide_streetview,
    rating: spot.rating,
    amenities: spot.amenities,
    bounds: spot.bounds,
    bounds_raw: spot.bounds_raw,
  }) as SpotPreviewData;

const isSpotPartOfCommunity = (
  spot: SpotSchema,
  candidate: CommunityCandidate
): boolean => {
  const spotCandidates = getSpotCommunityCandidates(spot);
  return spotCandidates.some(
    (spotCandidate) => spotCandidate.communityKey === candidate.communityKey
  );
};

const getSourceMaxUpdatedAt = (
  spots: SpotSchema[]
): admin.firestore.Timestamp | null => {
  const latestMillis = spots.reduce((maxMillis, spot) => {
    const updatedMillis = Math.max(
      toMillis(spot.time_updated),
      toMillis(spot.time_created as admin.firestore.Timestamp | undefined)
    );
    return Math.max(maxMillis, updatedMillis);
  }, 0);

  return latestMillis > 0
    ? Timestamp.fromMillis(latestMillis)
    : null;
};

const getExistingCommunitySlugs = async (
  db: admin.firestore.Firestore,
  communityKey: string
): Promise<CommunitySlugDoc[]> => {
  const snapshot = await db
    .collection(COMMUNITY_SLUGS_COLLECTION)
    .where("communityKey", "==", communityKey)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as CommunitySlugSchema),
  }));
};

const getConflictingCountryCode = async (
  db: admin.firestore.Firestore,
  candidateSlug: string,
  communityKey: string
): Promise<string | null> => {
  const conflictingSlug = await db
    .collection(COMMUNITY_SLUGS_COLLECTION)
    .doc(candidateSlug)
    .get();

  if (!conflictingSlug.exists) {
    return null;
  }

  const conflictingData = conflictingSlug.data() as CommunitySlugSchema | undefined;
  if (!conflictingData || conflictingData.communityKey === communityKey) {
    return null;
  }

  const conflictingPage = await db
    .collection(COMMUNITY_PAGES_COLLECTION)
    .doc(conflictingData.communityKey)
    .get();

  return (
    (conflictingPage.data() as CommunityPageSchema | undefined)?.geography
      ?.countryCode ?? null
  );
};

const choosePreferredSlug = async (
  db: admin.firestore.Firestore,
  candidate: CommunityCandidate,
  existingSlugs: CommunitySlugDoc[],
  existingPage?: CommunityPageSchema | null
): Promise<string> => {
  const existingPreferredSlug =
    existingSlugs.find((slug) => slug.isPreferred)?.id ||
    existingPage?.preferredSlug;

  if (existingPreferredSlug) {
    return existingPreferredSlug;
  }

  const baseCandidate =
    buildCommunitySlugCandidates(candidate)[0] || `community-${Date.now()}`;
  const conflictingCountryCode = await getConflictingCountryCode(
    db,
    baseCandidate,
    candidate.communityKey
  );

  for (const slug of buildCommunitySlugCandidates(candidate, conflictingCountryCode)) {
    const existingSlugDoc = await db
      .collection(COMMUNITY_SLUGS_COLLECTION)
      .doc(slug)
      .get();

    if (!existingSlugDoc.exists) {
      return slug;
    }

    const existingData = existingSlugDoc.data() as CommunitySlugSchema | undefined;
    if (existingData?.communityKey === candidate.communityKey) {
      return slug;
    }
  }

  return `${baseCandidate}-${Date.now()}`;
};

const syncCommunitySlugs = async (
  db: admin.firestore.Firestore,
  candidate: CommunityCandidate,
  communityKey: string,
  preferredSlug: string,
  existingSlugs: CommunitySlugDoc[]
): Promise<string[]> => {
  const batch = db.batch();
  const desiredSlugs = new Set<string>([
    preferredSlug,
    ...buildCommunitySlugCandidates(candidate),
    ...existingSlugs.map((slug) => slug.id),
  ]);
  const createdAtBySlug = new Map(
    existingSlugs.map((slug) => [slug.id, slug.createdAt ?? null])
  );
  const syncedSlugs = new Set<string>();

  for (const slug of desiredSlugs) {
    const slugRef = db.collection(COMMUNITY_SLUGS_COLLECTION).doc(slug);
    const existingSlugSnapshot = await slugRef.get();
    const existingSlugData = existingSlugSnapshot.data() as
      | CommunitySlugSchema
      | undefined;

    if (existingSlugData && existingSlugData.communityKey !== communityKey) {
      continue;
    }

    batch.set(
      slugRef,
      {
        communityKey,
        isPreferred: slug === preferredSlug,
        createdAt:
          createdAtBySlug.get(slug) ?? FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    syncedSlugs.add(slug);
  }

  await batch.commit();

  return [...syncedSlugs].sort((left, right) => {
    if (left === preferredSlug) {
      return -1;
    }
    if (right === preferredSlug) {
      return 1;
    }
    return left.localeCompare(right);
  });
};

/**
 * Compute a `bounds_center` (lat/lng centroid) and `bounds_radius_m`
 * (distance from centroid to farthest spot, +25% buffer, min 1 km) for
 * the spots in a community. Used by the map-island to surface the
 * community automatically when its area intersects the visible viewport.
 *
 * Returns `null` if no spot has a usable location — in that case the
 * fields are omitted and the community simply doesn't auto-surface
 * (it's still reachable via its explicit `/map/community/<slug>` route).
 *
 * Centroid uses an arithmetic mean which is approximate but fine at
 * city / country scale; for the use case (deciding which community to
 * highlight for a viewport) this is plenty.
 */
const computeCommunityBounds = (
  spots: SpotSchema[]
): { bounds_center: [number, number]; bounds_radius_m: number } | null => {
  const points: Array<{ lat: number; lng: number }> = [];
  for (const spot of spots) {
    if (
      spot.location_raw &&
      typeof spot.location_raw.lat === "number" &&
      typeof spot.location_raw.lng === "number"
    ) {
      points.push({
        lat: spot.location_raw.lat,
        lng: spot.location_raw.lng,
      });
      continue;
    }
    const loc = spot.location as
      | { latitude?: number; longitude?: number; _latitude?: number; _longitude?: number }
      | undefined;
    if (loc) {
      const lat = loc.latitude ?? loc._latitude;
      const lng = loc.longitude ?? loc._longitude;
      if (typeof lat === "number" && typeof lng === "number") {
        points.push({ lat, lng });
      }
    }
  }

  if (points.length === 0) return null;

  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  );
  const center = {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length,
  };

  const R = 6371e3;
  const distances = points.map((p) => {
    const φ1 = (center.lat * Math.PI) / 180;
    const φ2 = (p.lat * Math.PI) / 180;
    const Δφ = ((p.lat - center.lat) * Math.PI) / 180;
    const Δλ = ((p.lng - center.lng) * Math.PI) / 180;
    const h =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  });
  const maxDistanceM = distances.length > 0 ? Math.max(...distances) : 0;
  const radius = Math.max(1000, Math.round(maxDistanceM * 1.25));

  return {
    bounds_center: [center.lat, center.lng],
    bounds_radius_m: radius,
  };
};

const getCountryPagePath = async (
  db: admin.firestore.Firestore,
  countryKey: string,
  countryFallbackSlug: string | undefined
): Promise<string | null> => {
  const existingSlugs = await getExistingCommunitySlugs(db, countryKey);
  const preferredSlug = existingSlugs.find((slug) => slug.isPreferred)?.id;

  if (preferredSlug) {
    return buildCommunityLandingPath(preferredSlug);
  }

  if (countryFallbackSlug) {
    return buildCommunityLandingPath(countryFallbackSlug);
  }

  return null;
};

const buildCommunityPageDoc = async (
  db: admin.firestore.Firestore,
  candidate: CommunityCandidate,
  spots: Array<{ id: string; data: SpotSchema }>
): Promise<CommunityPageSchema | null> => {
  if (spots.length < COMMUNITY_PAGE_MIN_SPOTS) {
    return null;
  }

  const existingPageSnapshot = await db
    .collection(COMMUNITY_PAGES_COLLECTION)
    .doc(candidate.communityKey)
    .get();
  const existingPage = existingPageSnapshot.exists
    ? ((existingPageSnapshot.data() as CommunityPageSchema) ?? null)
    : null;

  const existingSlugs = await getExistingCommunitySlugs(db, candidate.communityKey);
  const preferredSlug = await choosePreferredSlug(
    db,
    candidate,
    existingSlugs,
    existingPage
  );
  const allSlugs = await syncCommunitySlugs(
    db,
    candidate,
    candidate.communityKey,
    preferredSlug,
    existingSlugs
  );

  const sortedSpots = [...spots].sort((left, right) =>
    compareSpotsForCommunity(left.data, right.data)
  );
  const ratedSpots = sortedSpots.filter((spot) => (spot.data.rating ?? 0) > 0);
  const drySpots = sortedSpots.filter((spot) =>
    spot.data.landing?.isDry === true || isDrySpotCandidate(spot.data)
  );
  const canonicalPath = buildCommunityLandingPath(preferredSlug);
  const countryPagePath =
    candidate.scope === "locality"
      ? await getCountryPagePath(
          db,
          `country:${candidate.geography.countryCode?.toLowerCase()}`,
          candidate.geography.countrySlug
        )
      : null;

  const sourceSpots = spots.map((spot) => spot.data);
  const sourceMaxUpdatedAt = getSourceMaxUpdatedAt(sourceSpots);
  const communityBounds = computeCommunityBounds(sourceSpots);
  const image = existingPage?.image?.url
    ? existingPage.image
    : {
        type: "default" as const,
        url: COMMUNITY_DEFAULT_IMAGE_PATH,
      };

  return removeUndefinedValues({
    communityKey: candidate.communityKey,
    scope: candidate.scope,
    displayName: candidate.displayName,
    preferredSlug,
    allSlugs,
    canonicalPath,
    title: buildCommunityPageTitle(
      candidate.scope,
      candidate.displayName,
      candidate.geography
    ),
    description: buildCommunityPageDescription(
      candidate.scope,
      candidate.displayName,
      candidate.geography,
      sourceSpots.length,
      drySpots.length
    ),
    geography: candidate.geography,
    breadcrumbs: buildCommunityBreadcrumbs(
      {
        scope: candidate.scope,
        displayName: candidate.displayName,
        canonicalPath,
        geography: candidate.geography,
      },
      countryPagePath
    ),
    relationships: {
      parentKeys:
        candidate.scope === "locality" && candidate.geography.countryCode
          ? [`country:${candidate.geography.countryCode.toLowerCase()}`]
          : existingPage?.relationships?.parentKeys ?? [],
      childKeys: existingPage?.relationships?.childKeys ?? [],
      relatedKeys: existingPage?.relationships?.relatedKeys ?? [],
    },
    counts: {
      totalSpots: sourceSpots.length,
      topRated: ratedSpots.length,
      dry: drySpots.length,
    },
    topRatedSpots: ratedSpots
      .slice(0, MAX_SPOTS_PER_SECTION)
      .map((spot) => buildSpotPreview(spot.id, spot.data)),
    drySpots: drySpots
      .slice(0, MAX_SPOTS_PER_SECTION)
      .map((spot) => buildSpotPreview(spot.id, spot.data)),
    links: existingPage?.links ?? {},
    resources: existingPage?.resources ?? [],
    organisations: existingPage?.organisations ?? [],
    athletes: existingPage?.athletes ?? [],
    events: existingPage?.events ?? [],
    image,
    published: true,
    generatedAt: Timestamp.now(),
    sourceMaxUpdatedAt: sourceMaxUpdatedAt ?? undefined,
    bounds_center: communityBounds?.bounds_center,
    bounds_radius_m: communityBounds?.bounds_radius_m,
  }) as CommunityPageSchema;
};

const fetchSpotsForCommunity = async (
  db: admin.firestore.Firestore,
  candidate: CommunityCandidate
): Promise<Array<{ id: string; data: SpotSchema }>> => {
  if (!candidate.geography.countryCode) {
    return [];
  }

  const countrySpots = await db
    .collection(SPOTS_COLLECTION)
    .where("landing.countryCode", "==", candidate.geography.countryCode)
    .get();

  return countrySpots.docs
    .filter((doc) => isSpotRuntimeDoc(doc.id))
    .map((doc) => ({ id: doc.id, data: doc.data() as SpotSchema }))
    .filter((spot) => isSpotPartOfCommunity(spot.data, candidate));
};

const writeOrDeleteCommunityPage = async (
  db: admin.firestore.Firestore,
  candidate: CommunityCandidate
): Promise<void> => {
  const spots = await fetchSpotsForCommunity(db, candidate);
  const pageDoc = await buildCommunityPageDoc(db, candidate, spots);
  const pageRef = db.collection(COMMUNITY_PAGES_COLLECTION).doc(candidate.communityKey);

  if (!pageDoc) {
    await pageRef.delete().catch(() => undefined);
    return;
  }

  await pageRef.set(pageDoc, { merge: true });
};

const collectGeneratedCommunities = (
  spots: Array<{ id: string; data: SpotSchema }>
): Map<string, { candidate: CommunityCandidate; spots: Array<{ id: string; data: SpotSchema }> }> => {
  const communities = new Map<
    string,
    { candidate: CommunityCandidate; spots: Array<{ id: string; data: SpotSchema }> }
  >();

  for (const spot of spots) {
    for (const candidate of getSpotCommunityCandidates(spot.data)) {
      const existing = communities.get(candidate.communityKey);
      if (existing) {
        existing.spots.push(spot);
        continue;
      }

      communities.set(candidate.communityKey, {
        candidate,
        spots: [spot],
      });
    }
  }

  return communities;
};

export const rebuildCommunityPagesOnSpotWrite = onDocumentWritten(
  { document: "spots/{spotId}" },
  async (event) => {
    if (!isSpotRuntimeDoc(String(event.params.spotId ?? ""))) {
      return null;
    }

    const db = admin.firestore();
    const impactedCandidates = new Map<string, CommunityCandidate>();
    const beforeData = event.data?.before?.exists
      ? ((event.data.before.data() as SpotSchema) ?? null)
      : null;
    const afterData = event.data?.after?.exists
      ? ((event.data.after.data() as SpotSchema) ?? null)
      : null;

    if (beforeData) {
      for (const candidate of getSpotCommunityCandidates(beforeData)) {
        impactedCandidates.set(candidate.communityKey, candidate);
      }
    }

    if (afterData) {
      for (const candidate of getSpotCommunityCandidates(afterData)) {
        impactedCandidates.set(candidate.communityKey, candidate);
      }
    }

    for (const candidate of impactedCandidates.values()) {
      await writeOrDeleteCommunityPage(db, candidate);
    }

    return null;
  }
);

export const rebuildAllCommunityPages = onDocumentCreated(
  { document: MANUAL_REBUILD_DOC },
  async (event) => {
    const db = admin.firestore();
    const spotsSnapshot = await db.collection(SPOTS_COLLECTION).get();
    const spots = spotsSnapshot.docs
      .filter((doc) => isSpotRuntimeDoc(doc.id))
      .map((doc) => ({
        id: doc.id,
        data: doc.data() as SpotSchema,
      }));
    const communities = collectGeneratedCommunities(spots);
    const writtenKeys = new Set<string>();

    for (const { candidate, spots: candidateSpots } of communities.values()) {
      const pageDoc = await buildCommunityPageDoc(db, candidate, candidateSpots);
      const pageRef = db.collection(COMMUNITY_PAGES_COLLECTION).doc(candidate.communityKey);

      if (!pageDoc) {
        await pageRef.delete().catch(() => undefined);
        continue;
      }

      await pageRef.set(pageDoc, { merge: true });
      writtenKeys.add(candidate.communityKey);
    }

    const existingPages = await db.collection(COMMUNITY_PAGES_COLLECTION).get();
    for (const page of existingPages.docs) {
      if (page.id.startsWith("run-")) {
        continue;
      }
      if (!writtenKeys.has(page.id)) {
        await page.ref.delete().catch(() => undefined);
      }
    }

    await event.data?.ref.set(
      {
        status: "DONE",
        generated_count: writtenKeys.size,
        completed_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
);
