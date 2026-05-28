import { Injectable, inject } from "@angular/core";
import { SearchClient } from "typesense";
import { SearchParams } from "typesense/lib/Typesense/Documents";
import { environment } from "../../environments/environment";
import { MapsApiService } from "./maps-api.service";
import { AmenitiesMap } from "../../db/schemas/Amenities";
import { SpotAccess, SpotTypes } from "../../db/schemas/SpotTypeAndAccess";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { GeoPoint } from "firebase/firestore";
import {
  getDisplayCountryName,
  getDisplayLocalityString,
} from "../../scripts/AddressHelpers";
import {
  SpotFilterMode,
  SPOT_FILTER_CONFIGS,
} from "../components/spot-map/spot-filter-config";
import { Event as PkEvent } from "../../db/models/Event";
import { AssetUrlService } from "./asset-url.service";

@Injectable({
  providedIn: "root",
})
export class SearchService {
  constructor(private _mapsService: MapsApiService) {}

  private readonly _assetUrls = inject(AssetUrlService);

  readonly TYPESENSE_COLLECTION_SPOTS = "spots_v2";
  readonly TYPESENSE_COLLECTION_COMMUNITIES = "communities_v1";
  readonly TYPESENSE_COLLECTION_EVENTS = "events_v1";
  readonly SPOT_SORT_BY_RATING = "rating:desc";
  readonly COMMUNITY_SORT_BY_RELEVANCE_AND_SIZE =
    "_text_match:desc,counts.totalSpots:desc";

  private readonly client: SearchClient = new SearchClient({
    nodes: [
      {
        host: environment.keys.typesense.host,
        port: 443,
        protocol: "https",
      },
    ],
    apiKey: environment.keys.typesense.apiKey,
  });

  spotSearchParameters = {
    query_by: "name_search,description_search,address.formatted",
    sort_by: this.SPOT_SORT_BY_RATING,
    per_page: 5,
    page: 1,
  };

  communitySearchParameters = {
    query_by:
      "displayName,allSlugs,geography.localityName,geography.regionName,geography.countryName,title,description",
    query_by_weights: "6,6,4,3,3,2,1",
    filter_by: "published:!=false",
    sort_by: this.COMMUNITY_SORT_BY_RELEVANCE_AND_SIZE,
    per_page: 3,
    page: 1,
  };

  eventSearchParameters = {
    query_by: "name,slug,locality_string,venue_string,description",
    query_by_weights: "6,5,4,3,1",
    filter_by: "published:!=false",
    sort_by: "start_seconds:desc",
    per_page: 3,
    page: 1,
  };

