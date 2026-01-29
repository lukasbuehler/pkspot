import { HttpClient, HttpHeaders } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { timeout } from "rxjs/operators";

export interface NodeTags {
  amenity?: string;
  name?: string;
  operator?: string;
  fee?: "yes" | "no";
  charge?: string;
  bottle?: "yes" | "no";
  opening_hours?: string;
  level?: number;
  drinking_water?: "yes" | "no";
}

export interface OverpassResponse {
  version: number;
  geneartor: string;
  osm3s: {
    timestamp_osm_base: string;
    copytight: string;
  };
  elements: {
    type: string;
    id: number;
    lat: number;
    lon: number;
    tags: NodeTags;
  }[];
}

@Injectable({
  providedIn: "root",
})
export class OsmDataService {
  http = inject(HttpClient);

  private _overpassUrl = "https://overpass-api.de/api/interpreter";

  /**
   * Sends a query to the Overpass API.
   * @param query The Overpass QL query string.
   * @returns An Observable of the query result.
   */
  private queryOverpass(query: string) {
    // Set the headers: Overpass API expects plain text.
    const headers = new HttpHeaders({
      "Content-Type": "text/plain",
    });

    // The body of the POST request is the query.
    return this.http
      .post<OverpassResponse>(this._overpassUrl, query, {
        headers,
      })
      .pipe(timeout(3000));
  }

  private getBboxStringFromBounds(
    bbox: google.maps.LatLngBoundsLiteral | google.maps.LatLngBounds
  ): string {
    if (bbox instanceof google.maps.LatLngBounds) {
      bbox = bbox.toJSON();
    }

    const south = bbox.south;
    const west = bbox.west;
    const north = bbox.north;
    const east = bbox.east;

    // Example bounding box: south,west,north,east (replace with actual values)
    return `${south},${west},${north},${east}`;
  }

  /**
   * Get nodes with amenity=drinking_water within a bounding box.
   * @param bbox A string representing the bounding box in the format: "south,west,north,east".
   * @returns An Observable with the drinking water nodes.
   */
  getDrinkingWaterAndToilets(
    bbox: google.maps.LatLngBoundsLiteral | google.maps.LatLngBounds
  ) {
    const bboxStr = this.getBboxStringFromBounds(bbox);

    // Build the Overpass QL query.
    const query = `
      [out:json];
      (
      node["amenity"~"(toilets|drinking_water|fountain)"](${bboxStr});
      );
      out body;
    `;
    return this.queryOverpass(query);
  }
}
