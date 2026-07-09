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
  CommunityPickCategory,
  CommunityPickSectionSchema,
  CommunityPrivateInfoSchema,
} from "../../src/db/schemas/CommunityPageSchema";
import { CommunitySlugSchema } from "../../src/db/schemas/CommunitySlugSchema";
import { CommunityMergeSchema } from "../../src/db/schemas/CommunityMergeSchema";
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
  normalizeCommunitySlug,
} from "../../src/scripts/CommunityHelpers";
import {
  computeCommunityBounds,
  getDistanceMeters,
} from "../../src/scripts/CommunityBoundsHelpers";
import { computeTileCoordinates } from "../../src/scripts/TileCoordinateHelpers";
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
const COMMUNITY_MERGES_COLLECTION = "community_merges";
const MAINTENANCE_COLLECTION = "maintenance";
const EVENTS_COLLECTION = "events";
const SPOTS_COLLECTION = "spots";
const MANUAL_REBUILD_DOC = `${MAINTENANCE_COLLECTION}/run-rebuild-community-pages`;
const DEFAULT_LOCALE = "en";
const MAX_SPOTS_PER_LEGACY_SECTION = 10;
const MAX_STANDOUT_COMMUNITY_PICKS = 4;
const MAX_CATEGORY_COMMUNITY_PICKS = 2;
const MAX_FALLBACK_COMMUNITY_PICKS = 4;
const MAX_CHILD_COMMUNITIES = 8;
const MAX_COMMUNITY_EVENT_PREVIEWS = 2;
const COMMUNITY_EVENT_LOOKAHEAD_MONTHS = 6;
const warnedInvalidCommunityMergeChains = new Set<string>();
type CommunityInfoCards = NonNullable<CommunityPageSchema["infoCards"]>;
const privateCommunityInfoDoc = (
  db: admin.firestore.Firestore,
  communityKey: string
) =>
  db
    .collection(COMMUNITY_PAGES_COLLECTION)
    .doc(communityKey)
    .collection("private_info")
    .doc("link_cards");
const hasSignedInOnlyCommunityCta = (
  card: CommunityInfoCards[number]
): boolean =>
  card.cta?.target === "url" &&
  (card.ctaVisibility === "signed-in" ||
    (card.ctaVisibility !== "public" && card.category === "chat"));
const publicCommunityInfoCard = (
  card: CommunityInfoCards[number]
): CommunityInfoCards[number] => {
  if (!hasSignedInOnlyCommunityCta(card)) {
    return card;
  }

  const { cta: _cta, ...publicCard } = card;
  return {
    ...publicCard,
    ctaVisibility: "signed-in",
  };
};
const getPublicCommunityInfoCards = (
  cards: CommunityPageSchema["infoCards"] = []
): CommunityInfoCards =>
  cards.map(publicCommunityInfoCard);
const COMMUNITY_EVENT_PREVIEW_SOURCE_FIELDS = [
  "community_keys",
  "published",
  "name",
  "slug",
  "description",
  "description_i18n",
  "banner_src",
  "banner_fit",
  "banner_accent_color",
  "logo_src",
  "venue_string",
  "locality_string",
  "start",
  "end",
  "url",
  "location",
  "location_raw",
  "bounds",
  "sponsor",
  "is_promoted",
  "is_sponsored",
  "external_source",
  "event_categories",
  "series_ids",
] as const;
const SPOT_COMMUNITY_PAGE_SOURCE_FIELDS = [
  "name",
  "location",
  "location_raw",
  "type",
  "access",
  "address",
  "media",
  "is_iconic",
  "hide_streetview",
  "rating",
  "num_reviews",
  "amenities",
  "bounds",
  "bounds_raw",
  "landing",
] as const;
const PURPOSE_BUILT_SPOT_TYPES = new Set([
  "parkour gym",
  "parkour park",
  "gymnastics gym",
]);

type CommunitySlugDoc = CommunitySlugSchema & { id: string };
type CommunityMergeDoc = CommunityMergeSchema & { id: string };
type ImportRebuildStatus = "COMPLETED" | "PARTIAL";
type ImportRebuildDoc = { status?: ImportRebuildStatus | string };

const VALID_INFO_CARD_MERGE_MODES = new Set(["move", "copy", "skip"]);

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

const normalizeComparableValue = (value: unknown): unknown => {
  if (value instanceof Timestamp) {
    return {
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toMillis?: unknown }).toMillis === "function" &&
    typeof (value as { seconds?: unknown }).seconds === "number"
  ) {
    return {
      seconds: (value as { seconds: number }).seconds,
      nanoseconds:
        (value as { nanoseconds?: number }).nanoseconds ??
        (value as { _nanoseconds?: number })._nanoseconds ??
        0,
    };
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { latitude?: unknown }).latitude === "number" &&
    typeof (value as { longitude?: unknown }).longitude === "number"
  ) {
    return {
      latitude: (value as { latitude: number }).latitude,
      longitude: (value as { longitude: number }).longitude,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeComparableValue(entry));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [
        key,
        normalizeComparableValue(entryValue),
      ]);
    return Object.fromEntries(entries);
  }

  return value;
};

const areValuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(normalizeComparableValue(left)) ===
  JSON.stringify(normalizeComparableValue(right));

const stripGeneratedPageFields = (
  page: Partial<CommunityPageSchema> | undefined | null
): Partial<CommunityPageSchema> | null => {
  if (!page) return null;
  const { generatedAt: _generatedAt, ...rest } = page;
  return rest;
};

const shouldWriteCommunityPage = (
  existingPage: CommunityPageSchema | undefined,
  nextPage: CommunityPageSchema
): boolean =>
  !areValuesEqual(
    stripGeneratedPageFields(existingPage),
    stripGeneratedPageFields(nextPage)
  );

