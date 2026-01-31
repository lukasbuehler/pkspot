import { HttpClient, HttpHeaders } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { map, timeout } from "rxjs/operators";
import { MarkerSchema } from "../components/marker/marker.component";

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
   * Get nodes with amenity=drinking_water given a bounding box and map them to marker schemas.
   * @param bbox A string representing the bounding box in the format: "south,west,north,east".
   * @returns An Observable with the drinking water nodes.
   */
  getAmenityMarkers(
    bbox: google.maps.LatLngBoundsLiteral | google.maps.LatLngBounds
  ): Observable<MarkerSchema[]> {
    const bboxStr = this.getBboxStringFromBounds(bbox);

    // Build the Overpass QL query.
    const query = `
      [out:json];
      (
      node["amenity"~"(toilets|drinking_water|fountain)"](${bboxStr});
      );
      out body;
    `;

    return this.queryOverpass(query).pipe(
      map((data: OverpassResponse) => {
        return data.elements
          .map((element) => {
            if (element.tags.amenity === "drinking_water") {
              const operator = element.tags.operator
                ? `by ${element.tags.operator}`
                : "";
              const marker: MarkerSchema = {
                location: {
                  lat: element.lat,
                  lng: element.lon,
                },
                icons: ["water_full"], // local_drink, water_drop
                name: element.tags.name,
                description: operator,
                color: "secondary",
                type: "drinking_water",
              };
              return marker;
            } else if (element.tags.amenity === "fountain") {
              if (element.tags.drinking_water === "no") {
                return undefined;
              }
              const operator = element.tags.operator
                ? `by ${element.tags.operator}`
                : "";
              const marker: MarkerSchema = {
                location: {
                  lat: element.lat,
                  lng: element.lon,
                },
                icons:
                  element.tags.drinking_water === "yes"
                    ? ["water_full"]
                    : ["water_drop"],
                name:
                  element.tags?.name ?? $localize`Unnamed Drinking Water spot`,
                description: operator,
                color: "secondary",
                type: "drinking_water",
              };
              return marker;
            } else if (element.tags.amenity === "toilets") {
              const isFree = element.tags.fee === "no";
              const isPaid = element.tags.fee === "yes";

              const detailsParts: string[] = [];

              if (element.tags.fee) {
                if (element.tags.fee === "no") {
                  detailsParts.push("No fee");
                } else if (element.tags.charge) {
                  detailsParts.push(`Fee: ${element.tags.charge}`);
                }
              }

              if (element.tags.operator) {
                detailsParts.push(`by ${element.tags.operator}`);
              }

              if (element.tags.opening_hours) {
                detailsParts.push(
                  `Opening hours: ${element.tags.opening_hours}`
                );
              }

              const marker: MarkerSchema = {
                location: {
                  lat: element.lat,
                  lng: element.lon,
                },
                icons: isPaid
                  ? ["wc", "paid"]
                  : isFree
                  ? ["wc", "money_off"]
                  : ["wc"],
                name: element.tags.name ?? $localize`Unnamed Toilet`,
                description: detailsParts.join(" • "),
                color: "tertiary",
                priority: isFree ? 350 : isPaid ? 250 : 300, // Free toilets > unknown > paid
                type: "wc",
              };
              return marker;
            }
            return undefined;
          })
          .filter((marker): marker is MarkerSchema => marker !== undefined);
      })
    );
  }
}
