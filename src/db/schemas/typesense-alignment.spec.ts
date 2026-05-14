import { describe } from "vitest";
import {
  CollectionMapping,
  registerAlignmentTests,
} from "./typesense-alignment.testing";

// Each describe declares (1) the Firestore field surface for a collection,
// (2) the Typesense field mapping table, and (3) whatever required/indexed
// invariants we want to enforce. The helper does the rest.
//
// To add a new Typesense field: add it to the JSON schema AND add a
// mapping entry below. To add a new Firestore field: add it to
// `firestoreFields` (and to `expectedIndexedFirestoreFields` if it should
// be searchable). The harness will fail loudly when either side drifts.

describe("Typesense events_v1 ↔ EventSchema", () => {
  // Field paths from src/db/schemas/EventSchema.ts. Keep in sync when the
  // TS interface changes. Dotted paths represent nested object fields.
  const firestoreFields = [
    "name",
    "description",
    "slug",
    "banner_src",
    "banner_fit",
    "banner_accent_color",
    "logo_src",
    "venue_string",
    "locality_string",
    "start",
    "end",
    "url",
    "promo_starts_at",
    "spot_ids",
    "inline_spots",
    "custom_markers",
    "challenge_spot_map",
    "bounds",
    "focus_zoom",
    "min_zoom",
    "area_polygon",
    "promo_region",
    "sponsor",
    "sponsor.name",
    "sponsor.logo_src",
    "sponsor.logo_background_color",
    "sponsor.url",
    "is_sponsored",
    "community_keys",
    "series_ids",
    "external_source",
    "external_source.provider",
    "external_source.id",
    "external_source.url",
    "structured_data",
    "published",
    "created_by",
    "time_created",
    "time_updated",
    // Typesense helper fields — populated by `updateEventFieldsOnWrite`
    // and copied verbatim by the Firestore→Typesense extension.
    "start_seconds",
    "end_seconds",
    "promo_starts_at_seconds",
    "bounds_center",
    "bounds_radius_m",
    "promo_region_center",
    "promo_region_radius_m",
  ] as const;

  const requiredFirestoreFields = [
    "name",
    "venue_string",
    "locality_string",
    "start",
    "end",
    "bounds",
  ] as const;

  // The `*_seconds` and `bounds_*` / `promo_region_*` helper fields are
  // typed as optional on the EventSchema (we want clients to be able to
  // read an event without these), but the `updateEventFieldsOnWrite`
  // cloud function always populates them when the source field is
  // present. `bounds_center`/`bounds_radius_m` are required in Typesense
  // because `bounds` is required in Firestore.
  const indexerProvidedDefaults = [
    "start_seconds",
    "end_seconds",
    "bounds_center",
    "bounds_radius_m",
  ] as const;

  // `start`, `end`, and `bounds` are surfaced to Typesense via their
  // cloud-function-maintained helper fields (`*_seconds`,
  // `bounds_center`, `bounds_radius_m`) — listed below so the harness
  // confirms each helper is indexed.
  const expectedIndexedFirestoreFields = [
    "name",
    "venue_string",
    "locality_string",
    "start_seconds",
    "end_seconds",
    "bounds_center",
    "bounds_radius_m",
    "community_keys",
    "series_ids",
    "is_sponsored",
    "published",
  ] as const;

  const mapping: CollectionMapping = {
    id: { kind: "doc-id" },
    name: { kind: "direct", source: "name" },
    description: { kind: "direct", source: "description" },
    slug: { kind: "direct", source: "slug" },
    venue_string: { kind: "direct", source: "venue_string" },
    locality_string: { kind: "direct", source: "locality_string" },
    url: { kind: "direct", source: "url" },

    banner_src: { kind: "direct", source: "banner_src" },
    logo_src: { kind: "direct", source: "logo_src" },
    "sponsor.name": { kind: "direct", source: "sponsor.name" },
    "sponsor.logo_src": { kind: "direct", source: "sponsor.logo_src" },
    "sponsor.logo_background_color": {
      kind: "direct",
      source: "sponsor.logo_background_color",
    },
    "sponsor.url": { kind: "direct", source: "sponsor.url" },
    is_sponsored: { kind: "direct", source: "is_sponsored" },

    // Helper fields are materialized onto the Firestore event doc by
    // `updateEventFieldsOnWrite` (the Firebase Extension then copies them
    // verbatim to Typesense), so the mapping is `direct`.
    start_seconds: { kind: "direct", source: "start_seconds" },
    end_seconds: { kind: "direct", source: "end_seconds" },
    promo_starts_at_seconds: {
      kind: "direct",
      source: "promo_starts_at_seconds",
    },

    spot_ids: { kind: "direct", source: "spot_ids" },
    community_keys: { kind: "direct", source: "community_keys" },
    series_ids: { kind: "direct", source: "series_ids" },

    "external_source.provider": {
      kind: "direct",
      source: "external_source.provider",
    },
    "external_source.id": { kind: "direct", source: "external_source.id" },
    "external_source.url": { kind: "direct", source: "external_source.url" },

    bounds_center: { kind: "direct", source: "bounds_center" },
    bounds_radius_m: { kind: "direct", source: "bounds_radius_m" },
    promo_region_center: { kind: "direct", source: "promo_region_center" },
    promo_region_radius_m: {
      kind: "direct",
      source: "promo_region_radius_m",
    },

    published: { kind: "direct", source: "published" },
    _force_sync: {
      kind: "synthetic",
      reason: "Operator-only knob to force Typesense re-index without doc change",
    },
  };

  registerAlignmentTests({
    typesenseSchemaPath: "typesense/typesense_events_v1_schema.json",
    expectedCollectionName: "events_v1",
    firestoreFields,
    requiredFirestoreFields,
    indexerProvidedDefaults,
    expectedIndexedFirestoreFields,
    mapping,
  });
});

