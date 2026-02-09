import { Inject, Injectable, LOCALE_ID } from "@angular/core";
import { BehaviorSubject, Observable, firstValueFrom } from "rxjs";
import { Spot } from "../../db/models/Spot";
import { MapHelpers } from "../../scripts/MapHelpers";

import { SpotsService } from "./firebase/firestore/spots.service";
import { MapsApiService } from "./maps-api.service";
import { LocaleCode } from "../../db/models/Interfaces";

import { SpotAccess, SpotTypes } from "../../db/schemas/SpotTypeAndAccess";
import { AmenitiesMap } from "../../db/schemas/Amenities";

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
    access?: SpotAccess;
    amenities?: Partial<AmenitiesMap>;
  }[];
  regex: RegExp | null;
  networkLinks?: string[];
}

export interface KMLSpot {
  spot: {
    name: string;
    location: google.maps.LatLngLiteral;
    bounds?: google.maps.LatLngLiteral[];
    description?: string;
    mediaUrls?: string[];
  };
  folder?: string;
  language: LocaleCode;
  possibleDuplicateOf: Spot[];
  paths?: Map<number, google.maps.LatLngLiteral[]>;
  importIndex?: number;
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
    networkLinks: [],
  };

  private _spotFolders: { [key: number]: KMLSpot[] } | null = null;

  private _spotsToImport$ = new BehaviorSubject<KMLSpot[]>([]);
  public spotsToImport$: Observable<KMLSpot[]> = this._spotsToImport$;

  private _spotsNotToImport$ = new BehaviorSubject<KMLSpot[]>([]);
  public spotsNotToImport$: Observable<KMLSpot[]> = this._spotsNotToImport$;

  private _parsedKml: Document | null = null;

  parseKMLFromString(kmlString: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(kmlString, "text/xml");

        const parseError = xmlDoc.getElementsByTagName("parsererror");
        if (parseError.length > 0) {
          reject("Error parsing KML XML");
          return;
        }

        this._parsedKml = xmlDoc;
        this._spotFolders = {};
        this.setupInfo = {
          name: "Unnamed KML",
          description: "",
          spotCount: 0,
          lang: this.locale || "en",
          folders: [],
          regex: null,
          networkLinks: [],
          // @ts-ignore
          bounds: null,
        };

        // Find the main Document element
        // KML structure is usually kml -> Document -> Folder(s)
        const kmlNode = xmlDoc.getElementsByTagName("kml")[0];
        const docNode = xmlDoc.getElementsByTagName("Document")[0]; // Use helper or querySelector

        if (!docNode) {
          reject("KML file is invalid! No Document in parsed KML found.");
          return;
        }

        // name
        const docNameNode = this.getChildNode(docNode, "name");
        const docDescNode = this.getChildNode(docNode, "description");

        if (this.setupInfo) {
          this.setupInfo.name = docNameNode?.textContent || "Unnamed KML";
          this.setupInfo.description = docDescNode?.textContent || "";
        }

        // Process Folders
        const folderNodes = docNode.getElementsByTagName("Folder");
        if (folderNodes.length === 0) {
          console.error("No folders found in KML file");
        }

        Array.from(folderNodes).forEach(
          (folder: Element, folderIndex: number) => {
            const folderName =
              this.getChildNode(folder, "name")?.textContent ||
              "Unnamed folder";
            const placemarks = folder.getElementsByTagName("Placemark");
            let numberOfSpotsinFolder = placemarks.length;

            this.setupInfo!.spotCount += numberOfSpotsinFolder;

            // add the folder name to the folders.
            this.setupInfo!.folders.push({
              name: folderName,
              spotCount: numberOfSpotsinFolder,
              import: true,
              type: undefined,
              access: undefined,
              amenities: {},
            });

            // load the spots from the folder.
            let kmlSpots: KMLSpot[] = Array.from(placemarks)
              .map((placemark: Element) => {
                let coordinates: string | null = null;
                let isPolygon = false;

                // Try to find Point coordinates
                const pointNode = placemark.getElementsByTagName("Point")[0];
                const polygonNode =
                  placemark.getElementsByTagName("Polygon")[0];

                if (pointNode) {
                  const coordsNode =
                    pointNode.getElementsByTagName("coordinates")[0];
                  if (coordsNode) {
                    coordinates = coordsNode.textContent;
                  }
                } else if (polygonNode) {
                  // Polygon -> outerBoundaryIs -> LinearRing -> coordinates
                  const outerBoundary =
                    polygonNode.getElementsByTagName("outerBoundaryIs")[0];
                  if (outerBoundary) {
                    const linearRing =
                      outerBoundary.getElementsByTagName("LinearRing")[0];
                    if (linearRing) {
                      const coordsNode =
                        linearRing.getElementsByTagName("coordinates")[0];
                      if (coordsNode) {
                        coordinates = coordsNode.textContent;
                        isPolygon = true;
                      }
                    }
                  }
                }

                const placemarkName =
                  this.getChildNode(placemark, "name")?.textContent ||
                  "Unnamed";
                const placemarkDescription = (
                  this.getChildNode(placemark, "description")?.textContent ?? ""
                ).trim();
                const mediaUrls = this.extractImageUrlsFromDescription(
                  placemarkDescription
                );

                if (!coordinates) {
                  console.warn(
                    "Skipping placemark with no valid coordinates:",
                    placemarkName
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
                      placemarkName
                    );
                    return null;
                  }
                } else {
                  // Parse single point
                  // KML coordinates are lon,lat[,alt]
                  const parts = coordinates.trim().split(",");
                  if (parts.length >= 2) {
                    const lng = parseFloat(parts[0]);
                    const lat = parseFloat(parts[1]);
                    location = { lat, lng };
                  } else {
                    // Fallback to regex if simple split fails (though split is safer for KML standard)
                    const regex = /(-?\d+\.\d+),(-?\d+\.\d+)/;
                    const matches = coordinates.match(regex);
                    if (matches) {
                      // matches[1] is usually first capture group (lon), matches[2] (lat)??
                      // Wait, regex above captures group 1 and 2.
                      // Standard KML is lon,lat.
                      // The original code had: location = { lat: parseFloat(matches[2]), lng: parseFloat(matches[1]) };
                      // Let's stick to the split logic which is clearer for "lon,lat"
                      console.warn(
                        "Could not parse coordinates for placemark (regex fallback failed):",
                        placemarkName
                      );
                      return null;
                    } else {
                      console.warn(
                        "Could not parse coordinates for placemark:",
                        placemarkName
                      );
                      return null;
                    }
                  }
                }

                const spot: KMLSpot["spot"] = {
                  name: placemarkName || "Unnamed spot",
                  location: location!,
                  bounds: bounds,
                  description: placemarkDescription || undefined,
                  mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
                };

                let paths: Map<number, google.maps.LatLngLiteral[]> | undefined;
                if (bounds) {
                  paths = new Map();
                  paths.set(0, bounds);
                }

                let kmlSpot: KMLSpot = {
                  spot: spot,
                  folder: folderName,
                  language: "en",
                  possibleDuplicateOf: [],
                  paths: paths,
                };

                return kmlSpot;
              })
              .filter((spot: KMLSpot | null) => spot !== null) as KMLSpot[];

            this._spotFolders![folderIndex] = kmlSpots;
          }
        );

        const networkLinks = Array.from(
          docNode.getElementsByTagName("NetworkLink")
        )
          .map((networkLink) => {
            const hrefNode = networkLink.getElementsByTagName("href")[0];
            return hrefNode?.textContent?.trim() ?? "";
          })
          .filter((href) => href.length > 0);
        this.setupInfo!.networkLinks = networkLinks;

        // parsing was successful
        this._parsingWasSuccessful = true;
        resolve();
      } catch (error) {
        console.error("Error on parsing KML string", error);
        reject(error);
      }
    });
  }

  /**
   * Helper to get immediate child node by tag name (ignoring deep descendants)
   */
  private getChildNode(element: Element, tagName: string): Element | undefined {
    for (let i = 0; i < element.children.length; i++) {
      if (element.children[i].tagName === tagName) {
        return element.children[i];
      }
    }
    return undefined;
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
    mergedSpots.forEach((spot, index) => {
      spot.importIndex = index;
    });

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

  private extractImageUrlsFromDescription(description: string): string[] {
    if (!description) {
      return [];
    }
    const urls = new Set<string>();

    try {
      const parser = new DOMParser();
      const html = parser.parseFromString(description, "text/html");
      const imgNodes = Array.from(html.querySelectorAll("img[src]"));
      imgNodes.forEach((img) => {
        const src = this.normalizeExternalUrl(img.getAttribute("src") ?? "");
        if (src) {
          urls.add(src);
        }
      });

      const anchorNodes = Array.from(html.querySelectorAll("a[href]"));
      anchorNodes.forEach((anchor) => {
        const href = this.normalizeExternalUrl(
          anchor.getAttribute("href") ?? ""
        );
        if (!href) {
          return;
        }
        if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(href)) {
          urls.add(href);
        }
      });
    } catch (error) {
      console.warn("Failed parsing description HTML for media URLs", error);
    }

    const urlRegex = /(https?:\/\/[^\s"'<>]+?\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>]*)?)/gi;
    const regexMatches = description.match(urlRegex) ?? [];
    regexMatches.forEach((rawUrl) => {
      const normalized = this.normalizeExternalUrl(rawUrl);
      if (normalized) {
        urls.add(normalized);
      }
    });

    return Array.from(urls).slice(0, 12);
  }

  private normalizeExternalUrl(raw: string): string | null {
    const value = raw.trim();
    if (!value) {
      return null;
    }
    const withProtocol = value.startsWith("//") ? `https:${value}` : value;
    if (!/^https?:\/\//i.test(withProtocol)) {
      return null;
    }
    return withProtocol;
  }

  findPossibleDuplicatesForSpot(spot: KMLSpot) {}
}
