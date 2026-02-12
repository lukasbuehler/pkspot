import { Injectable } from "@angular/core";
import { SearchClient } from "typesense";
import { SearchParams } from "typesense/lib/Typesense/Documents";
import { environment } from "../../environments/environment";
import { MapsApiService } from "./maps-api.service";
import { AmenitiesMap } from "../../db/schemas/Amenities";
import { SpotAccess, SpotTypes } from "../../db/schemas/SpotTypeAndAccess";
import { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import { GeoPoint } from "firebase/firestore";
import {
  SpotFilterMode,
  SPOT_FILTER_CONFIGS,
} from "../components/spot-map/spot-filter-config";

@Injectable({
  providedIn: "root",
})
export class SearchService {
  constructor(private _mapsService: MapsApiService) {}

  readonly TYPESENSE_COLLECTION_SPOTS = "spots_v2";

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
    sort_by: "rating:desc",
    per_page: 5,
    page: 1,
  };

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
            doc.location.longitude
          );
        }
      }

      // Build a complete locality string matching the cluster logic
      let localityString = "";
      if (doc.address) {
        if (doc.address.sublocality) {
          localityString += doc.address.sublocality + ", ";
        }
        if (doc.address.locality) {
          localityString += doc.address.locality + ", ";
        }
        if (doc.address.country && doc.address.country.code) {
          localityString += doc.address.country.code.toUpperCase();
        }
      }
      // Trim trailing comma and space if country is missing
      localityString = localityString.replace(/, $/, "");

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

      const preview: SpotPreviewData = {
        name: displayName,
        id: doc.id || hit.document?.id || "",
        slug: doc.slug || undefined,
        location: location,
        type: doc.type,
        access: doc.access,
        locality: localityString,
        imageSrc:
          doc.thumbnail_medium_url ||
          doc.thumbnail_small_url ||
          doc.image_url ||
          "",
        isIconic: isIconic,
        rating: doc.rating ?? undefined,
        amenities: amenities || undefined,
        bounds:
          doc.bounds_raw?.map(
            (p: any) => new GeoPoint(p.lat ?? p[0], p.lng ?? p[1])
          ) ||
          doc.bounds?.map(
            (p: any) => new GeoPoint(p.lat ?? p[0], p.lng ?? p[1])
          ),
      } as SpotPreviewData;

      return preview;
    } catch (err) {
      console.error("Error mapping hit to preview:", err);
      return {} as SpotPreviewData;
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
    chunkSize: number = 180
  ): Promise<SpotPreviewData[]> {
    const uniqueIds = Array.from(
      new Set((spotIds || []).filter((id) => typeof id === "string" && !!id))
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
            {}
          )
      )
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
    num_spots: number = 10
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
      config.amenities_false
    );
  }

  /**
   * @deprecated Use searchSpotsInBoundsWithFilter(bounds, SpotFilterMode.Dry) instead
   */
  public async searchDrySpotsInBounds(
    bounds: google.maps.LatLngBounds,
    num_spots: number = 10
  ) {
    return this.searchSpotsInBoundsWithFilter(
      bounds,
      SpotFilterMode.Dry,
      num_spots
    );
  }

  /**
   * @deprecated Use searchSpotsInBoundsWithFilter(bounds, SpotFilterMode.ForParkour) instead
   */
  public searchSpotsForParkourInBounds(
    bounds: google.maps.LatLngBounds,
    num_spots: number = 10
  ) {
    return this.searchSpotsInBoundsWithFilter(
      bounds,
      SpotFilterMode.ForParkour,
      num_spots
    );
  }

  /**
   * @deprecated Use searchSpotsInBoundsWithFilter(bounds, SpotFilterMode.Indoor) instead
   */
  public searchIndoorSpotsInBounds(
    bounds: google.maps.LatLngBounds,
    num_spots: number = 10
  ) {
    return this.searchSpotsInBoundsWithFilter(
      bounds,
      SpotFilterMode.Indoor,
      num_spots
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
    num_spots: number = 10
  ): Promise<{ hits: any[]; found: number }> {
    return this.searchSpotsInBounds(
      bounds,
      num_spots,
      params.types,
      params.accesses,
      params.amenities_true,
      params.amenities_false
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
    onlyWithImages: boolean = false
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
      onlyWithImages
    );
  }

  private async _executeSearch(
    latLongPairList: string[],
    num_spots: number,
    types?: SpotTypes[],
    accesses?: SpotAccess[],
    amenities_true?: (keyof AmenitiesMap)[],
    amenities_false?: (keyof AmenitiesMap)[],
    onlyWithImages: boolean = false
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
        "(thumbnail_small_url:!=null || thumbnail_medium_url:!=null)"
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
          sort_by: "rating:desc",
          per_page: perPage,
          page: 1,
        },
        {}
      );

    let allHits: any[] = (firstPage && (firstPage as any).hits) || [];

    const found: number =
      (firstPage && (firstPage as any).found) || allHits.length;

    // If we already satisfied the requested number (after filtering)
    if (allHits.length >= num_spots || found <= perPage) {
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
              sort_by: "rating:desc",
              per_page: perPage,
              page: i,
            },
            {}
          )
      );
    }

    const settled = await Promise.allSettled(pageRequests);
    for (const res of settled) {
      if (res.status === "fulfilled" && res.value && res.value.hits) {
        allHits.push(...res.value.hits);
      }
    }

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
    amenities_false?: (keyof AmenitiesMap)[]
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
      amenities_false
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
    maxResults: number = 20
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
          {}
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
    let searchParams = { q: query, ...this.spotSearchParameters };

    const typesenseSpotSearchResults = this.client
      .collections(this.TYPESENSE_COLLECTION_SPOTS)
      .documents()
      .search(searchParams, {});

    const googlePlacesSearchResults = this._mapsService.autocompletePlaceSearch(
      query,
      ["geocode"]
    );

    const bothResults = await Promise.allSettled([
      typesenseSpotSearchResults,
      googlePlacesSearchResults,
    ]);

    // console.log("bothResults:", bothResults);

    if (bothResults[0].status === "rejected") {
      console.error("typesense error:", bothResults[0].reason);
    }

    if (bothResults[1].status === "rejected") {
      console.error(
        "google maps places autocomplete API error:",
        bothResults[1].reason
      );
    }

    const spotsResult =
      bothResults[0].status === "fulfilled" ? bothResults[0].value : null;

    // If we have typesense hits, attach a simple SpotPreview-like `preview` object
    if (spotsResult && Array.isArray((spotsResult as any).hits)) {
      (spotsResult as any).hits = (spotsResult as any).hits.map((hit: any) => {
        hit.preview = this.getSpotPreviewFromHit(hit);
        return hit;
      });
    }

    return {
      spots: spotsResult,
      places:
        bothResults[1].status === "fulfilled" ? bothResults[1].value : null,
    };
  }

  public async searchSpotsOnly(query: string) {
    let searchParams = { q: query, ...this.spotSearchParameters };

    const typesenseSpotSearchResults = await this.client
      .collections(this.TYPESENSE_COLLECTION_SPOTS)
      .documents()
      .search(searchParams, {});

    const hits = (typesenseSpotSearchResults as any).hits || [];

    // Attach preview
    const spotsWithPreview = hits.map((hit: any) => {
      hit.preview = this.getSpotPreviewFromHit(hit);
      return hit;
    });

    return {
      spots: {
        hits: spotsWithPreview,
        found: (typesenseSpotSearchResults as any).found,
      },
      places: null,
    };
  }
}