describe("Typesense spots_v2 ↔ SpotSchema", () => {
  // SpotSchema explicitly bakes Typesense helper fields into Firestore
  // (amenities_true, name_search, thumbnail_*, bounds_center/_radius_m),
  // so most entries are direct copies — the helper fields are precomputed
  // and stored on the spot doc itself.
  const firestoreFields = [
    "name",
    "location",
    "location_raw",
    "tile_coordinates",
    "isMiniSpot",
    "description",
    "media",
    "top_challenges",
    "num_challenges",
    "is_iconic",
    "rating",
    "num_reviews",
    "rating_histogram",
    "highlighted_reviews",
    "address",
    "address.formatted",
    "address.formattedLocal",
    "address.locality",
    "address.localityLocal",
    "address.sublocality",
    "address.sublocalityLocal",
    "address.region",
    "address.country",
    "address.country.code",
    "address.country.name",
    "external_references",
    "type",
    "access",
    "amenities",
    "bounds",
    "bounds_raw",
    "time_created",
    "time_updated",
    "isReported",
    "reportReason",
    "duplicate_check",
    "slug",
    "landing",
    "hide_streetview",
    "source",
    "amenities_true",
    "amenities_false",
    "thumbnail_small_url",
    "thumbnail_medium_url",
    "name_search",
    "description_search",
    "bounds_center",
    "bounds_radius_m",
  ] as const;

  const requiredFirestoreFields = ["name", "address"] as const;

  // `rating` defaults to 0 (set by the spot-rating cloud function); spots
  // without a `location` are filtered out by the indexer so they never
  // reach Typesense. Both are effectively guaranteed at index time even
  // though SpotSchema marks them optional.
  const indexerProvidedDefaults = ["rating", "location"] as const;

  const expectedIndexedFirestoreFields = [
    "name_search",
    "description_search",
    "address.locality",
    "address.country.code",
    "type",
    "access",
    "amenities_true",
    "amenities_false",
    "rating",
    "location",
  ] as const;

  const mapping: CollectionMapping = {
    id: { kind: "doc-id" },
    name: { kind: "direct", source: "name" },
    description: { kind: "direct", source: "description" },
    name_search: { kind: "direct", source: "name_search" },
    description_search: { kind: "direct", source: "description_search" },
    thumbnail_small_url: { kind: "direct", source: "thumbnail_small_url" },
    thumbnail_medium_url: { kind: "direct", source: "thumbnail_medium_url" },
    "address.formatted": { kind: "direct", source: "address.formatted" },
    "address.locality": { kind: "direct", source: "address.locality" },
    "address.country.code": {
      kind: "direct",
      source: "address.country.code",
    },
    amenities_true: { kind: "direct", source: "amenities_true" },
    amenities_false: { kind: "direct", source: "amenities_false" },
    type: { kind: "direct", source: "type" },
    access: { kind: "direct", source: "access" },
    hide_streetview: { kind: "direct", source: "hide_streetview" },
    rating: { kind: "direct", source: "rating" },
    location: { kind: "direct", source: "location" },
    bounds: { kind: "direct", source: "bounds" },
    bounds_center: { kind: "direct", source: "bounds_center" },
    bounds_radius_m: { kind: "direct", source: "bounds_radius_m" },
    _force_sync: {
      kind: "synthetic",
      reason: "Operator-only knob to force Typesense re-index without doc change",
    },
  };

  registerAlignmentTests({
    typesenseSchemaPath: "typesense/typesense_spots_v2_schema.json",
    expectedCollectionName: "spots_v2",
    firestoreFields,
    requiredFirestoreFields,
    indexerProvidedDefaults,
    expectedIndexedFirestoreFields,
    mapping,
  });
});

