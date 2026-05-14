import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { CommunityPageSchema } from "../../src/db/schemas/CommunityPageSchema";
import {
  CommunityChildSummarySchema,
  CommunityEventPreviewSchema,
} from "../../src/db/schemas/CommunityPageSchema";
import { CommunitySlugSchema } from "../../src/db/schemas/CommunitySlugSchema";
import { EventSchema } from "../../src/db/schemas/EventSchema";
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
import { computeCommunityBounds } from "../../src/scripts/CommunityBoundsHelpers";
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
const EVENTS_COLLECTION = "events";
const SPOTS_COLLECTION = "spots";
const MANUAL_REBUILD_DOC = `${MAINTENANCE_COLLECTION}/run-rebuild-community-pages`;
const DEFAULT_LOCALE = "en";
const MAX_SPOTS_PER_SECTION = 8;
const MAX_CHILD_COMMUNITIES = 8;
const MAX_COMMUNITY_EVENT_PREVIEWS = 2;
const COMMUNITY_EVENT_LOOKAHEAD_MONTHS = 6;

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

const buildCommunityChildSummary = (
  pageId: string,
  page: CommunityPageSchema
): CommunityChildSummarySchema =>
  removeUndefinedValues({
    communityKey: page.communityKey || pageId,
    scope: page.scope,
    displayName: page.displayName,
    preferredSlug: page.preferredSlug,
    canonicalPath:
      page.canonicalPath || buildCommunityLandingPath(page.preferredSlug),
    totalSpotCount: page.counts?.totalSpots ?? 0,
    dryCount: page.counts?.dry ?? 0,
  }) as CommunityChildSummarySchema;

const getEmbeddedChildCommunities = async (
  db: admin.firestore.Firestore,
  parentCommunityKey: string
): Promise<CommunityChildSummarySchema[]> => {
  const snapshot = await db
    .collection(COMMUNITY_PAGES_COLLECTION)
    .where("relationships.parentKeys", "array-contains", parentCommunityKey)
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() as CommunityPageSchema,
    }))
    .filter(({ data }) => data.published !== false)
    .map(({ id, data }) => buildCommunityChildSummary(id, data))
    .sort((left, right) => {
      if (right.totalSpotCount !== left.totalSpotCount) {
        return right.totalSpotCount - left.totalSpotCount;
      }
      return left.displayName.localeCompare(right.displayName);
    })
    .slice(0, MAX_CHILD_COMMUNITIES);
};

const buildCommunityEventPreview = (
  eventId: string,
  event: EventSchema
): CommunityEventPreviewSchema | null => {
  if (!isTimestampValue(event.start) || !isTimestampValue(event.end)) {
    return null;
  }

  return removeUndefinedValues({
    id: eventId,
    slug: event.slug,
    name: event.name,
    banner_src: event.banner_src,
    banner_fit: event.banner_fit,
    banner_accent_color: event.banner_accent_color,
    venue_string: event.venue_string,
    locality_string: event.locality_string,
    start: event.start,
    end: event.end,
    url: event.url,
    bounds: event.bounds,
    sponsor: event.sponsor,
    is_sponsored: event.is_sponsored,
    external_source: event.external_source,
  }) as CommunityEventPreviewSchema;
};

