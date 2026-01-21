import { Inject, Injectable, LOCALE_ID } from "@angular/core";
import { BehaviorSubject, Observable, firstValueFrom } from "rxjs";
import { Spot } from "../../db/models/Spot";
import { MapHelpers } from "../../scripts/MapHelpers";

import { parseString } from "xml2js";
import { SpotsService } from "./firebase/firestore/spots.service";
import { MapsApiService } from "./maps-api.service";
import { LocaleCode } from "../../db/models/Interfaces";

import { SpotTypes } from "../../db/schemas/SpotTypeAndAccess";

export interface KMLSetupInfo {
  name?: string;
  lang?: LocaleCode;
  description?: string;
  spotCount: number;
  folders: {
    name: string;
    spotCount: number;
    import: boolean;
    type?: SpotTypes;
  }[];
  regex: RegExp | null;
}

export interface KMLSpot {
  spot: {
    name: string;
    location: google.maps.LatLngLiteral;
    bounds?: google.maps.LatLngLiteral[];
  };
  folder?: string;
  language: LocaleCode;
  possibleDuplicateOf: Spot[];
  paths?: Map<number, google.maps.LatLngLiteral[]>;
}

@Injectable({
  providedIn: "root",
})
export class KmlParserService {
  constructor(
    @Inject(LOCALE_ID) private locale: LocaleCode,
    private spotsService: SpotsService,
    private mapAPIService: MapsApiService
  ) {}

  private _parsingWasSuccessful: boolean = false;
  get parsingWasSuccessful() {
    return this._parsingWasSuccessful;
  }

  public setupInfo: KMLSetupInfo | null = {
    name: "Unnamed KML",
    description: "",
    spotCount: 0,
    lang: this.locale || "en",
    folders: [],
    regex: null,
  };

  private _spotFolders: { [key: number]: KMLSpot[] } | null = null;

  private _spotsToImport$ = new BehaviorSubject<KMLSpot[]>([]);
  public spotsToImport$: Observable<KMLSpot[]> = this._spotsToImport$;

  private _spotsNotToImport$ = new BehaviorSubject<KMLSpot[]>([]);
  public spotsNotToImport$: Observable<KMLSpot[]> = this._spotsNotToImport$;

  private _parsedKml: any | null = null;