const didAnyFieldChange = <T extends Record<string, unknown>>(
  beforeData: T | null,
  afterData: T | null,
  fieldNames: readonly string[]
): boolean => {
  if (!beforeData || !afterData) return true;
  return fieldNames.some(
    (fieldName) => !areValuesEqual(beforeData[fieldName], afterData[fieldName])
  );
};

const isDeferredCommunityRebuildSpotWrite = (
  beforeData: SpotSchema | null,
  afterData: SpotSchema | null
): boolean =>
  beforeData?.community_rebuild_deferred === true ||
  afterData?.community_rebuild_deferred === true;

const isImportRebuildStatus = (
  status: unknown
): status is ImportRebuildStatus =>
  status === "COMPLETED" || status === "PARTIAL";

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

const getSpotAnchor = (spot: SpotSchema): { lat: number; lng: number } | null => {
  if (
    spot.location_raw &&
    Number.isFinite(spot.location_raw.lat) &&
    Number.isFinite(spot.location_raw.lng)
  ) {
    return { lat: spot.location_raw.lat, lng: spot.location_raw.lng };
  }

  const location = spot.location as
    | {
        latitude?: number;
        longitude?: number;
        _latitude?: number;
        _longitude?: number;
      }
    | undefined;
  const lat = location?.latitude ?? location?._latitude;
  const lng = location?.longitude ?? location?._longitude;
  return typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
    ? { lat, lng }
    : null;
};

const getDistanceToCenter = (
  spot: SpotSchema,
  center: { lat: number; lng: number } | null
): number => {
  const anchor = getSpotAnchor(spot);
  return anchor && center ? getDistanceMeters(center, anchor) : Number.POSITIVE_INFINITY;
};

const buildVisibilityBounds = (
  center: { lat: number; lng: number },
  radiusM: number
): Pick<
  CommunityPageSchema,
  | "visibility_bounds_north"
  | "visibility_bounds_south"
  | "visibility_bounds_east"
  | "visibility_bounds_west"
> => {
  const radius = Math.max(0, radiusM);
  const dLat = radius / 111000;
  const cosLat = Math.cos((center.lat * Math.PI) / 180) || 1e-6;
  const dLng = radius / (111000 * cosLat);
  return {
    visibility_bounds_north: center.lat + dLat,
    visibility_bounds_south: center.lat - dLat,
    visibility_bounds_east: center.lng + dLng,
    visibility_bounds_west: center.lng - dLng,
  };
};

const getRatingValue = (spot: SpotSchema): number => spot.rating ?? 0;

const getReviewCount = (spot: SpotSchema): number => spot.num_reviews ?? 0;

const compareSpotsForCommunityPicks = (
  left: SpotSchema,
  right: SpotSchema,
  center: { lat: number; lng: number } | null
): number => {
  if ((right.is_iconic ?? false) !== (left.is_iconic ?? false)) {
    return right.is_iconic ? 1 : -1;
  }

  const leftRating = getRatingValue(left);
  const rightRating = getRatingValue(right);
  if (leftRating > 0 || rightRating > 0) {
    if (rightRating !== leftRating) {
      return rightRating - leftRating;
    }
  }

  const leftReviews = getReviewCount(left);
  const rightReviews = getReviewCount(right);
  if (rightReviews !== leftReviews) {
    return rightReviews - leftReviews;
  }

  if (leftRating <= 0 && rightRating <= 0 && center) {
    const distanceDifference =
      getDistanceToCenter(left, center) - getDistanceToCenter(right, center);
    if (distanceDifference !== 0) {
      return distanceDifference;
    }
  }

  return getSpotName(left, DEFAULT_LOCALE).localeCompare(
    getSpotName(right, DEFAULT_LOCALE)
  );
};

const hasSpotImage = (spot: SpotSchema): boolean =>
  getSpotPreviewImage(spot).trim().length > 0;

const compareSpotsForCommunityPicksWithMediaPriority = (
  left: SpotSchema,
  right: SpotSchema,
  center: { lat: number; lng: number } | null
): number => {
  const leftHasImage = hasSpotImage(left);
  const rightHasImage = hasSpotImage(right);
  if (rightHasImage !== leftHasImage) {
    return rightHasImage ? 1 : -1;
  }

  return compareSpotsForCommunityPicks(left, right, center);
};

const hasPurposeBuiltParkourType = (spot: SpotSchema): boolean =>
  PURPOSE_BUILT_SPOT_TYPES.has(
    String(spot.type ?? "")
      .trim()
      .toLowerCase()
  );

const hasNightTrainingSignal = (spot: SpotSchema): boolean =>
  spot.amenities?.lighting === true;

const hasSummerWaterSignal = (spot: SpotSchema): boolean =>
  spot.amenities?.water_feature === true ||
  String(spot.type ?? "")
    .trim()
    .toLowerCase() === "water";