const getCommunityEventPreviews = async (
  db: admin.firestore.Firestore,
  communityKey: string,
  now: admin.firestore.Timestamp = Timestamp.now()
): Promise<CommunityEventPreviewSchema[]> => {
  const cutoff = new Date(now.toMillis());
  cutoff.setMonth(cutoff.getMonth() + COMMUNITY_EVENT_LOOKAHEAD_MONTHS);
  const cutoffMillis = cutoff.getTime();

  const snapshot = await db
    .collection(EVENTS_COLLECTION)
    .where("community_keys", "array-contains", communityKey)
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() as EventSchema,
    }))
    .filter(({ data }) => data.published !== false)
    .filter(({ data }) => {
      const endMillis = toMillis(data.end);
      const startMillis = toMillis(data.start);
      return (
        endMillis >= now.toMillis() &&
        startMillis > 0 &&
        startMillis <= cutoffMillis
      );
    })
    .sort((left, right) => toMillis(left.data.start) - toMillis(right.data.start))
    .slice(0, MAX_COMMUNITY_EVENT_PREVIEWS)
    .map(({ id, data }) => buildCommunityEventPreview(id, data))
    .filter((preview): preview is CommunityEventPreviewSchema => preview !== null);
};

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
  const childCommunities =
    candidate.scope === "country"
      ? await getEmbeddedChildCommunities(db, candidate.communityKey)
      : [];
  const eventPreviews = await getCommunityEventPreviews(db, candidate.communityKey);

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
    childCommunities,
    eventPreviews,
    image,
    published: true,
    generatedAt: Timestamp.now(),
    sourceMaxUpdatedAt: sourceMaxUpdatedAt ?? undefined,
    bounds_center: communityBounds?.bounds_center,
    bounds_radius_m: communityBounds?.bounds_radius_m,
    google_maps_place_id: existingPage?.google_maps_place_id,
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

const getCountryCommunityKey = (
  candidate: CommunityCandidate
): string | null => {
  const countryCode = candidate.geography.countryCode?.toLowerCase();
  return countryCode ? `country:${countryCode}` : null;
};

const refreshCountryChildCommunities = async (
  db: admin.firestore.Firestore,
  countryCommunityKeys: Iterable<string>
): Promise<void> => {
  for (const countryCommunityKey of countryCommunityKeys) {
    const childCommunities = await getEmbeddedChildCommunities(
      db,
      countryCommunityKey
    );
    await db
      .collection(COMMUNITY_PAGES_COLLECTION)
      .doc(countryCommunityKey)
      .set({ childCommunities }, { merge: true });
  }
};

const refreshCommunityEventPreviews = async (
  db: admin.firestore.Firestore,
  communityKeys: Iterable<string>
): Promise<void> => {
  for (const communityKey of communityKeys) {
    const eventPreviews = await getCommunityEventPreviews(db, communityKey);
    await db
      .collection(COMMUNITY_PAGES_COLLECTION)
      .doc(communityKey)
      .set({ eventPreviews }, { merge: true });
  }
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

    const impactedCountryKeys = new Set<string>();
    for (const candidate of impactedCandidates.values()) {
      const countryCommunityKey = getCountryCommunityKey(candidate);
      if (countryCommunityKey) {
        impactedCountryKeys.add(countryCommunityKey);
      }
    }
    await refreshCountryChildCommunities(db, impactedCountryKeys);

    return null;
  }
);

export const rebuildCommunityEventPreviewsOnEventWrite = onDocumentWritten(
  { document: "events/{eventId}" },
  async (event) => {
    const db = admin.firestore();
    const impactedCommunityKeys = new Set<string>();
    const beforeData = event.data?.before?.exists
      ? ((event.data.before.data() as EventSchema) ?? null)
      : null;
    const afterData = event.data?.after?.exists
      ? ((event.data.after.data() as EventSchema) ?? null)
      : null;

    for (const key of beforeData?.community_keys ?? []) {
      impactedCommunityKeys.add(key);
    }
    for (const key of afterData?.community_keys ?? []) {
      impactedCommunityKeys.add(key);
    }

    await refreshCommunityEventPreviews(db, impactedCommunityKeys);
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
    const writtenCountryKeys = new Set<string>();

    for (const { candidate, spots: candidateSpots } of communities.values()) {
      const pageDoc = await buildCommunityPageDoc(db, candidate, candidateSpots);
      const pageRef = db.collection(COMMUNITY_PAGES_COLLECTION).doc(candidate.communityKey);

      if (!pageDoc) {
        await pageRef.delete().catch(() => undefined);
        continue;
      }

      await pageRef.set(pageDoc, { merge: true });
      writtenKeys.add(candidate.communityKey);
      if (candidate.scope === "country") {
        writtenCountryKeys.add(candidate.communityKey);
      }
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

    await refreshCountryChildCommunities(db, writtenCountryKeys);

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