describe("Typesense communities_v1 ↔ CommunityPageSchema", () => {
  const firestoreFields = [
    "communityKey",
    "scope",
    "displayName",
    "preferredSlug",
    "allSlugs",
    "canonicalPath",
    "title",
    "description",
    "geography",
    "geography.countryCode",
    "geography.countryName",
    "geography.countryLocalName",
    "geography.countrySlug",
    "geography.regionCode",
    "geography.regionName",
    "geography.regionLocalName",
    "geography.regionSlug",
    "geography.localityName",
    "geography.localityLocalName",
    "geography.localitySlug",
    "breadcrumbs",
    "relationships",
    "relationships.parentKeys",
    "relationships.childKeys",
    "relationships.relatedKeys",
    "counts",
    "counts.totalSpots",
    "counts.topRated",
    "counts.dry",
    "topRatedSpots",
    "drySpots",
    "links",
    "resources",
    "organisations",
    "athletes",
    "events",
    "childCommunities",
    "eventPreviews",
    "image",
    "image.type",
    "image.url",
    "published",
    "generatedAt",
    "sourceMaxUpdatedAt",
    "bounds_center",
    "bounds_radius_m",
    "google_maps_place_id",
  ] as const;

  // CommunityPageSchema marks all of these as required strings/numbers/arrays
  // (no `?` on the property). The community-rebuild cloud function always
  // populates them, so Typesense should require them too — Firestore is
  // the source of truth.
  const requiredFirestoreFields = [
    "communityKey",
    "scope",
    "displayName",
    "preferredSlug",
    "allSlugs",
    "canonicalPath",
    "title",
    "description",
    "relationships.parentKeys",
    "counts.totalSpots",
    "counts.topRated",
    "counts.dry",
    "image.url",
    "published",
  ] as const;

  const expectedIndexedFirestoreFields = [
    "communityKey",
    "scope",
    "displayName",
    "preferredSlug",
    "counts.totalSpots",
  ] as const;

  const mapping: CollectionMapping = {
    communityKey: { kind: "direct", source: "communityKey" },
    scope: { kind: "direct", source: "scope" },
    displayName: { kind: "direct", source: "displayName" },
    title: { kind: "direct", source: "title" },
    description: { kind: "direct", source: "description" },
    preferredSlug: { kind: "direct", source: "preferredSlug" },
    allSlugs: { kind: "direct", source: "allSlugs" },
    canonicalPath: { kind: "direct", source: "canonicalPath" },

    "geography.countryCode": { kind: "direct", source: "geography.countryCode" },
    "geography.countryName": { kind: "direct", source: "geography.countryName" },
    "geography.countryLocalName": {
      kind: "direct",
      source: "geography.countryLocalName",
    },
    "geography.regionCode": { kind: "direct", source: "geography.regionCode" },
    "geography.regionName": { kind: "direct", source: "geography.regionName" },
    "geography.regionLocalName": {
      kind: "direct",
      source: "geography.regionLocalName",
    },
    "geography.localityName": { kind: "direct", source: "geography.localityName" },
    "geography.localityLocalName": {
      kind: "direct",
      source: "geography.localityLocalName",
    },

    "relationships.parentKeys": {
      kind: "direct",
      source: "relationships.parentKeys",
    },
    "counts.totalSpots": { kind: "direct", source: "counts.totalSpots" },
    "counts.topRated": { kind: "direct", source: "counts.topRated" },
    "counts.dry": { kind: "direct", source: "counts.dry" },

    bounds_center: { kind: "direct", source: "bounds_center" },
    bounds_radius_m: { kind: "direct", source: "bounds_radius_m" },

    "image.url": { kind: "direct", source: "image.url" },
    published: { kind: "direct", source: "published" },
    _force_sync: {
      kind: "synthetic",
      reason: "Operator-only knob to force Typesense re-index without doc change",
    },
  };

  registerAlignmentTests({
    typesenseSchemaPath: "typesense/typesense_communities_v1_schema.json",
    expectedCollectionName: "communities_v1",
    firestoreFields,
    requiredFirestoreFields,
    expectedIndexedFirestoreFields,
    mapping,
  });
});