const buildCommunityPickSections = (
  spots: Array<{ id: string; data: SpotSchema }>,
  center: { lat: number; lng: number } | null
): CommunityPickSectionSchema[] => {
  const pickedSpotIds = new Set<string>();
  const sortCandidates = (candidates: Array<{ id: string; data: SpotSchema }>) =>
    [...candidates].sort((left, right) =>
      compareSpotsForCommunityPicksWithMediaPriority(
        left.data,
        right.data,
        center
      )
    );
  const takeSection = (
    category: CommunityPickCategory,
    title: string,
    candidates: Array<{ id: string; data: SpotSchema }>,
    maxSpots: number
  ): CommunityPickSectionSchema | null => {
    const selected = sortCandidates(candidates)
      .filter((spot) => !pickedSpotIds.has(spot.id))
      .slice(0, maxSpots);

    for (const spot of selected) {
      pickedSpotIds.add(spot.id);
    }

    return selected.length > 0
      ? {
          category,
          title,
          spots: selected.map((spot) => buildSpotPreview(spot.id, spot.data)),
        }
      : null;
  };

  const sections = [
    takeSection(
      "standout",
      "Standout Spots",
      spots.filter((spot) => getRatingValue(spot.data) > 0),
      MAX_STANDOUT_COMMUNITY_PICKS
    ),
    takeSection(
      "parkour",
      "Built for Parkour",
      spots.filter((spot) => hasPurposeBuiltParkourType(spot.data)),
      MAX_CATEGORY_COMMUNITY_PICKS
    ),
    takeSection(
      "dry",
      "Rainy Day Spots",
      spots.filter(
        (spot) =>
          spot.data.landing?.isDry === true || isDrySpotCandidate(spot.data)
      ),
      MAX_CATEGORY_COMMUNITY_PICKS
    ),
    takeSection(
      "night",
      "After Dark Spots",
      spots.filter((spot) => hasNightTrainingSignal(spot.data)),
      MAX_CATEGORY_COMMUNITY_PICKS
    ),
    takeSection(
      "summer",
      "Summer Spots",
      spots.filter((spot) => hasSummerWaterSignal(spot.data)),
      MAX_CATEGORY_COMMUNITY_PICKS
    ),
  ].filter(
    (section): section is CommunityPickSectionSchema => section !== null
  );

  if (sections.length > 0) {
    return sections;
  }

  const fallback = takeSection(
    "fallback",
    "Community Spots",
    spots,
    MAX_FALLBACK_COMMUNITY_PICKS
  );
  return fallback ? [fallback] : [];
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
    numReviews: spot.num_reviews,
    num_reviews: spot.num_reviews,
    amenities: spot.amenities,
    bounds: spot.bounds,
    bounds_raw: spot.bounds_raw,
  }) as SpotPreviewData;

const uniqueNonEmptyStrings = (values: Iterable<unknown>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

const humanizeSlug = (slug: string): string =>
  slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const buildCommunityCandidateFromPage = (
  page: CommunityPageSchema
): CommunityCandidate => ({
  communityKey: page.communityKey,
  scope: page.scope,
  displayName: page.displayName,
  geography: page.geography,
});

const buildCommunityCandidateFromMergeTarget = (
  merge: CommunityMergeSchema
): CommunityCandidate => ({
  communityKey: merge.target_community_key,
  scope: merge.target_scope,
  displayName: merge.target_display_name,
  geography: merge.target_geography,
});

const buildCommunityCandidateFromMergeSource = (
  merge: CommunityMergeSchema
): CommunityCandidate => ({
  communityKey: merge.source_community_key,
  scope: merge.source_scope,
  displayName: merge.source_display_name,
  geography: merge.source_geography,
});

const getActiveCommunityMerges = async (
  db: admin.firestore.Firestore
): Promise<Map<string, CommunityMergeDoc>> => {
  const snapshot = await db
    .collection(COMMUNITY_MERGES_COLLECTION)
    .where("status", "==", "active")
    .get();

  return new Map(
    snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as CommunityMergeSchema) }))
      .filter(
        (merge): merge is CommunityMergeDoc =>
          !!merge.source_community_key &&
          !!merge.target_community_key &&
          merge.source_community_key === merge.id
      )
      .map((merge) => [merge.source_community_key, merge])
  );
};

const resolveCommunityCandidate = (
  candidate: CommunityCandidate,
  activeMerges: Map<string, CommunityMergeDoc>
): CommunityCandidate => {
  const seen = new Set<string>([candidate.communityKey]);
  let current = candidate;

  for (let depth = 0; depth < 20; depth += 1) {
    const merge = activeMerges.get(current.communityKey);
    if (!merge) {
      return current;
    }

    if (seen.has(merge.target_community_key)) {
      const warningKey = `cycle:${candidate.communityKey}:${merge.target_community_key}`;
      if (!warnedInvalidCommunityMergeChains.has(warningKey)) {
        warnedInvalidCommunityMergeChains.add(warningKey);
        console.warn("Ignoring cyclic active community merge chain", {
          source_community_key: candidate.communityKey,
          target_community_key: merge.target_community_key,
        });
      }
      return candidate;
    }

    seen.add(merge.target_community_key);
    current = buildCommunityCandidateFromMergeTarget(merge);
  }

  const warningKey = `depth:${candidate.communityKey}`;
  if (!warnedInvalidCommunityMergeChains.has(warningKey)) {
    warnedInvalidCommunityMergeChains.add(warningKey);
    console.warn("Ignoring too-deep active community merge chain", {
      source_community_key: candidate.communityKey,
    });
  }
  return candidate;
};

const getMergesResolvedToCommunity = (
  activeMerges: Map<string, CommunityMergeDoc>,
  target_community_key: string
): CommunityMergeDoc[] =>
  [...activeMerges.values()].filter(
    (merge) =>
      merge.source_community_key !== target_community_key &&
      resolveCommunityCandidate(
        buildCommunityCandidateFromMergeSource(merge),
        activeMerges
      ).communityKey === target_community_key
  );

const getMergedCommunityKeysForTarget = (
  activeMerges: Map<string, CommunityMergeDoc>,
  target_community_key: string
): string[] =>
  getMergesResolvedToCommunity(activeMerges, target_community_key)
    .map((merge) => merge.source_community_key)
    .sort();

const getSearchAliasesForTarget = (
  activeMerges: Map<string, CommunityMergeDoc>,
  target_community_key: string
): string[] =>
  uniqueNonEmptyStrings(
    getMergesResolvedToCommunity(activeMerges, target_community_key).flatMap(
      (merge) => [
        merge.source_display_name,
        merge.source_geography.localityName,
        merge.source_geography.localityLocalName,
        merge.source_geography.regionName && merge.source_display_name
          ? `${merge.source_display_name}, ${merge.source_geography.regionName}`
          : "",
        ...(merge.source_slugs ?? []),
        ...(merge.source_slugs ?? []).map(humanizeSlug),
        ...(merge.source_search_aliases ?? []),
      ]
    )
  );