  parseKMLFromString(kmlString: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._parseKMLStringAsXML$(kmlString).then(
        async (xmlObj) => {
          this._parsedKml = xmlObj;
          if (!this._parsedKml) {
            reject("The parsed KML object is null. This should not happen.");
            return;
          }

          this._spotFolders = {};
          this.setupInfo = {
            name: "Unnamed KML",
            description: "",
            spotCount: 0,
            lang: this.locale || "en",
            folders: [],
            regex: null,
            // @ts-ignore
            bounds: null,
          };

          let doc = this._parsedKml.kml?.Document[0];

          if (!doc) {
            reject("KML file is invalid! No Document in parsed KML found.");
            return;
          }

          // name
          if (this.setupInfo) {
            this.setupInfo.name = doc.name[0] || "Unnamed KML";
            this.setupInfo.description = doc.description[0] || "";
          }

          // set spot count
          if (!doc.Folder) {
            console.error("No folders found in KML file");
          }
          doc.Folder.forEach((folder: any, folderIndex: number) => {
            let numberOfSpotsinFolder: number = folder?.Placemark?.length ?? 0;
            this.setupInfo!.spotCount += numberOfSpotsinFolder;

            // add the folder name to the folders.
            this.setupInfo!.folders.push({
              name: folder.name[0] || "Unnamed folder",
              spotCount: numberOfSpotsinFolder,
              import: true,
              type: undefined,
            });

            // load the spots from the folder.
            let kmlSpots: KMLSpot[] = folder.Placemark.map((placemark: any) => {
              let coordinates: string | null = null;
              let isPolygon = false;

              if (
                placemark.Point &&
                placemark.Point.length > 0 &&
                placemark.Point[0].coordinates &&
                placemark.Point[0].coordinates.length > 0
              ) {
                coordinates = placemark.Point[0].coordinates[0];
              } else if (
                placemark.Polygon &&
                placemark.Polygon.length > 0 &&
                placemark.Polygon[0].outerBoundaryIs &&
                placemark.Polygon[0].outerBoundaryIs.length > 0 &&
                placemark.Polygon[0].outerBoundaryIs[0].LinearRing &&
                placemark.Polygon[0].outerBoundaryIs[0].LinearRing.length > 0 &&
                placemark.Polygon[0].outerBoundaryIs[0].LinearRing[0]
                  .coordinates &&
                placemark.Polygon[0].outerBoundaryIs[0].LinearRing[0]
                  .coordinates.length > 0
              ) {
                coordinates =
                  placemark.Polygon[0].outerBoundaryIs[0].LinearRing[0]
                    .coordinates[0];
                isPolygon = true;
              }

              if (!coordinates) {
                console.warn(
                  "Skipping placemark with no valid coordinates:",
                  placemark.name ? placemark.name[0] : "Unnamed"
                );
                return null;
              }

              let location: google.maps.LatLngLiteral;
              let bounds: google.maps.LatLngLiteral[] | undefined;

              if (isPolygon) {
                // Parse all coordinates from the polygon string
                // Format: lon,lat,alt lon,lat,alt ...
                const rawCoords = coordinates.trim().split(/\s+/);
                const path: google.maps.LatLngLiteral[] = [];

                rawCoords.forEach((coordStr) => {
                  const parts = coordStr.split(",");
                  if (parts.length >= 2) {
                    const lng = parseFloat(parts[0]);
                    const lat = parseFloat(parts[1]);
                    if (!isNaN(lat) && !isNaN(lng)) {
                      path.push({ lat, lng });
                    }
                  }
                });

                if (path.length > 0) {
                  // Calculate centroid
                  const latSum = path.reduce((sum, p) => sum + p.lat, 0);
                  const lngSum = path.reduce((sum, p) => sum + p.lng, 0);
                  location = {
                    lat: latSum / path.length,
                    lng: lngSum / path.length,
                  };
                  bounds = path;
                } else {
                  console.warn(
                    "Could not parse polygon path:",
                    placemark.name ? placemark.name[0] : "Unnamed"
                  );
                  return null;
                }
              } else {
                // Parse single point
                const regex = /(-?\d+\.\d+),(-?\d+\.\d+)/;
                const matches = coordinates.match(regex);

                if (!matches) {
                  console.warn(
                    "Could not parse coordinates for placemark:",
                    placemark.name ? placemark.name[0] : "Unnamed"
                  );
                  return null;
                }
                location = {
                  lat: parseFloat(matches[2]),
                  lng: parseFloat(matches[1]),
                };
              }

              const spot: KMLSpot["spot"] = {
                name: placemark.name ? placemark.name[0] : "Unnamed spot",
                location: location,
                bounds: bounds,
              };

              let paths: Map<number, google.maps.LatLngLiteral[]> | undefined;
              if (bounds) {
                paths = new Map();
                paths.set(0, bounds);
              }

              let kmlSpot: KMLSpot = {
                spot: spot,
                folder: folder.name ? folder.name[0] : "Unnamed folder",
                language: "en",
                possibleDuplicateOf: [],
                paths: paths,
              };

              return kmlSpot;
            }).filter((spot: KMLSpot | null) => spot !== null) as KMLSpot[];
            this._spotFolders![folderIndex] = kmlSpots;
          });

          // parsing was successful
          this._parsingWasSuccessful = true;
          resolve();
        },
        (error) => {
          console.error("Error on parsing KML string as XML");
          reject(error);
        }
      );
    });
  }

  async confirmSetup() {
    if (!this.setupInfo) {
      console.error("No setup info found. Please parse a KML file first.");
      return;
    }

    if (!this._spotFolders) {
      console.error("No spot folders found. Please parse a KML file first.");
      return;
    }

    // 1. Collect all spots involved in the import
    let allCandidateSpots: KMLSpot[] = [];

    this.setupInfo.folders.forEach((folder, folderIndex) => {
      if (folder.import) {
        const spotsInFolder = this._spotFolders![folderIndex];
        allCandidateSpots.push(...spotsInFolder);
      }
    });

    // 2. Clustering / Merging of close spots
    const mergedSpots = this.mergeSpots(allCandidateSpots);

    // 3. Prepare for Duplicate Check (Load Tiles)
    let tilesToLoad: { x: number; y: number }[] = [];
    mergedSpots.forEach((spot) => {
      let tile = MapHelpers.getTileCoordinatesForLocationAndZoom(
        spot.spot.location,
        16
      );

      if (
        !tilesToLoad.some(
          (someTile) => someTile.x === tile.x && someTile.y === tile.y
        )
      ) {
        tilesToLoad.push({ x: tile.x, y: tile.y });
      }
    });

    // 4. Load potential duplicates from DB
    let spotsToCheckForDuplicates: Spot[] = await firstValueFrom(
      this.spotsService.getSpotsForTiles(tilesToLoad, this.locale)
    );

    // 5. Check against DB
    let spotsToImport: KMLSpot[] = [];
    let spotsNotToImport: KMLSpot[] = [];
    const latLngDist = 0.0005;

    mergedSpots.forEach((kmlSpot) => {
      // Regex check
      const regex = this.setupInfo?.regex;
      if (regex) {
        const matches = regex.exec(kmlSpot.spot.name);
        if (matches) {
          kmlSpot.spot.name = matches[0];
        } else {
          spotsNotToImport.push(kmlSpot);
          return;
        }
      }

      // Duplicate Check
      let minlat = kmlSpot.spot.location.lat - latLngDist;
      let maxLat = kmlSpot.spot.location.lat + latLngDist;
      let minLng = kmlSpot.spot.location.lng - latLngDist;
      let maxLng = kmlSpot.spot.location.lng + latLngDist;

      kmlSpot.possibleDuplicateOf = spotsToCheckForDuplicates.filter((spot) => {
        const loc = spot.location();
        return (
          loc.lat > minlat &&
          loc.lat < maxLat &&
          loc.lng > minLng &&
          loc.lng < maxLng
        );
      });

      if (kmlSpot.possibleDuplicateOf.length > 0) {
        spotsNotToImport.push(kmlSpot);
      } else {
        spotsToImport.push(kmlSpot);
      }
    });

    this._spotsToImport$.next(spotsToImport);
    this._spotsNotToImport$.next(spotsNotToImport);
  }

  /**
   * Merges spots that are close to each other (approx 30m).
   * Prioritizes Polygons over Points.
   * Keeps the longest name.
   */
  private mergeSpots(spots: KMLSpot[]): KMLSpot[] {
    const merged: KMLSpot[] = [];
    const processed = new Set<KMLSpot>();
    const MERGE_DISTANCE_METERS = 30;

    for (let i = 0; i < spots.length; i++) {
      if (processed.has(spots[i])) continue;

      let currentChain = spots[i];
      processed.add(spots[i]);
      // IMPORTANT: Deep clone the spot object so we don't mutate the original source (currentChain)
      // which is referenced in _spotFolders.
      let mergedSpot = { ...currentChain, spot: { ...currentChain.spot } };

      // Check against all other subsequent spots
      // (Greedy approach: once merged, 'j' is consumed)
      for (let j = i + 1; j < spots.length; j++) {
        if (processed.has(spots[j])) continue;

        const candidate = spots[j];
        const dist = this.getDistanceFromLatLonInM(
          mergedSpot.spot.location,
          candidate.spot.location
        );

        if (dist < MERGE_DISTANCE_METERS) {
          // MERGE candidate into mergedSpot
          processed.add(candidate);

          // 1. Name: Keep longest
          if (
            candidate.spot.name.trim().length >
            mergedSpot.spot.name.trim().length
          ) {
            mergedSpot.spot.name = candidate.spot.name;
          }

          // 2. Geometry: Prefer Polygon (bounds)
          if (candidate.spot.bounds && !mergedSpot.spot.bounds) {
            // Adopt the polygon
            mergedSpot.spot.bounds = candidate.spot.bounds;
            mergedSpot.spot.location = candidate.spot.location;
            mergedSpot.paths = candidate.paths;
          } else if (candidate.spot.bounds && mergedSpot.spot.bounds) {
            // Both have bounds.
            // For now, keep the one we already have (or maybe larger area? - complexity)
            // Sticking to "first/current wins" unless specific reason.
          } else if (!candidate.spot.bounds && !mergedSpot.spot.bounds) {
            // Both points.
          }
        }
      }

      // Push a safe clone for the next steps
      merged.push({
        ...mergedSpot,
        spot: { ...mergedSpot.spot, name: mergedSpot.spot.name.trim() },
      });
    }

    return merged;
  }

  // Haversine formula
  private getDistanceFromLatLonInM(
    l1: google.maps.LatLngLiteral,
    l2: google.maps.LatLngLiteral
  ) {
    var R = 6371; // Radius of the earth in km
    var dLat = this.deg2rad(l2.lat - l1.lat); // deg2rad below
    var dLon = this.deg2rad(l2.lng - l1.lng);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(l1.lat)) *
        Math.cos(this.deg2rad(l2.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d * 1000;
  }

  private deg2rad(deg: number) {
    return deg * (Math.PI / 180);
  }

  /**
   * Parse the KML data string using an XML parser and return the JS element containing the XML data.
   * @param kmlString The XML string from the KML file
   * @returns Returns a promise that resolves with the KML object or rejects with an error.
   */
  private _parseKMLStringAsXML$(kmlString: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      parseString(kmlString, (err, result) => {
        if (!err) {
          resolve(result);
        } else {
          reject(err);
        }
      });
    });
  }

  findPossibleDuplicatesForSpot(spot: KMLSpot) {}
}