describe("Typesense users_v1 ↔ UserSchema", () => {
  const firestoreFields = [
    "display_name",
    "biography",
    "home_spots",
    "profile_picture",
    "follower_count",
    "following_count",
    "visited_spots_count",
    "spot_creates_count",
    "spot_edits_count",
    "media_added_count",
    "signup_number",
    "is_admin",
    "special_badges",
    "blocked_users",
    "pinned_badges",
    "start_date",
    "start_date_raw_ms",
    "nationality_code",
    "verified_email",
    "invite_code",
    "home_city",
    "socials",
    "socials.instagram_handle",
    "socials.youtube_handle",
    "socials.other",
    "creationDate",
    // `public_search` is a settings-side flag (lives in PrivateUserDataSchema
    // / a separate doc), not on the main UserSchema — but it gets projected
    // onto the Typesense user doc by the indexer so the collection only
    // contains opted-in users for search. Listed here so the mapping is
    // valid.
    "public_search",
  ] as const;

  const requiredFirestoreFields = [] as const;

  const expectedIndexedFirestoreFields = [
    "display_name",
    "follower_count",
    "nationality_code",
    "home_city",
    "special_badges",
  ] as const;

  const mapping: CollectionMapping = {
    id: { kind: "doc-id" },
    display_name: { kind: "direct", source: "display_name" },
    biography: { kind: "direct", source: "biography" },
    profile_picture: { kind: "direct", source: "profile_picture" },
    home_city: { kind: "direct", source: "home_city" },
    nationality_code: { kind: "direct", source: "nationality_code" },
    follower_count: { kind: "direct", source: "follower_count" },
    following_count: { kind: "direct", source: "following_count" },
    visited_spots_count: { kind: "direct", source: "visited_spots_count" },
    spot_creates_count: { kind: "direct", source: "spot_creates_count" },
    spot_edits_count: { kind: "direct", source: "spot_edits_count" },
    media_added_count: { kind: "direct", source: "media_added_count" },
    signup_number: { kind: "direct", source: "signup_number" },
    start_date_raw_ms: { kind: "direct", source: "start_date_raw_ms" },
    special_badges: { kind: "direct", source: "special_badges" },
    pinned_badges: { kind: "direct", source: "pinned_badges" },
    "socials.instagram_handle": {
      kind: "direct",
      source: "socials.instagram_handle",
    },
    "socials.youtube_handle": {
      kind: "direct",
      source: "socials.youtube_handle",
    },
    public_search: { kind: "direct", source: "public_search" },
    _force_sync: {
      kind: "synthetic",
      reason: "Operator-only knob to force Typesense re-index without doc change",
    },
  };

  registerAlignmentTests({
    typesenseSchemaPath: "typesense/typesense_users_v1_schema.json",
    expectedCollectionName: "users_v1",
    firestoreFields,
    requiredFirestoreFields,
    expectedIndexedFirestoreFields,
    mapping,
  });
});