const getRedirectedSlugsForTarget = (
  activeMerges: Map<string, CommunityMergeDoc>,
  target_community_key: string
): string[] =>
  uniqueNonEmptyStrings(
    getMergesResolvedToCommunity(activeMerges, target_community_key).flatMap(
      (merge) => merge.source_slugs ?? []
    )
  ).sort();

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
    description: event.description,
    description_i18n: event.description_i18n,
    banner_src: event.banner_src,
    banner_fit: event.banner_fit,
    banner_accent_color: event.banner_accent_color,
    logo_src: event.logo_src,
    venue_string: event.venue_string,
    locality_string: event.locality_string,
    start: event.start,
    end: event.end,
    url: event.url,
    location: event.location,
    location_raw: event.location_raw,
    bounds: event.bounds,
    sponsor: event.sponsor,
    is_promoted: event.is_promoted ?? event.is_sponsored,
    is_sponsored: event.is_sponsored ?? event.is_promoted,
    external_source: event.external_source,
    event_categories: event.event_categories,
    series_ids: event.series_ids,
    rsvp_counts: event.rsvp_counts,
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
  candidate: CommunityCandidate,
  activeMerges: Map<string, CommunityMergeDoc> = new Map()
): boolean => {
  const spotCandidates = getSpotCommunityCandidates(spot);
  return spotCandidates.some((spotCandidate) => {
    const resolvedCandidate = resolveCommunityCandidate(
      spotCandidate,
      activeMerges
    );
    return resolvedCandidate.communityKey === candidate.communityKey;
  });
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
  spots: Array<{ id: string; data: SpotSchema }>,
  activeMerges: Map<string, CommunityMergeDoc> = new Map()
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
  const communityBounds = computeCommunityBounds(sourceSpots, {
    // Locality circles are the user-facing map footprint, so include every
    // member spot. Countries keep the conservative radius to avoid one
    // territory/outlier stretching the circle across a continent.
    radiusPercentile: candidate.scope === "locality" ? 1 : 0.8,
  });
  const communityCenter = communityBounds
    ? {
        lat: communityBounds.bounds_center[0],
        lng: communityBounds.bounds_center[1],
      }
    : null;
  const visibilityBounds =
    communityBounds && communityCenter
      ? buildVisibilityBounds(communityCenter, communityBounds.bounds_radius_m)
      : null;
  const communityPicks = buildCommunityPickSections(spots, communityCenter);
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
  const merged_community_keys = getMergedCommunityKeysForTarget(
    activeMerges,
    candidate.communityKey
  );
  const search_aliases = getSearchAliasesForTarget(
    activeMerges,
    candidate.communityKey
  );
  const redirected_from_slugs = getRedirectedSlugsForTarget(
    activeMerges,
    candidate.communityKey
  );

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
    spots: sortedSpots
      .slice(0, MAX_SPOTS_PER_LEGACY_SECTION)
      .map((spot) => buildSpotPreview(spot.id, spot.data)),
    communityPicks,
    topRatedSpots: ratedSpots
      .slice(0, MAX_SPOTS_PER_LEGACY_SECTION)
      .map((spot) => buildSpotPreview(spot.id, spot.data)),
    drySpots: drySpots
      .slice(0, MAX_SPOTS_PER_LEGACY_SECTION)
      .map((spot) => buildSpotPreview(spot.id, spot.data)),
    links: existingPage?.links ?? {},
    infoCards: getPublicCommunityInfoCards(existingPage?.infoCards),
    resources: existingPage?.resources ?? [],
    organisations: existingPage?.organisations ?? [],
    athletes: existingPage?.athletes ?? [],
    events: existingPage?.events ?? [],
    childCommunities,
    eventPreviews,
    image,
    published: true,
    merged_community_keys:
      merged_community_keys.length > 0 ? merged_community_keys : undefined,
    search_aliases: search_aliases.length > 0 ? search_aliases : undefined,
    redirected_from_slugs:
      redirected_from_slugs.length > 0 ? redirected_from_slugs : undefined,
    generatedAt: Timestamp.now(),
    sourceMaxUpdatedAt: sourceMaxUpdatedAt ?? undefined,
    bounds_center: communityBounds?.bounds_center,
    bounds_radius_m: communityBounds?.bounds_radius_m,
    tile_coordinates: communityBounds?.bounds_center
      ? computeTileCoordinates(
          communityBounds.bounds_center[0],
          communityBounds.bounds_center[1],
        )
      : undefined,
    visibility_bounds_north: visibilityBounds?.visibility_bounds_north,
    visibility_bounds_south: visibilityBounds?.visibility_bounds_south,
    visibility_bounds_east: visibilityBounds?.visibility_bounds_east,
    visibility_bounds_west: visibilityBounds?.visibility_bounds_west,
    google_maps_place_id: existingPage?.google_maps_place_id,
  }) as CommunityPageSchema;
};

const fetchSpotsForCommunity = async (
  db: admin.firestore.Firestore,
  candidate: CommunityCandidate,
  activeMerges: Map<string, CommunityMergeDoc> = new Map()
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
    .filter((spot) => isSpotPartOfCommunity(spot.data, candidate, activeMerges));
};

const writeOrDeleteCommunityPage = async (
  db: admin.firestore.Firestore,
  candidate: CommunityCandidate
): Promise<void> => {
  const activeMerges = await getActiveCommunityMerges(db);
  const resolvedCandidate = resolveCommunityCandidate(candidate, activeMerges);
  const spots = await fetchSpotsForCommunity(
    db,
    resolvedCandidate,
    activeMerges
  );
  const pageDoc = await buildCommunityPageDoc(
    db,
    resolvedCandidate,
    spots,
    activeMerges
  );
  const pageRef = db
    .collection(COMMUNITY_PAGES_COLLECTION)
    .doc(resolvedCandidate.communityKey);

  if (!pageDoc) {
    await pageRef.delete().catch(() => undefined);
    return;
  }

  const existingPage = (await pageRef.get()).data() as
    | CommunityPageSchema
    | undefined;
  if (!shouldWriteCommunityPage(existingPage, pageDoc)) {
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
    const pageRef = db.collection(COMMUNITY_PAGES_COLLECTION).doc(communityKey);
    const current = (await pageRef.get()).data() as
      | CommunityPageSchema
      | undefined;
    if (areValuesEqual(current?.eventPreviews ?? [], eventPreviews)) {
      continue;
    }
    await pageRef.set({ eventPreviews }, { merge: true });
  }
};

