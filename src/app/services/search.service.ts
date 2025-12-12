import { Injectable } from "@angular/core";
import { SearchClient } from "typesense";
import { SearchParams } from "typesense/lib/Typesense/Documents";
import { environment } from "../../environments/environment";
import { MapsApiService } from "./maps-api.service";

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
