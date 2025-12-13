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
  ) {
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

    const typesenseSpotSearchResults = await this.client
      .collections(this.TYPESENSE_COLLECTION_SPOTS)
      .documents()
      .search(
        {
          filter_by: filterByString,
          sort_by: "rating:desc",
          per_page: num_spots,
          page: 1,
        },
        {}
      );

    return typesenseSpotSearchResults;
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

    return {
      spots:
        bothResults[0].status === "fulfilled" ? bothResults[0].value : null,
      places:
        bothResults[1].status === "fulfilled" ? bothResults[1].value : null,
    };
  }
}