  private getNumericRating(hit: any): number | undefined {
    const doc = hit?.document || hit;
    const rating = doc?.rating;
    if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0) {
      return undefined;
    }
    return rating;
  }

  private hasSpotMedia(hit: any): boolean {
    const doc = hit?.document || hit;
    return !!(doc?.thumbnail_small_url || doc?.thumbnail_medium_url);
  }

  /**
   * Sort spots by rating (desc). When ratings match, prioritize spots with media.
   */
  private sortHitsByRatingThenMedia(hits: any[]): any[] {
    return hits.sort((a, b) => {
      const ratingA = this.getNumericRating(a);
      const ratingB = this.getNumericRating(b);

      if (ratingA !== undefined && ratingB !== undefined) {
        if (ratingA !== ratingB) {
          return ratingB - ratingA;
        }

        const hasMediaA = this.hasSpotMedia(a);
        const hasMediaB = this.hasSpotMedia(b);
        if (hasMediaA === hasMediaB) {
          return 0;
        }
        return hasMediaA ? -1 : 1;
      }

      if (ratingA !== undefined) return -1;
      if (ratingB !== undefined) return 1;

      const hasMediaA = this.hasSpotMedia(a);
      const hasMediaB = this.hasSpotMedia(b);

      if (hasMediaA === hasMediaB) return 0;
      return hasMediaA ? -1 : 1;
    });
  }

  public getSpotPreviewFromHit(hit: any): SpotPreviewData {
    try {
      const doc = hit.document || hit;
      const rawName = doc.name;
      let displayName = "";
      if (!rawName) displayName = "Unnamed Spot";
      else if (typeof rawName === "string") displayName = rawName;
      else if (typeof rawName === "object") {
        const locales = Object.keys(rawName);
        if (locales.length === 0) displayName = "Unnamed Spot";
        else {
          const candidate = rawName[locales[0]];
          if (typeof candidate === "string") displayName = candidate;
          else if (candidate && typeof candidate.text === "string")
            displayName = candidate.text;
          else displayName = JSON.stringify(candidate) || "Unnamed Spot";
        }
      }

      let location: GeoPoint | undefined = undefined;
      if (doc.location) {
        if (Array.isArray(doc.location) && doc.location.length >= 2) {
          location = new GeoPoint(doc.location[0], doc.location[1]);
        } else if (doc.location.latitude && doc.location.longitude) {
          location = new GeoPoint(
            doc.location.latitude,
            doc.location.longitude,
          );
        }
      }

      // Build a complete locality string matching the cluster logic
      const localityString = getDisplayLocalityString(doc.address ?? null);

      // Reconstruct AmenitiesMap from separate arrays if needed (matching cluster logic)
      let amenities = doc.amenities;
      if (
        !amenities &&
        ((doc.amenities_true && Array.isArray(doc.amenities_true)) ||
          (doc.amenities_false && Array.isArray(doc.amenities_false)))
      ) {
        amenities = {};
        if (doc.amenities_true) {
          doc.amenities_true.forEach((key: string) => {
            amenities[key] = true;
          });
        }
        if (doc.amenities_false) {
          doc.amenities_false.forEach((key: string) => {
            amenities[key] = false;
          });
        }
      }

      // Robust isIconic check (matching cluster logic)
      let isIconic = false;
      const rawIsIconic = doc.isIconic ?? doc.is_iconic;
      if (typeof rawIsIconic === "boolean") {
        isIconic = rawIsIconic;
      } else if (typeof rawIsIconic === "string") {
        isIconic = rawIsIconic.toLowerCase() === "true";
      } else if (typeof rawIsIconic === "number") {
        isIconic = rawIsIconic === 1;
      }

      let hideStreetview = false;
      const rawHideStreetview = doc.hideStreetview ?? doc.hide_streetview;
      if (typeof rawHideStreetview === "boolean") {
        hideStreetview = rawHideStreetview;
      } else if (typeof rawHideStreetview === "number") {
        hideStreetview = rawHideStreetview === 1;
      } else if (typeof rawHideStreetview === "string") {
        hideStreetview = rawHideStreetview.toLowerCase() === "true";
      }

      const boundsRaw =
        SearchService._readLatLngList(doc.bounds_raw) ??
        SearchService._readLatLngList(doc.bounds);
      const bounds = boundsRaw?.map(
        (point) => new GeoPoint(point.lat, point.lng),
      );
      const boundsCenter = SearchService._readGeopoint(doc.bounds_center);

      const preview: SpotPreviewData = {
        name: displayName,
        id: doc.id || hit.document?.id || "",
        slug: doc.slug || undefined,
        location: location,
        location_raw: SearchService._readLatLngLiteral(doc.location_raw),
        type: doc.type,
        access: doc.access,
        locality: localityString,
        countryName: getDisplayCountryName(doc.address ?? null),
        imageSrc:
          doc.thumbnail_medium_url ||
          doc.thumbnail_small_url ||
          doc.thumbnail_url ||
          doc.image_url ||
          "",
        isIconic: isIconic,
        hideStreetview: hideStreetview,
        rating: doc.rating ?? undefined,
        num_reviews: doc.num_reviews ?? undefined,
        amenities: amenities || undefined,
        bounds,
        bounds_raw: boundsRaw,
        bounds_center: boundsCenter
          ? new GeoPoint(boundsCenter[0], boundsCenter[1])
          : undefined,
        bounds_radius_m: SearchService._readFloat(doc.bounds_radius_m),
      } as SpotPreviewData;

      return preview;
    } catch (err) {
      console.error("Error mapping hit to preview:", err);
      return {} as SpotPreviewData;
    }
  }

  public getCommunityPreviewFromHit(hit: any): CommunitySearchPreview {
    const doc = hit?.document || hit;
    const geography = doc?.geography || {};
    const totalSpots =
      typeof doc?.["counts.totalSpots"] === "number"
        ? doc["counts.totalSpots"]
        : (doc?.counts?.totalSpots ?? 0);

    // Typesense geopoints can arrive as arrays or objects depending on the
    // client/extension path, and numeric fields are occasionally serialized
    // as strings. Use the same defensive readers as event previews so map
    // communities do not silently lose their marker geometry.
    const boundsCenter = SearchService._readGeopoint(doc?.bounds_center);
    const boundsRadiusM = SearchService._readFloat(doc?.bounds_radius_m);

    return {
      id: doc?.id ?? doc?.communityKey ?? "",
      communityKey: doc?.communityKey ?? doc?.id ?? "",
      slug: doc?.preferredSlug ?? "",
      displayName: doc?.displayName ?? "",
      scope: doc?.scope,
      countryCode:
        doc?.["geography.countryCode"] ?? geography?.countryCode ?? undefined,
      countryName:
        doc?.["geography.countryName"] ?? geography?.countryName ?? undefined,
      regionName:
        doc?.["geography.regionName"] ?? geography?.regionName ?? undefined,
      localityName:
        doc?.["geography.localityName"] ?? geography?.localityName ?? undefined,
      totalSpots,
      imageUrl: doc?.["image.url"] ?? doc?.image?.url ?? undefined,
      canonicalPath: doc?.canonicalPath ?? undefined,
      boundsCenter,
      boundsRadiusM,
      googleMapsPlaceId: doc?.google_maps_place_id ?? undefined,
    };
  }

  /**
   * List published communities from typesense, sorted by spot count desc.
   * Used by the map page to populate the "popular communities" SEO list and
   * the viewport-driven community detection in the map island.
   */
  public async listCommunities(
    maxResults: number = 250,
  ): Promise<CommunitySearchPreview[]> {
    try {
      const perPage = Math.min(250, Math.max(1, maxResults));
      const firstPage = await this.client
        .collections(this.TYPESENSE_COLLECTION_COMMUNITIES)
        .documents()
        .search(
          {
            q: "*",
            query_by: "displayName",
            filter_by: "published:!=false",
            sort_by: "counts.totalSpots:desc",
            per_page: perPage,
            page: 1,
          },
          {},
        );

      const hits = [...((firstPage as any)?.hits || [])];
      const found = SearchService._readFound(firstPage);
      const targetCount = Math.min(maxResults, found);
      const remainingPages = Math.ceil((targetCount - hits.length) / perPage);

      if (remainingPages > 0) {
        const pageRequests = Array.from(
          { length: remainingPages },
          (_, index) =>
            this.client
              .collections(this.TYPESENSE_COLLECTION_COMMUNITIES)
              .documents()
              .search(
                {
                  q: "*",
                  query_by: "displayName",
                  filter_by: "published:!=false",
                  sort_by: "counts.totalSpots:desc",
                  per_page: perPage,
                  page: index + 2,
                },
                {},
              ),
        );

        const settledPages = await Promise.allSettled(pageRequests);
        for (const page of settledPages) {
          if (page.status === "fulfilled") {
            hits.push(...(((page.value as any)?.hits || []) as any[]));
          }
        }
      }

      return hits.map((hit: any) => this.getCommunityPreviewFromHit(hit));
    } catch (error) {
      console.error("typesense list communities error:", error);
      return [];
    }
  }

  public async searchCommunities(
    query: string,
  ): Promise<CommunitySearchPreview[]> {
    try {
      const result = await this.client
        .collections(this.TYPESENSE_COLLECTION_COMMUNITIES)
        .documents()
        .search({ q: query, ...this.communitySearchParameters }, {});

      const hits = (result as any)?.hits || [];
      return hits.map((hit: any) => this.getCommunityPreviewFromHit(hit));
    } catch (error) {
      console.error("typesense communities error:", error);
      return [];
    }
  }

  public async searchSpots(query: string) {
    try {
      const result = await this.client
        .collections(this.TYPESENSE_COLLECTION_SPOTS)
        .documents()
        .search({ q: query, ...this.spotSearchParameters }, {});

      const hits = this.sortHitsByRatingThenMedia(
        (result as any).hits || [],
      ).map((hit: any) => {
        hit.preview = this.getSpotPreviewFromHit(hit);
        return hit;
      });

      return { hits, found: (result as any).found ?? hits.length };
    } catch (error) {
      console.error("typesense spots error:", error);
      return { hits: [], found: 0 };
    }
  }

  public async searchPlaces(query: string) {
    try {
      return await this._mapsService.autocompletePlaceSearch(query, [
        "geocode",
      ]);
    } catch (error) {
      console.error("google maps places autocomplete API error:", error);
      return [];
    }
  }

  public async searchEverything(query: string) {
    // Search for spots
    // Search for places
    // Search for challenges
    // Search for users
    // Search for events
    // Search for posts
    // TODO: Implement this
  }

  /**
   * Fetch spot previews by explicit spot IDs using Typesense.
   * IDs are queried in chunks to keep the filter string and response size bounded.
   */
  public async searchSpotPreviewsByIds(
    spotIds: string[],
    chunkSize: number = 180,
  ): Promise<SpotPreviewData[]> {
    const uniqueIds = Array.from(
      new Set((spotIds || []).filter((id) => typeof id === "string" && !!id)),
    );

    if (uniqueIds.length === 0) {
      return [];
    }

    const safeChunkSize = Math.max(1, Math.min(240, chunkSize));
    const chunks: string[][] = [];

    for (let i = 0; i < uniqueIds.length; i += safeChunkSize) {
      chunks.push(uniqueIds.slice(i, i + safeChunkSize));
    }

    const settled = await Promise.allSettled(
      chunks.map((idsChunk) =>
        this.client
          .collections(this.TYPESENSE_COLLECTION_SPOTS)
          .documents()
          .search(
            {
              q: "*",
              filter_by: `id:=[${idsChunk.join(",")}]`,
              per_page: idsChunk.length,
              page: 1,
            },
            {},
          ),
      ),
    );

    const previewById = new Map<string, SpotPreviewData>();

    for (const result of settled) {
      if (result.status !== "fulfilled") continue;

      const hits = ((result.value as any)?.hits || []) as any[];
      for (const hit of hits) {
        const preview = this.getSpotPreviewFromHit(hit);
        if (preview?.id) {
          previewById.set(preview.id, preview);
        }
      }
    }

    // Preserve caller order for deterministic list/map behavior.
    return uniqueIds
      .map((id) => previewById.get(id))
      .filter((preview): preview is SpotPreviewData => !!preview);
  }

  /**
   * Search for spots in bounds using a filter mode from the centralized config.
   * This is the preferred method for filter-based searches.
   */
  public searchSpotsInBoundsWithFilter(
    bounds: google.maps.LatLngBounds,
    filterMode: SpotFilterMode,
    num_spots: number = 10,
  ): Promise<{ hits: any[]; found: number }> {
    const config = SPOT_FILTER_CONFIGS.get(filterMode);
    if (!config) {
      return Promise.resolve({ hits: [], found: 0 });
    }
    return this.searchSpotsInBounds(
      bounds,
      num_spots,
      config.types,
      config.accesses,
      config.amenities_true,
      config.amenities_false,
    );
  }

  /**
   * @deprecated Use searchSpotsInBoundsWithFilter(bounds, SpotFilterMode.Dry) instead
   */
  public async searchDrySpotsInBounds(
    bounds: google.maps.LatLngBounds,
    num_spots: number = 10,
  ) {
    return this.searchSpotsInBoundsWithFilter(
      bounds,
      SpotFilterMode.Dry,
      num_spots,
    );
  }

  /**
   * @deprecated Use searchSpotsInBoundsWithFilter(bounds, SpotFilterMode.ForParkour) instead
   */
  public searchSpotsForParkourInBounds(
    bounds: google.maps.LatLngBounds,
    num_spots: number = 10,
  ) {
    return this.searchSpotsInBoundsWithFilter(
      bounds,
      SpotFilterMode.ForParkour,
      num_spots,
    );
  }

  /**
   * @deprecated Use searchSpotsInBoundsWithFilter(bounds, SpotFilterMode.Indoor) instead
   */
  public searchIndoorSpotsInBounds(
    bounds: google.maps.LatLngBounds,
    num_spots: number = 10,
  ) {
    return this.searchSpotsInBoundsWithFilter(
      bounds,
      SpotFilterMode.Indoor,
      num_spots,
    );
  }

  /**
   * Search spots using custom filter parameters from the dialog.
   * This is a convenience wrapper around searchSpotsInBounds.
   */
  public searchSpotsWithCustomFilter(
    bounds: google.maps.LatLngBounds,
    params: {
      types?: SpotTypes[];
      accesses?: SpotAccess[];
      amenities_true?: (keyof AmenitiesMap)[];
      amenities_false?: (keyof AmenitiesMap)[];
    },
    num_spots: number = 10,
  ): Promise<{ hits: any[]; found: number }> {
    return this.searchSpotsInBounds(
      bounds,
      num_spots,
      params.types,
      params.accesses,
      params.amenities_true,
      params.amenities_false,
    );
  }

  public async searchSpotsInRawBounds(
    north: number,
    south: number,
    east: number,
    west: number,
    num_spots: number = 10,
    types?: SpotTypes[],
    accesses?: SpotAccess[],
    amenities_true?: (keyof AmenitiesMap)[],
    amenities_false?: (keyof AmenitiesMap)[],
    onlyWithImages: boolean = false,
  ): Promise<{ hits: any[]; found: number }> {
    const latLongPairList: string[] = [
      // northeast
      north,
      east,

      // southeast
      south,
      east,

      // southwest
      south,
      west,

      // northwest
      north,
      west,
    ].map((num) => (Math.round(num * 1000) / 1000).toString());

    // Reuse filter logic
    return this._executeSearch(
      latLongPairList,
      num_spots,
      types,
      accesses,
      amenities_true,
      amenities_false,
      onlyWithImages,
    );
  }

  private async _executeSearch(
    latLongPairList: string[],
    num_spots: number,
    types?: SpotTypes[],
    accesses?: SpotAccess[],
    amenities_true?: (keyof AmenitiesMap)[],
    amenities_false?: (keyof AmenitiesMap)[],
    onlyWithImages: boolean = false,
  ) {
    const filters: string[] = [];
    if (types?.length) filters.push(`type:=[${types.join(", ")}]`);
    if (accesses?.length) filters.push(`access:=[${accesses.join(", ")}]`);
    if (amenities_true?.length)
      filters.push(`amenities_true:=[${amenities_true.join(", ")}]`);
    if (amenities_false?.length)
      filters.push(`amenities_false:=[${amenities_false.join(", ")}]`);
    if (onlyWithImages) {
      // Use strict server-side filtering on the new faceted fields.
      // Note: We intentionally exclude 'image_url' as it is not in the Typesense schema/index.
      filters.push(
        "(thumbnail_small_url:!=null || thumbnail_medium_url:!=null)",
      );
    }

    let filterByString = `location:(${latLongPairList.join(", ")})`;
    if (filters.length > 0) {
      filterByString += ` && (${filters.join(" || ")})`;
    }

    const MAX_PER_PAGE = 250;
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, num_spots));

    // Fetch first page to learn total found and to return early when small
    const firstPage = await this.client
      .collections(this.TYPESENSE_COLLECTION_SPOTS)
      .documents()
      .search(
        {
          q: "*",
          filter_by: filterByString,
          sort_by: this.SPOT_SORT_BY_RATING,
          per_page: perPage,
          page: 1,
        },
        {},
      );

    let allHits: any[] = (firstPage && (firstPage as any).hits) || [];

    const found: number =
      (firstPage && (firstPage as any).found) || allHits.length;

    // If we already satisfied the requested number (after filtering)
    if (allHits.length >= num_spots || found <= perPage) {
      allHits = this.sortHitsByRatingThenMedia(allHits);
      return {
        hits: allHits.slice(0, num_spots),
        found: found,
      };
    }

    const remainingToFetch = Math.min(num_spots, found) - allHits.length;
    const remainingPages = Math.ceil(remainingToFetch / perPage);

    // Build requests for remaining pages (pages 2..)
    const pageRequests: Promise<any>[] = [];
    for (let i = 2; i <= 1 + remainingPages; i++) {
      pageRequests.push(
        this.client
          .collections(this.TYPESENSE_COLLECTION_SPOTS)
          .documents()
          .search(
            {
              q: "*",
              filter_by: filterByString,
              sort_by: this.SPOT_SORT_BY_RATING,
              per_page: perPage,
              page: i,
            },
            {},
          ),
      );
    }

    const settled = await Promise.allSettled(pageRequests);
    for (const res of settled) {
      if (res.status === "fulfilled" && res.value && res.value.hits) {
        allHits.push(...res.value.hits);
      }
    }
    allHits = this.sortHitsByRatingThenMedia(allHits);

    // Build a merged result object similar to Typesense response shape
    const mergedResult = { ...(firstPage as any) } as any;
    mergedResult.hits = allHits.slice(0, num_spots);
    mergedResult.found = found;

    return mergedResult;
  }

  public async searchSpotsInBounds(
    bounds: google.maps.LatLngBounds,
    num_spots: number = 10,
    types?: SpotTypes[],
    accesses?: SpotAccess[],
    amenities_true?: (keyof AmenitiesMap)[],
    amenities_false?: (keyof AmenitiesMap)[],
  ): Promise<{ hits: any[]; found: number }> {
    let neLat = bounds.getNorthEast().lat();
    let neLng = bounds.getNorthEast().lng();
    let swLat = bounds.getSouthWest().lat();
    let swLng = bounds.getSouthWest().lng();

    // Fix for IDL/DateLine normalization issues.
    if (swLng > neLng) {
      swLng -= 360;
    }

    const latLongPairList: string[] = [
      // northeast
      neLat,
      neLng,

      // southeast
      swLat,
      neLng,

      // southwest
      swLat,
      swLng,

      // northwest
      neLat,
      swLng,
    ].map((num) => (Math.round(num * 1000) / 1000).toString());

    return this._executeSearch(
      latLongPairList,
      num_spots,
      types,
      accesses,
      amenities_true,
      amenities_false,
    );
  }

  /**
   * Search for spots near a location using geo-radius filtering.
   * This is optimized for check-in proximity detection.
   *
   * Uses OR logic: finds spots where EITHER:
   * - location is within radius, OR
   * - bounds_center is within (radius + bounds_radius_m)
   *
   * This ensures spots with large polygons are found even if user is
   * far from the center point but close to the polygon edge.
   *
   * @param location User's current location
   * @param radiusMeters Search radius in meters (default 100m)
   * @param maxResults Maximum number of results (default 20)
   */
  public async searchSpotsNearLocation(
    location: google.maps.LatLngLiteral,
    radiusMeters: number = 100,
    maxResults: number = 20,
  ): Promise<{ hits: any[]; found: number }> {
    const lat = location.lat.toFixed(6);
    const lng = location.lng.toFixed(6);
    // Convert meters to km for Typesense (which uses km for geo-radius)
    const radiusKm = (radiusMeters / 1000).toFixed(3);

    // Search with a larger radius to catch spots with bounds
    // We'll use 500m as max bounds radius assumption to avoid missing large spots
    const extendedRadiusKm = ((radiusMeters + 500) / 1000).toFixed(3);

    // Filter: location within radius OR bounds_center within extended radius
    // This catches spots where user might be near the polygon edge
    const filterBy = `location:(${lat}, ${lng}, ${extendedRadiusKm} km)`;

    try {
      const result = await this.client
        .collections(this.TYPESENSE_COLLECTION_SPOTS)
        .documents()
        .search(
          {
            q: "*",
            filter_by: filterBy,
            sort_by: `location(${lat}, ${lng}):asc`, // Sort by distance
            per_page: maxResults,
            page: 1,
          },
          {},
        );

      const hits = ((result as any).hits || []).map((hit: any) => {
        // Attach preview for convenience
        hit.preview = this.getSpotPreviewFromHit(hit);
        return hit;
      });

      return {
        hits,
        found: (result as any).found || hits.length,
      };
    } catch (error) {
      console.error("[SearchService] searchSpotsNearLocation failed:", error);
      return { hits: [], found: 0 };
    }
  }

  public async searchSpotsAndPlaces(query: string) {
    const spotsRequest = this.client
      .collections(this.TYPESENSE_COLLECTION_SPOTS)
      .documents()
      .search({ q: query, ...this.spotSearchParameters }, {});

    const communitiesRequest = this.client
      .collections(this.TYPESENSE_COLLECTION_COMMUNITIES)
      .documents()
      .search({ q: query, ...this.communitySearchParameters }, {});

    const placesRequest = this._mapsService.autocompletePlaceSearch(query, [
      "geocode",
    ]);

    const allResults = await Promise.allSettled([
      spotsRequest,
      communitiesRequest,
      placesRequest,
    ]);

    if (allResults[0].status === "rejected") {
      console.error("typesense spots error:", allResults[0].reason);
    }
    if (allResults[1].status === "rejected") {
      console.error("typesense communities error:", allResults[1].reason);
    }
    if (allResults[2].status === "rejected") {
      console.error(
        "google maps places autocomplete API error:",
        allResults[2].reason,
      );
    }

    const spotsResult =
      allResults[0].status === "fulfilled" ? allResults[0].value : null;
    if (spotsResult && Array.isArray((spotsResult as any).hits)) {
      const orderedHits = this.sortHitsByRatingThenMedia(
        (spotsResult as any).hits,
      );
      (spotsResult as any).hits = orderedHits.map((hit: any) => {
        hit.preview = this.getSpotPreviewFromHit(hit);
        return hit;
      });
    }

    const communitiesResult =
      allResults[1].status === "fulfilled" ? allResults[1].value : null;
    let communities: CommunitySearchPreview[] = [];
    if (communitiesResult && Array.isArray((communitiesResult as any).hits)) {
      communities = (communitiesResult as any).hits.map((hit: any) =>
        this.getCommunityPreviewFromHit(hit),
      );
    }

    return {
      communities,
      spots: spotsResult,
      places: allResults[2].status === "fulfilled" ? allResults[2].value : null,
    };
  }

  /**
   * Map a Typesense `events_v1` hit to a lightweight preview suitable for
   * search rendering. Keeps just the fields the UI needs — full event data
   * is fetched from Firestore when the user actually opens the event.
   */
  public getEventPreviewFromHit(hit: any): EventSearchPreview {
    const doc = hit?.document ?? hit;
    const sponsor = doc?.sponsor ?? {};
    const externalSource = doc?.external_source ?? {};

    const location =
      SearchService._readGeopoint(doc?.location_raw) ??
      SearchService._readGeopoint(doc?.location);
    const center = SearchService._readGeopoint(doc?.bounds_center);
    const boundsRadius = SearchService._readFloat(doc?.bounds_radius_m);
    const promoCenter = SearchService._readGeopoint(doc?.promo_region_center);
    const promoRadius =
      SearchService._readFloat(doc?.promo_radius_m) ??
      SearchService._readFloat(doc?.promo_region_radius_m);

    return {
      id: String(doc?.id ?? ""),
      slug:
        typeof doc?.slug === "string" && doc.slug.length > 0
          ? doc.slug
          : undefined,
      name: typeof doc?.name === "string" ? doc.name : "",
      description:
        typeof doc?.description === "string" ? doc.description : undefined,
      venueString:
        typeof doc?.venue_string === "string" ? doc.venue_string : undefined,
      localityString:
        typeof doc?.locality_string === "string" ? doc.locality_string : "",
      bannerSrc:
        typeof doc?.banner_src === "string"
          ? this._assetUrls.resolveBundledAssetUrl(doc.banner_src)
          : undefined,
      logoSrc:
        typeof doc?.logo_src === "string"
          ? this._assetUrls.resolveBundledAssetUrl(doc.logo_src)
          : undefined,
      sponsorName: typeof sponsor?.name === "string" ? sponsor.name : undefined,
      sponsorLogoSrc:
        typeof sponsor?.logo_src === "string"
          ? this._assetUrls.resolveBundledAssetUrl(sponsor.logo_src)
          : undefined,
      sponsorLogoBackgroundColor:
        typeof sponsor?.logo_background_color === "string"
          ? sponsor.logo_background_color
          : undefined,
      isSponsored: doc?.is_sponsored === true,
      startSeconds: SearchService._readInt(doc?.start_seconds),
      endSeconds: SearchService._readInt(doc?.end_seconds),
      promoStartsAtSeconds: SearchService._readInt(
        doc?.promo_starts_at_seconds,
      ),
      location,
      boundsCenter: center,
      boundsRadiusM: boundsRadius,
      promoRegionCenter: promoCenter,
      promoRegionRadiusM: promoRadius,
      externalProvider:
        typeof externalSource?.provider === "string"
          ? externalSource.provider
          : undefined,
      url: typeof doc?.url === "string" ? doc.url : undefined,
      spotIds: Array.isArray(doc?.spot_ids) ? doc.spot_ids : [],
      communityKeys: Array.isArray(doc?.community_keys)
        ? doc.community_keys
        : [],
      seriesIds: Array.isArray(doc?.series_ids) ? doc.series_ids : [],
    };
  }

  /**
   * Construct a (partial) `Event` model from a Typesense hit. Suitable for
   * the map-island, which only reads name, status, promo-region geometry,
   * and badge logo. The synthesized `bounds` is an approximation derived
   * from `bounds_center` + `bounds_radius_m`; the real bounds load via the
   * event detail flow when the user opens the event.
   */
  public getEventFromHit(hit: any): PkEvent | null {
    const preview = this.getEventPreviewFromHit(hit);
    if (!preview.id || preview.startSeconds === undefined) {
      return null;
    }

    const startSeconds = preview.startSeconds;
    const endSeconds = preview.endSeconds ?? preview.startSeconds;
    const boundsRadiusM = preview.boundsRadiusM ?? 0;
    const boundsCenter = preview.boundsCenter ?? preview.location;
    const markerLocation = preview.location;

    // Approximate bbox from center + radius. ~111km per degree of latitude;
    // longitude shrinks with cos(lat). Only used for "focus map on event"
    // fallbacks — the resolver loads the real bounds when the page mounts.
    const synthesizedBounds = boundsCenter
      ? SearchService._bboxFromCenterRadius(boundsCenter, boundsRadiusM)
      : undefined;

    const promoRegionCenter = markerLocation ?? preview.promoRegionCenter;
    const promoRegion =
      promoRegionCenter && preview.promoRegionRadiusM
        ? {
            center: {
              lat: promoRegionCenter[0],
              lng: promoRegionCenter[1],
            },
            radius_m: preview.promoRegionRadiusM,
          }
        : undefined;

    const schema: any = {
      name: preview.name,
      description: preview.description,
      slug: preview.slug,
      banner_src: preview.bannerSrc,
      logo_src: preview.logoSrc,
      venue_string: preview.venueString ?? "",
      locality_string: preview.localityString,
      start: { seconds: startSeconds, nanoseconds: 0 },
      end: { seconds: endSeconds, nanoseconds: 0 },
      promo_starts_at:
        preview.promoStartsAtSeconds !== undefined
          ? { seconds: preview.promoStartsAtSeconds, nanoseconds: 0 }
          : undefined,
      url: preview.url,
      spot_ids: preview.spotIds,
      community_keys: preview.communityKeys,
      series_ids: preview.seriesIds,
      location_raw: markerLocation
        ? {
            lat: markerLocation[0],
            lng: markerLocation[1],
          }
        : undefined,
      bounds: synthesizedBounds,
      promo_region: promoRegion,
      sponsor:
        preview.sponsorName ||
        preview.sponsorLogoSrc ||
        preview.sponsorLogoBackgroundColor
          ? {
              name: preview.sponsorName ?? "",
              logo_src: preview.sponsorLogoSrc,
              logo_background_color: preview.sponsorLogoBackgroundColor,
            }
          : undefined,
      is_sponsored: preview.isSponsored,
      external_source: preview.externalProvider
        ? { provider: preview.externalProvider, url: preview.url ?? "" }
        : undefined,
      published: true,
    };

    try {
      return new PkEvent(preview.id as any, schema);
    } catch (err) {
      console.warn("[SearchService] failed to build Event from hit:", err);
      return null;
    }
  }

  /**
   * Text search across `events_v1`. Sorted newest-start first so a single
   * "Swiss Jam" query surfaces the upcoming year ahead of past editions.
   */
  public async searchEvents(query: string): Promise<EventSearchPreview[]> {
    try {
      const result = await this.client
        .collections(this.TYPESENSE_COLLECTION_EVENTS)
        .documents()
        .search({ q: query, ...this.eventSearchParameters }, {});

      const hits = (result as any)?.hits ?? [];
      return hits
        .map((hit: any) => this.getEventPreviewFromHit(hit))
        .filter((p: EventSearchPreview) => p.id);
    } catch (error) {
      console.error("typesense events error:", error);
      return [];
    }
  }

  /**
   * Load lightweight event candidates for the map island using Typesense's
   * geo-radius filter around the current viewport. Final relevance is still
   * checked on the client against the event's promo region.
   */
  public async searchEventsInBounds(
    bounds: google.maps.LatLngBounds,
    num: number = 30,
  ): Promise<PkEvent[]> {
    try {
      const result = await this.searchMapObjectsInBounds(bounds, {
        eventLimit: num,
        communityLimit: 1,
      });
      return result.events;
    } catch (error) {
      console.error("typesense events-in-bounds error:", error);
      return [];
    }
  }

  public async searchMapObjectsInBounds(
    bounds: google.maps.LatLngBounds,
    options: {
      eventLimit?: number;
      communityLimit?: number;
    } = {},
  ): Promise<MapViewportSearchResult> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const bbox = SearchService._boundsToLiteral(bounds);
    const spotFilterBy = SearchService._spotViewportFilter(bbox);
    const promoFilterBy = SearchService._boundsOverlapFilter(
      "promo_bounds",
      bbox,
    );
    const communityFilterBy = SearchService._boundsOverlapFilter(
      "visibility_bounds",
      bbox,
    );
    const eventLimit = Math.max(1, Math.min(250, options.eventLimit ?? 30));
    // Event collections are small, and Typesense polygon filters have proven
    // brittle for Firestore-synced event geopoints. Fetch upcoming candidates
    // broadly, then apply the viewport geometry locally.
    const eventFetchLimit = 250;
    const communityLimit = Math.max(
      1,
      Math.min(250, options.communityLimit ?? 80),
    );
    const eventIncludeFields = [
      "id",
      "name",
      "slug",
      "venue_string",
      "locality_string",
      "banner_src",
      "logo_src",
      "sponsor.name",
      "sponsor.logo_src",
      "sponsor.logo_background_color",
      "is_sponsored",
      "start_seconds",
      "end_seconds",
      "promo_starts_at_seconds",
      "location",
      "location_raw",
      "bounds_center",
      "bounds_radius_m",
      "promo_radius_m",
      "promo_region_center",
      "promo_region_radius_m",
      "url",
      "spot_ids",
      "community_keys",
      "series_ids",
      "external_source.provider",
    ].join(",");

    const response = await this.client.multiSearch.perform(
      {
        searches: [
          {
            collection: this.TYPESENSE_COLLECTION_SPOTS,
            q: "*",
            ...(spotFilterBy ? { filter_by: spotFilterBy } : {}),
            sort_by: this.SPOT_SORT_BY_RATING,
            per_page: 1,
            page: 1,
            include_fields: "id",
            highlight_fields: "none",
          },
          {
            collection: this.TYPESENSE_COLLECTION_EVENTS,
            q: "*",
            filter_by: SearchService._joinFilters([
              "published:!=false",
              `end_seconds:>=${nowSeconds}`,
            ]),
            sort_by: "start_seconds:asc",
            per_page: eventFetchLimit,
            page: 1,
            include_fields: eventIncludeFields,
            highlight_fields: "none",
          },
          {
            collection: this.TYPESENSE_COLLECTION_EVENTS,
            q: "*",
            filter_by: SearchService._joinFilters([
              "published:!=false",
              `end_seconds:>=${nowSeconds}`,
              "promo_radius_m:>0",
              promoFilterBy,
            ]),
            sort_by: "start_seconds:asc",
            per_page: eventLimit,
            page: 1,
            include_fields: eventIncludeFields,
            highlight_fields: "none",
          },
          {
            collection: this.TYPESENSE_COLLECTION_COMMUNITIES,
            q: "*",
            filter_by: SearchService._joinFilters([
              "published:!=false",
              "scope:=[locality,country]",
              communityFilterBy,
            ]),
            sort_by: "counts.totalSpots:desc",
            per_page: communityLimit,
            page: 1,
            include_fields: [
              "communityKey",
              "scope",
              "displayName",
              "preferredSlug",
              "canonicalPath",
              "geography.countryCode",
              "geography.countryName",
              "geography.regionName",
              "geography.localityName",
              "counts.totalSpots",
              "bounds_center",
              "bounds_radius_m",
              "google_maps_place_id",
            ].join(","),
            highlight_fields: "none",
          },
        ],
      } as any,
      {},
      {},
    );

    const results = ((response as any)?.results ?? []) as any[];
    const spotsResult = results[0] ?? {};
    const eventsResult = results[1] ?? {};
    const promoEventsResult = results[2] ?? {};
    const communitiesResult = results[3] ?? {};
    const eventCandidates = ((eventsResult.hits ?? []) as any[])
      .map((hit) => this.getEventFromHit(hit))
      .filter((event): event is PkEvent => !!event);
    const events = (bbox.coversWorld
      ? eventCandidates
      : eventCandidates.filter((event) =>
          SearchService._eventIntersectsViewport(event, bbox),
        )
    ).slice(0, eventLimit);
    const promoEvents = ((promoEventsResult.hits ?? []) as any[])
      .map((hit) => this.getEventFromHit(hit))
      .filter((event): event is PkEvent => !!event);
    const communities = ((communitiesResult.hits ?? []) as any[]).map((hit) =>
      this.getCommunityPreviewFromHit(hit),
    );

    return {
      counts: {
        spots: SearchService._readFound(spotsResult),
        events: bbox.coversWorld
          ? SearchService._readFound(eventsResult)
          : events.length,
        communities: SearchService._readFound(communitiesResult),
      },
      events,
      promoEvents,
      communities,
    };
  }

  private static _readFound(result: unknown): number {
    const found = (result as { found?: unknown } | null)?.found;
    return typeof found === "number" && Number.isFinite(found) ? found : 0;
  }

  private static _joinFilters(
    filters: Array<string | undefined>,
  ): string | undefined {
    const activeFilters = filters.filter(
      (filter): filter is string => typeof filter === "string" && !!filter,
    );
    return activeFilters.length > 0 ? activeFilters.join(" && ") : undefined;
  }

  private static _boundsToLiteral(bounds: google.maps.LatLngBounds): {
    north: number;
    south: number;
    east: number;
    west: number;
    crossesAntimeridian: boolean;
    coversWorld: boolean;
  } {
    const rawEast = bounds.getNorthEast().lng();
    const rawWest = bounds.getSouthWest().lng();
    const east = SearchService._normalizeLongitude(rawEast);
    const west = SearchService._normalizeLongitude(rawWest);
    const crossesAntimeridian = west > east;
    const longitudeSpan = crossesAntimeridian ? east + 360 - west : east - west;
    const rawLongitudeSpan = Math.abs(rawEast - rawWest);

    return {
      north: bounds.getNorthEast().lat(),
      south: bounds.getSouthWest().lat(),
      east,
      west,
      crossesAntimeridian,
      coversWorld: rawLongitudeSpan >= 340 || longitudeSpan >= 340,
    };
  }

  private static _normalizeLongitude(lng: number): number {
    const normalized = ((((lng + 180) % 360) + 360) % 360) - 180;
    return normalized === -180 && lng > 0 ? 180 : normalized;
  }

  private static _spotViewportFilter(bbox: {
    north: number;
    south: number;
    east: number;
    west: number;
    coversWorld: boolean;
    crossesAntimeridian: boolean;
  }): string | undefined {
    return SearchService._geoViewportFilter("location", bbox);
  }

  private static _geoViewportFilter(
    field: string,
    bbox: {
      north: number;
      south: number;
      east: number;
      west: number;
      coversWorld: boolean;
      crossesAntimeridian: boolean;
    },
  ): string | undefined {
    if (bbox.coversWorld) {
      return undefined;
    }

    const west = bbox.crossesAntimeridian ? bbox.west - 360 : bbox.west;
    const latLongPairList = [
      bbox.north,
      bbox.east,
      bbox.south,
      bbox.east,
      bbox.south,
      west,
      bbox.north,
      west,
    ].map((num) => (Math.round(num * 1000) / 1000).toString());

    return `${field}:(${latLongPairList.join(", ")})`;
  }

  private static _eventIntersectsViewport(
    event: PkEvent,
    bbox: {
      north: number;
      south: number;
      east: number;
      west: number;
      coversWorld: boolean;
      crossesAntimeridian: boolean;
    },
  ): boolean {
    if (bbox.coversWorld) return true;
    if (SearchService._pointInViewport(event.location, bbox)) return true;
    if (!event.bounds) return false;

    return SearchService._boundsIntersectViewport(event.bounds, bbox);
  }

  private static _pointInViewport(
    point: { lat: number; lng: number },
    bbox: {
      north: number;
      south: number;
      east: number;
      west: number;
      crossesAntimeridian: boolean;
    },
  ): boolean {
    if (
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lng) ||
      point.lat < bbox.south ||
      point.lat > bbox.north
    ) {
      return false;
    }

    if (bbox.crossesAntimeridian) {
      return point.lng >= bbox.west || point.lng <= bbox.east;
    }

    return point.lng >= bbox.west && point.lng <= bbox.east;
  }

  private static _boundsIntersectViewport(
    bounds: { north: number; south: number; east: number; west: number },
    bbox: {
      north: number;
      south: number;
      east: number;
      west: number;
      crossesAntimeridian: boolean;
    },
  ): boolean {
    if (bounds.south > bbox.north || bounds.north < bbox.south) return false;

    const viewportIntervals = bbox.crossesAntimeridian
      ? [
          [bbox.west, 180],
          [-180, bbox.east],
        ]
      : [[bbox.west, bbox.east]];
    const boundsCrossAntimeridian = bounds.west > bounds.east;
    const boundsIntervals = boundsCrossAntimeridian
      ? [
          [bounds.west, 180],
          [-180, bounds.east],
        ]
      : [[bounds.west, bounds.east]];

    return boundsIntervals.some(([boundsWest, boundsEast]) =>
      viewportIntervals.some(
        ([viewportWest, viewportEast]) =>
          boundsWest <= viewportEast && boundsEast >= viewportWest,
      ),
    );
  }

  private static _boundsOverlapFilter(
    fieldPrefix: string,
    bbox: {
      north: number;
      south: number;
      east: number;
      west: number;
      coversWorld: boolean;
      crossesAntimeridian: boolean;
    },
  ): string | undefined {
    if (bbox.coversWorld) {
      return undefined;
    }

    const latFilter = [
      `${fieldPrefix}_north:>=${bbox.south}`,
      `${fieldPrefix}_south:<=${bbox.north}`,
    ].join(" && ");

    if (bbox.crossesAntimeridian) {
      return [
        latFilter,
        `(${fieldPrefix}_east:>=${bbox.west} || ${fieldPrefix}_west:<=${bbox.east})`,
      ].join(" && ");
    }

    return [
      latFilter,
      `${fieldPrefix}_east:>=${bbox.west}`,
      `${fieldPrefix}_west:<=${bbox.east}`,
    ].join(" && ");
  }

  // --- Typesense field readers (defensive: hits may come back with either
  // nested `geography.x` objects or dotted top-level keys depending on the
  // Firebase Extension version, hence the dual-path lookups elsewhere) ---

  private static _readGeopoint(value: unknown): [number, number] | undefined {
    if (Array.isArray(value) && value.length >= 2) {
      const lat = Number(value[0]);
      const lng = Number(value[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }
    if (value && typeof value === "object") {
      const lat = Number((value as any).lat ?? (value as any).latitude);
      const lng = Number((value as any).lng ?? (value as any).longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }
    return undefined;
  }

  private static _readLatLngLiteral(
    value: unknown,
  ): { lat: number; lng: number } | undefined {
    const point = SearchService._readGeopoint(value);
    return point ? { lat: point[0], lng: point[1] } : undefined;
  }

  private static _readLatLngList(
    value: unknown,
  ): { lat: number; lng: number }[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const points = value
      .map((point) => SearchService._readLatLngLiteral(point))
      .filter((point): point is { lat: number; lng: number } => !!point);

    return points.length > 0 ? points : undefined;
  }

  private static _readFloat(value: unknown): number | undefined {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private static _readInt(value: unknown): number | undefined {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  }

  private static _bboxFromCenterRadius(
    center: [number, number],
    radiusM: number,
  ): { north: number; south: number; east: number; west: number } {
    const radius = Math.max(0, radiusM);
    const dLat = radius / 111000;
    const cosLat = Math.cos((center[0] * Math.PI) / 180) || 1e-6;
    const dLng = radius / (111000 * cosLat);
    return {
      north: center[0] + dLat,
      south: center[0] - dLat,
      east: center[1] + dLng,
      west: center[1] - dLng,
    };
  }

  public async searchSpotsOnly(query: string) {
    let searchParams = { q: query, ...this.spotSearchParameters };

    const typesenseSpotSearchResults = await this.client
      .collections(this.TYPESENSE_COLLECTION_SPOTS)
      .documents()
      .search(searchParams, {});

    const hits = this.sortHitsByRatingThenMedia(
      (typesenseSpotSearchResults as any).hits || [],
    );

    // Attach preview
    const spotsWithPreview = hits.map((hit: any) => {
      hit.preview = this.getSpotPreviewFromHit(hit);
      return hit;
    });

    return {
      communities: [] as CommunitySearchPreview[],
      spots: {
        hits: spotsWithPreview,
        found: (typesenseSpotSearchResults as any).found,
      },
      places: null,
    };
  }
}

export interface CommunitySearchPreview {
  id: string;
  communityKey: string;
  slug: string;
  displayName: string;
  scope?: "country" | "region" | "locality";
  countryCode?: string;
  countryName?: string;
  regionName?: string;
  localityName?: string;
  totalSpots: number;
  imageUrl?: string;
  canonicalPath?: string;
  boundsCenter?: [number, number];
  boundsRadiusM?: number;
  googleMapsPlaceId?: string;
}

export interface MapViewportObjectCounts {
  spots: number;
  events: number;
  communities: number;
}

export interface MapViewportSearchResult {
  counts: MapViewportObjectCounts;
  events: PkEvent[];
  promoEvents: PkEvent[];
  communities: CommunitySearchPreview[];
}

export interface EventSearchPreview {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  venueString?: string;
  localityString: string;
  bannerSrc?: string;
  logoSrc?: string;
  sponsorName?: string;
  sponsorLogoSrc?: string;
  sponsorLogoBackgroundColor?: string;
  isSponsored: boolean;
  /** Unix seconds; undefined only if the indexer hasn't run yet. */
  startSeconds?: number;
  endSeconds?: number;
  promoStartsAtSeconds?: number;
  location?: [number, number];
  boundsCenter?: [number, number];
  boundsRadiusM?: number;
  promoRegionCenter?: [number, number];
  promoRegionRadiusM?: number;
  externalProvider?: string;
  url?: string;
  spotIds: string[];
  communityKeys: string[];
  seriesIds: string[];
}
