import { inject, Injectable } from "@angular/core";
import { MarkerSchema } from "../components/map/markers/map-marker.model";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

// Supporting OSM amenities must never obscure the primary Spot layer.
const OSM_AMENITY_MARKER_PRIORITY = {
  drinkingWater: -10,
  toilet: {
    free: -20,
    unknown: -30,
    paid: -40,
  },
} as const;
const OSM_AMENITY_MARKER_COLOR = "gray" as const;

export interface OsmAmenityTileRequest {
  zoom: 12;
  x: number;
  y: number;
}

export interface OsmAmenityRecord {
  id: number;
  type: "toilets" | "drinking_water" | "fountain";
  lat: number;
  lng: number;
  name?: string;
  operator?: string;
  fee?: "yes" | "no";
  charge?: string;
  openingHours?: string;
  drinkingWater?: "yes" | "no";
}

export interface OsmAmenityTileResponse {
  tile: OsmAmenityTileRequest;
  fetchedAt: string;
  sourceUpdatedAt?: string;
  stale: boolean;
  amenities: OsmAmenityRecord[];
  attribution: {
    text: string;
    url: string;
    license: string;
  };
}

@Injectable({
  providedIn: "root",
})
export class OsmDataService {
  private readonly functions = inject(FunctionsAdapterService);
  private readonly pendingRequests = new Map<
    string,
    Promise<MarkerSchema[]>
  >();
  private readonly markerCache = new Map<string, MarkerSchema[]>();
  private readonly maxClientCacheEntries = 64;

  /**
   * Loads the normalized amenity records for a canonical server-side tile.
   * The client never contacts Overpass directly.
   */
  getAmenityMarkers(
    tile: OsmAmenityTileRequest,
  ): Promise<MarkerSchema[]> {
    const key = `${tile.zoom}/${tile.x}/${tile.y}`;
    const cached = this.markerCache.get(key);
    if (cached) {
      this.markerCache.delete(key);
      this.markerCache.set(key, cached);
      return Promise.resolve(cached);
    }

    const pending = this.pendingRequests.get(key);
    if (pending) return pending;

    const request = this.functions
      .callAppChecked<OsmAmenityTileRequest, OsmAmenityTileResponse>(
        "getOsmAmenityTile",
        tile,
      )
      .then((response) => response.amenities.map((amenity) => this.toMarker(amenity)));
    this.pendingRequests.set(key, request);
    void request.then(
      (markers) => {
        this.pendingRequests.delete(key);
        this.markerCache.set(key, markers);
        while (this.markerCache.size > this.maxClientCacheEntries) {
          const oldestKey = this.markerCache.keys().next().value;
          if (oldestKey === undefined) break;
          this.markerCache.delete(oldestKey);
        }
      },
      () => this.pendingRequests.delete(key),
    );
    return request;
  }

  private toMarker(element: OsmAmenityRecord): MarkerSchema {
    const id = `osm-node-${element.id}`;
    const location = { lat: element.lat, lng: element.lng };
    const operator = element.operator ? `by ${element.operator}` : "";

    if (element.type === "drinking_water") {
      return {
        id,
        location,
        icons: ["water_full"],
        name: element.name,
        description: operator,
        color: OSM_AMENITY_MARKER_COLOR,
        priority: OSM_AMENITY_MARKER_PRIORITY.drinkingWater,
        type: "drinking_water",
      };
    }

    if (element.type === "fountain") {
      return {
        id,
        location,
        icons:
          element.drinkingWater === "yes"
            ? ["water_full"]
            : ["water_drop"],
        name: element.name ?? $localize`Unnamed Drinking Water spot`,
        description: operator,
        color: OSM_AMENITY_MARKER_COLOR,
        priority: OSM_AMENITY_MARKER_PRIORITY.drinkingWater,
        type: "drinking_water",
      };
    }

    const isFree = element.fee === "no";
    const isPaid = element.fee === "yes";
    const detailsParts: string[] = [];
    if (isFree) {
      detailsParts.push("No fee");
    } else if (isPaid && element.charge) {
      detailsParts.push(`Fee: ${element.charge}`);
    }
    if (element.operator) {
      detailsParts.push(`by ${element.operator}`);
    }
    if (element.openingHours) {
      detailsParts.push(`Opening hours: ${element.openingHours}`);
    }

    return {
      id,
      location,
      icons: isPaid
        ? ["wc", "paid"]
        : isFree
          ? ["wc", "money_off"]
          : ["wc"],
      name: element.name ?? $localize`Unnamed Toilet`,
      description: detailsParts.join(" • "),
      color: OSM_AMENITY_MARKER_COLOR,
      priority: isFree
        ? OSM_AMENITY_MARKER_PRIORITY.toilet.free
        : isPaid
          ? OSM_AMENITY_MARKER_PRIORITY.toilet.paid
          : OSM_AMENITY_MARKER_PRIORITY.toilet.unknown,
      type: "wc",
    };
  }
}
