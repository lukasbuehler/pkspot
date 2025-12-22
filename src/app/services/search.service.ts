import { Injectable } from "@angular/core";
import { SearchClient } from "typesense";
import { SearchParams } from "typesense/lib/Typesense/Documents";
import { environment } from "../../environments/environment";
import { MapsApiService } from "./maps-api.service";
import { AmenitiesMap } from "../../db/schemas/Amenities";
import { SpotAccess, SpotTypes } from "../../db/schemas/SpotTypeAndAccess";

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

  public async searchEverything(query: string) {
    // Search for spots
    // Search for places
    // Search for challenges
    // Search for users
    // Search for events
    // Search for posts
    // TODO: Implement this
  }

  public async searchDrySpotsInBounds(
    bounds: google.maps.LatLngBounds,
    num_spots: number = 100
  ) {
    return this.searchSpotsInBounds(
      bounds,
      num_spots,
      [SpotTypes.ParkourGym, SpotTypes.PkPark],
      undefined,
      ["covered", "indoor"],
      ["outdoor"]
    );
  }

  public searchSpotsForParkourInBounds(
    bounds: google.maps.LatLngBounds,
    num_spots: number = 100
  ) {
    return this.searchSpotsInBounds(bounds, num_spots, [
      SpotTypes.ParkourGym,
      SpotTypes.GymnasticsGym,
      SpotTypes.TrampolinePark,
      SpotTypes.Garage,
      SpotTypes.Other,
    ]);
  }

  public async searchSpotsInBounds(
    bounds: google.maps.LatLngBounds,
    num_spots: number = 100,
    types?: SpotTypes[],
    accesses?: SpotAccess[],
    amenities_true?: (keyof AmenitiesMap)[],
    amenities_false?: (keyof AmenitiesMap)[]
  ): Promise<{ hits: any[]; found: number }> {
    console.log("Searching spots in bounds:", bounds.toJSON());

    const latLongPairList: string[] = [
      // northeast
      bounds.getNorthEast().lat(),
      bounds.getNorthEast().lng(),

      // southeast
      bounds.getSouthWest().lat(),
      bounds.getNorthEast().lng(),

      // southwest
      bounds.getSouthWest().lat(),
      bounds.getSouthWest().lng(),

      // northwest
      bounds.getNorthEast().lat(),
      bounds.getSouthWest().lng(),
    ].map((num) => (Math.round(num * 1000) / 1000).toString());

    let filterByString: string = `location:(${latLongPairList.join(", ")})`;

    if (types && types.length > 0) {
      filterByString += `,type:=[${types.join(", ")}]`;
    }

    if (accesses && accesses.length > 0) {
      filterByString += `,access:=[${accesses.join(", ")}]`;
    }

    if (amenities_true && amenities_true.length > 0) {
      filterByString += `,amenities_true:=[${amenities_true.join(", ")}]`;
    }

    if (amenities_false && amenities_false.length > 0) {
      filterByString += `,amenities_false:=[${amenities_false.join(", ")}]`;
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

    // If we already satisfied the requested number or there's nothing more, return
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
        try {
          const doc = hit.document || {};
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

          const preview = {
            name: displayName,
            id: doc.id || hit.document?.id || "",
            slug: doc.slug || undefined,
            location:
              doc.location && doc.location.latitude && doc.location.longitude
                ? doc.location
                : undefined,
            type: doc.type,
            access: doc.access,
            locality: doc.address?.locality || "",
            imageSrc: doc.thumbnail_url || doc.image_url || "",
            isIconic: !!doc.is_iconic,
            rating: doc.rating ?? undefined,
            amenities: doc.amenities || undefined,
          } as any;

          // attach preview to the hit so UI can use it without guessing shape
          hit.preview = preview;
        } catch (err) {
          // ignore mapping errors
        }
        return hit;
      });
    }

    return {
      spots: spotsResult,
      places:
        bothResults[1].status === "fulfilled" ? bothResults[1].value : null,
    };
  }
}