const collectGeneratedCommunities = (
  spots: Array<{ id: string; data: SpotSchema }>,
  activeMerges: Map<string, CommunityMergeDoc> = new Map()
): Map<string, { candidate: CommunityCandidate; spots: Array<{ id: string; data: SpotSchema }> }> => {
  const communities = new Map<
    string,
    { candidate: CommunityCandidate; spots: Array<{ id: string; data: SpotSchema }> }
  >();

  for (const spot of spots) {
    for (const rawCandidate of getSpotCommunityCandidates(spot.data)) {
      const candidate = resolveCommunityCandidate(rawCandidate, activeMerges);
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

const rebuildCommunityPagesForImportedSpots = async (
  db: admin.firestore.Firestore,
  importId: string
): Promise<number> => {
  const spotsSnapshot = await db
    .collection(SPOTS_COLLECTION)
    .where("import_id", "==", importId)
    .get();
  const importedSpots = spotsSnapshot.docs
    .filter((doc) => isSpotRuntimeDoc(doc.id))
    .map((doc) => ({ id: doc.id, data: doc.data() as SpotSchema }));
  const activeMerges = await getActiveCommunityMerges(db);
  const communities = collectGeneratedCommunities(importedSpots, activeMerges);

  for (const { candidate } of communities.values()) {
    await writeOrDeleteCommunityPage(db, candidate);
  }

  const impactedCountryKeys = new Set<string>();
  for (const { candidate } of communities.values()) {
    const countryCommunityKey = getCountryCommunityKey(candidate);
    if (countryCommunityKey) {
      impactedCountryKeys.add(countryCommunityKey);
    }
  }
  await refreshCountryChildCommunities(db, impactedCountryKeys);

  let batch = db.batch();
  let batchSize = 0;
  for (const spotDoc of spotsSnapshot.docs) {
    batch.update(spotDoc.ref, {
      community_rebuild_deferred: FieldValue.delete(),
    });
    batchSize += 1;
    if (batchSize >= 450) {
      await batch.commit();
      batch = db.batch();
      batchSize = 0;
    }
  }
  if (batchSize > 0) {
    await batch.commit();
  }

  return communities.size;
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

    if (isDeferredCommunityRebuildSpotWrite(beforeData, afterData)) {
      return null;
    }

    if (
      !didAnyFieldChange(
        beforeData as unknown as Record<string, unknown> | null,
        afterData as unknown as Record<string, unknown> | null,
        SPOT_COMMUNITY_PAGE_SOURCE_FIELDS
      )
    ) {
      return null;
    }

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

export const rebuildCommunityPagesOnImportWrite = onDocumentWritten(
  { document: "imports/{importId}" },
  async (event) => {
    const importId = String(event.params.importId ?? "").trim();
    if (!importId) {
      return null;
    }

    const beforeData = event.data?.before?.exists
      ? ((event.data.before.data() as ImportRebuildDoc) ?? null)
      : null;
    const afterData = event.data?.after?.exists
      ? ((event.data.after.data() as ImportRebuildDoc) ?? null)
      : null;

    if (
      !isImportRebuildStatus(afterData?.status) ||
      beforeData?.status === afterData.status
    ) {
      return null;
    }

    const db = admin.firestore();
    const generatedCount = await rebuildCommunityPagesForImportedSpots(
      db,
      importId
    );
    await db
      .collection(MAINTENANCE_COLLECTION)
      .doc(`last-import-community-rebuild-${importId}`)
      .set(
        {
          import_id: importId,
          import_status: afterData.status,
          generated_count: generatedCount,
          completed_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

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

    if (
      !didAnyFieldChange(
        beforeData as unknown as Record<string, unknown> | null,
        afterData as unknown as Record<string, unknown> | null,
        COMMUNITY_EVENT_PREVIEW_SOURCE_FIELDS
      )
    ) {
      return null;
    }

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

interface OverlapWarning {
  keyA: string;
  keyB: string;
  nameA: string;
  nameB: string;
  distanceKm: number;
  reason: string;
  category: "likely_duplicate" | "nearby_related" | "needs_review";
  severity: "high" | "medium" | "low";
  spotsOverlapCount: number;
  totalSpotsA: number;
  totalSpotsB: number;
}

const RELATED_PLACE_TERMS = new Set([
  "central",
  "east",
  "north",
  "old",
  "port",
  "south",
  "west",
]);

const getSlugParts = (slug: string): string[] =>
  slug.split("-").filter(Boolean);

const isRelatedPlaceName = (slugA: string, slugB: string): boolean => {
  const partsA = getSlugParts(slugA);
  const partsB = getSlugParts(slugB);
  if (!partsA.length || !partsB.length) {
    return false;
  }

  const shorter = partsA.length <= partsB.length ? partsA : partsB;
  const longer = partsA.length > partsB.length ? partsA : partsB;
  const extraParts = longer.filter((part) => !shorter.includes(part));

  return extraParts.some((part) => RELATED_PLACE_TERMS.has(part));
};

const classifyOverlapWarning = (
  isIdenticalName: boolean,
  isSubstringName: boolean,
  hasSharedSpots: boolean,
  spotsOverlapCount: number,
  slugA: string,
  slugB: string
): Pick<OverlapWarning, "category" | "severity"> => {
  if (hasSharedSpots || isIdenticalName) {
    return {
      category: "likely_duplicate",
      severity: spotsOverlapCount > 0 ? "high" : "medium",
    };
  }

  if (isSubstringName && isRelatedPlaceName(slugA, slugB)) {
    return { category: "nearby_related", severity: "low" };
  }

  return { category: "needs_review", severity: "medium" };
};

const detectOverlappingCommunities = (
  communities: Map<
    string,
    { candidate: CommunityCandidate; spots: Array<{ id: string; data: SpotSchema }> }
  >
): OverlapWarning[] => {
  const localities = [...communities.values()].filter(
    (c) => c.candidate.scope === "locality"
  );
  const warnings: OverlapWarning[] = [];

  for (let i = 0; i < localities.length; i++) {
    const cA = localities[i];
    const boundsA = computeCommunityBounds(cA.spots.map((s) => s.data));
    if (!boundsA) continue;

    const centerA = { lat: boundsA.bounds_center[0], lng: boundsA.bounds_center[1] };
    const nameA = cA.candidate.displayName || "";
    const slugA = cA.candidate.geography.localitySlug || "";
    const spotIdsA = new Set(cA.spots.map((s) => s.id));

    for (let j = i + 1; j < localities.length; j++) {
      const cB = localities[j];

      // Must be same country
      if (cA.candidate.geography.countryCode !== cB.candidate.geography.countryCode) {
        continue;
      }

      const boundsB = computeCommunityBounds(cB.spots.map((s) => s.data));
      if (!boundsB) continue;

      const centerB = { lat: boundsB.bounds_center[0], lng: boundsB.bounds_center[1] };
      const distanceMeters = getDistanceMeters(centerA, centerB);

      // We only flag communities that are physically close to each other (e.g., within 20 km)
      if (distanceMeters > 20000) {
        continue;
      }

      const nameB = cB.candidate.displayName || "";
      const slugB = cB.candidate.geography.localitySlug || "";

      // Check for overlap indicators:
      // 1. Identical or substring display names
      const normA = nameA.toLowerCase().trim();
      const normB = nameB.toLowerCase().trim();
      const isIdenticalName = normA === normB;
      const isSubstringName =
        !!slugA && !!slugB && (slugA.includes(slugB) || slugB.includes(slugA));

      // 2. Shared spots
      const sharedSpots = cB.spots.filter((s) => spotIdsA.has(s.id));
      const hasSharedSpots = sharedSpots.length > 0;

      if (isIdenticalName || isSubstringName || hasSharedSpots) {
        let reason = "";
        if (isIdenticalName) {
          reason = "Identical display name";
        } else if (isSubstringName) {
          reason = `Similar display names ("${nameA}" vs "${nameB}")`;
        } else {
          reason = "Shared spots";
        }
        const classification = classifyOverlapWarning(
          isIdenticalName,
          isSubstringName,
          hasSharedSpots,
          sharedSpots.length,
          slugA,
          slugB
        );

        warnings.push({
          keyA: cA.candidate.communityKey,
          keyB: cB.candidate.communityKey,
          nameA,
          nameB,
          distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
          reason,
          ...classification,
          spotsOverlapCount: sharedSpots.length,
          totalSpotsA: cA.spots.length,
          totalSpotsB: cB.spots.length,
        });
      }
    }
  }

  return warnings;
};

const getInfoCardMergeMode = (value: unknown): "move" | "copy" | "skip" =>
  typeof value === "string" && VALID_INFO_CARD_MERGE_MODES.has(value)
    ? (value as "move" | "copy" | "skip")
    : "move";

const getMergeTargetCommunityKey = (
  page: CommunityPageSchema | null | undefined
): string | null => {
  const target = page?.merge_into?.target_community_key;
  return typeof target === "string" && target.trim() ? target.trim() : null;
};

const shouldPatchCommunityMerge = (
  beforePage: CommunityPageSchema | null,
  afterPage: CommunityPageSchema | null
): boolean => {
  const target_community_key = getMergeTargetCommunityKey(afterPage);
  if (!afterPage || !target_community_key) {
    return false;
  }

  if (afterPage.merge_into?.status === "active") {
    return false;
  }

  return (
    beforePage?.merge_into?.target_community_key !== target_community_key ||
    beforePage?.merge_into?.info_cards !== afterPage.merge_into?.info_cards ||
    afterPage.merge_into?.status === "pending" ||
    !afterPage.merge_into?.status
  );
};

const failCommunityMergeRequest = async (
  sourceRef: admin.firestore.DocumentReference,
  page: CommunityPageSchema,
  error: string
): Promise<void> => {
  await sourceRef.set(
    {
      merge_into: {
        ...(page.merge_into ?? {}),
        status: "failed",
        error,
      },
    },
    { merge: true }
  );
};

const assertNoCommunityMergeCycle = async (
  db: admin.firestore.Firestore,
  source_community_key: string,
  target_community_key: string
): Promise<void> => {
  const seen = new Set<string>([source_community_key]);
  let cursor: string | null = target_community_key;

  for (let depth = 0; cursor && depth < 20; depth += 1) {
    if (seen.has(cursor)) {
      throw new Error("Community merge would create a cycle.");
    }

    seen.add(cursor);
    const merge = (
      await db.collection(COMMUNITY_MERGES_COLLECTION).doc(cursor).get()
    ).data() as CommunityMergeSchema | undefined;
    cursor =
      merge?.status === "active" && merge.target_community_key
        ? merge.target_community_key
        : null;
  }

  if (cursor) {
    throw new Error("Community merge chain is too deep.");
  }
};

const getSourceCommunitySlugs = async (
  db: admin.firestore.Firestore,
  source_community_key: string,
  sourceCandidate: CommunityCandidate
): Promise<string[]> => {
  const existingSlugs = await getExistingCommunitySlugs(db, source_community_key);
  return uniqueNonEmptyStrings([
    ...existingSlugs.map((slug) => slug.id),
    ...buildCommunitySlugCandidates(sourceCandidate),
  ]);
};

const mergeInfoCardsForCommunity = (
  targetCards: CommunityPageSchema["infoCards"] = [],
  sourceCards: CommunityPageSchema["infoCards"] = [],
  source_community_key: string,
  sourceSlug: string
): CommunityPageSchema["infoCards"] => {
  const publicTargetCards = getPublicCommunityInfoCards(targetCards);
  const publicSourceCards = getPublicCommunityInfoCards(sourceCards);
  const usedIds = new Set(publicTargetCards.map((card) => card.id));
  const mergedCards = [...publicTargetCards];

  for (const card of publicSourceCards) {
    const baseId = normalizeCommunitySlug(`${sourceSlug}-${card.id}`) || card.id;
    let nextId = baseId;
    let suffix = 2;
    while (usedIds.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(nextId);
    mergedCards.push({
      ...card,
      id: nextId,
      origin_community_key: card.origin_community_key ?? source_community_key,
    });
  }

  return mergedCards;
};

const applyCommunityMergePatch = async (
  db: admin.firestore.Firestore,
  source_community_key: string,
  sourcePage: CommunityPageSchema,
  target_community_key: string
): Promise<void> => {
  if (source_community_key !== sourcePage.communityKey) {
    throw new Error("Community page key does not match document id.");
  }

  if (source_community_key === target_community_key) {
    throw new Error("A community cannot be merged into itself.");
  }

  const sourceRef = db.collection(COMMUNITY_PAGES_COLLECTION).doc(source_community_key);
  const targetRef = db.collection(COMMUNITY_PAGES_COLLECTION).doc(target_community_key);
  const sourcePrivateRef = privateCommunityInfoDoc(db, source_community_key);
  const targetPrivateRef = privateCommunityInfoDoc(db, target_community_key);
  const targetSnapshot = await targetRef.get();
  const [sourcePrivateSnapshot, targetPrivateSnapshot] = await Promise.all([
    sourcePrivateRef.get(),
    targetPrivateRef.get(),
  ]);
  const targetPage = targetSnapshot.data() as CommunityPageSchema | undefined;
  const sourcePrivateInfo =
    sourcePrivateSnapshot.data() as CommunityPrivateInfoSchema | undefined;
  const targetPrivateInfo =
    targetPrivateSnapshot.data() as CommunityPrivateInfoSchema | undefined;

  if (!targetPage) {
    throw new Error("Target community does not exist.");
  }

  if (targetPage.published === false || targetPage.redirect_to_community_key) {
    throw new Error("Target community is not an active community page.");
  }

  if (sourcePage.scope !== "locality" || targetPage.scope !== "locality") {
    throw new Error("Only locality communities can be merged right now.");
  }

  if (
    sourcePage.geography.countryCode &&
    targetPage.geography.countryCode &&
    sourcePage.geography.countryCode !== targetPage.geography.countryCode
  ) {
    throw new Error("Communities can only be merged within the same country.");
  }

  await assertNoCommunityMergeCycle(
    db,
    source_community_key,
    target_community_key
  );

  const infoCardMode = getInfoCardMergeMode(sourcePage.merge_into?.info_cards);
  const sourceCandidate = buildCommunityCandidateFromPage(sourcePage);
  const source_slugs = await getSourceCommunitySlugs(
    db,
    source_community_key,
    sourceCandidate
  );
  const source_search_aliases = uniqueNonEmptyStrings([
    sourcePage.displayName,
    sourcePage.geography.localityName,
    sourcePage.geography.localityLocalName,
    sourcePage.geography.regionName && sourcePage.displayName
      ? `${sourcePage.displayName}, ${sourcePage.geography.regionName}`
      : "",
    ...source_slugs,
    ...source_slugs.map(humanizeSlug),
  ]);
  const targetSearchAliases = uniqueNonEmptyStrings([
    ...(targetPage.search_aliases ?? []),
    ...source_search_aliases,
  ]);
  const targetMergedCommunityKeys = uniqueNonEmptyStrings([
    ...(targetPage.merged_community_keys ?? []),
    source_community_key,
  ]).sort();
  const targetRedirectedFromSlugs = uniqueNonEmptyStrings([
    ...(targetPage.redirected_from_slugs ?? []),
    ...source_slugs,
  ]).sort();
  const sourceSlug = source_slugs[0] ?? normalizeCommunitySlug(sourcePage.displayName);
  const sourcePrivateCards = sourcePrivateInfo?.infoCards ?? [];
  const targetPrivateCards = targetPrivateInfo?.infoCards ?? [];
  const nextTargetInfoCards =
    infoCardMode === "copy" || infoCardMode === "move"
      ? mergeInfoCardsForCommunity(
          targetPage.infoCards ?? [],
          sourcePage.infoCards ?? [],
          source_community_key,
          sourceSlug
        )
      : getPublicCommunityInfoCards(targetPage.infoCards);
  const nextTargetPrivateCards =
    infoCardMode === "copy" || infoCardMode === "move"
      ? mergeInfoCardsForCommunity(
          targetPrivateCards,
          sourcePrivateCards,
          source_community_key,
          sourceSlug
        )
      : targetPrivateCards;

  const batch = db.batch();
  const mergeRef = db
    .collection(COMMUNITY_MERGES_COLLECTION)
    .doc(source_community_key);

  batch.set(
    mergeRef,
    removeUndefinedValues({
      source_community_key,
      target_community_key,
      status: "active",
      source_scope: sourcePage.scope,
      target_scope: targetPage.scope,
      source_display_name: sourcePage.displayName,
      target_display_name: targetPage.displayName,
      source_geography: sourcePage.geography,
      target_geography: targetPage.geography,
      source_slugs,
      source_search_aliases,
      info_cards: infoCardMode,
      merged_at: FieldValue.serverTimestamp(),
    }) as CommunityMergeSchema
  );

  batch.set(
    targetRef,
    removeUndefinedValues({
      merged_community_keys: targetMergedCommunityKeys,
      search_aliases: targetSearchAliases,
      redirected_from_slugs: targetRedirectedFromSlugs,
      infoCards: nextTargetInfoCards,
    }),
    { merge: true }
  );
  batch.set(
    targetPrivateRef,
    {
      infoCards: nextTargetPrivateCards,
    },
    { merge: true }
  );

  batch.set(
    sourceRef,
    removeUndefinedValues({
      published: false,
      redirect_to_community_key: target_community_key,
      redirect_to_path: targetPage.canonicalPath,
      infoCards:
        infoCardMode === "move"
          ? []
          : getPublicCommunityInfoCards(sourcePage.infoCards),
      merge_into: {
        target_community_key,
        info_cards: infoCardMode,
        status: "active",
        applied_at: FieldValue.serverTimestamp(),
      },
    }),
    { merge: true }
  );
  batch.set(
    sourcePrivateRef,
    {
      infoCards: infoCardMode === "move" ? [] : sourcePrivateCards,
    },
    { merge: true }
  );

  for (const slug of source_slugs) {
    const slugRef = db.collection(COMMUNITY_SLUGS_COLLECTION).doc(slug);
    batch.set(
      slugRef,
      {
        communityKey: target_community_key,
        isPreferred: false,
        alias_for_community_key: source_community_key,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
};

const rebuildAllCommunityPagesForDb = async (
  db: admin.firestore.Firestore
): Promise<{ generatedCount: number; warnings: OverlapWarning[] }> => {
  const spotsSnapshot = await db.collection(SPOTS_COLLECTION).get();
  const spots = spotsSnapshot.docs
    .filter((doc) => isSpotRuntimeDoc(doc.id))
    .map((doc) => ({
      id: doc.id,
      data: doc.data() as SpotSchema,
    }));
  const activeMerges = await getActiveCommunityMerges(db);
  const communities = collectGeneratedCommunities(spots, activeMerges);
  const writtenKeys = new Set<string>();
  const writtenCountryKeys = new Set<string>();

  for (const { candidate, spots: candidateSpots } of communities.values()) {
    const pageDoc = await buildCommunityPageDoc(
      db,
      candidate,
      candidateSpots,
      activeMerges
    );
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
      const activeMerge = activeMerges.get(page.id);
      if (activeMerge) {
        await page.ref.set(
          {
            published: false,
            redirect_to_community_key: activeMerge.target_community_key,
            redirect_to_path: buildCommunityLandingPath(
              buildCommunitySlugCandidates(
                buildCommunityCandidateFromMergeTarget(activeMerge)
              )[0] || activeMerge.target_display_name
            ),
            merge_into: {
              target_community_key: activeMerge.target_community_key,
              info_cards: activeMerge.info_cards,
              status: "active",
              applied_at: FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );
        continue;
      }
      await page.ref.delete().catch(() => undefined);
    }
  }

  await refreshCountryChildCommunities(db, writtenCountryKeys);

  const warnings = detectOverlappingCommunities(communities);
  if (warnings.length > 0) {
    console.warn(
      `[rebuildAllCommunityPages] Detected ${warnings.length} overlapping/duplicate communities:`,
      JSON.stringify(warnings, null, 2)
    );
    await db
      .collection(MAINTENANCE_COLLECTION)
      .doc("community-warnings")
      .set({
        warnings,
        updatedAt: FieldValue.serverTimestamp(),
      });
  } else {
    await db
      .collection(MAINTENANCE_COLLECTION)
      .doc("community-warnings")
      .delete()
      .catch(() => undefined);
  }

  return { generatedCount: writtenKeys.size, warnings };
};

export const patchCommunityPageOnWrite = onDocumentWritten(
  { document: "community_pages/{communityKey}" },
  async (event) => {
    const source_community_key = String(event.params.communityKey ?? "");
    if (!source_community_key || source_community_key.startsWith("run-")) {
      return null;
    }

    const beforePage = event.data?.before?.exists
      ? ((event.data.before.data() as CommunityPageSchema) ?? null)
      : null;
    const afterPage = event.data?.after?.exists
      ? ((event.data.after.data() as CommunityPageSchema) ?? null)
      : null;

    if (!shouldPatchCommunityMerge(beforePage, afterPage)) {
      return null;
    }

    const db = admin.firestore();
    const sourceRef = db
      .collection(COMMUNITY_PAGES_COLLECTION)
      .doc(source_community_key);
    const target_community_key = getMergeTargetCommunityKey(afterPage);

    try {
      await applyCommunityMergePatch(
        db,
        source_community_key,
        afterPage!,
        target_community_key!
      );
      const result = await rebuildAllCommunityPagesForDb(db);
      await db
        .collection(MAINTENANCE_COLLECTION)
        .doc("last-community-merge")
        .set(
          {
            source_community_key,
            target_community_key,
            status: "DONE",
            generated_count: result.generatedCount,
            warnings: result.warnings.length > 0 ? result.warnings : null,
            completed_at: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown community merge error";
      console.warn("Failed to patch community merge", {
        source_community_key,
        target_community_key,
        message,
      });
      await failCommunityMergeRequest(sourceRef, afterPage!, message);
    }

    return null;
  }
);

export const rebuildAllCommunityPages = onDocumentCreated(
  { document: MANUAL_REBUILD_DOC },
  async (event) => {
    const db = admin.firestore();
    const result = await rebuildAllCommunityPagesForDb(db);

    await event.data?.ref.set(
      {
        status: "DONE",
        generated_count: result.generatedCount,
        completed_at: FieldValue.serverTimestamp(),
        warnings: result.warnings.length > 0 ? result.warnings : null,
      },
      { merge: true }
    );
  }
);
