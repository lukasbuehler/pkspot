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

export interface KMLFolderStats {
  name: string;
  spotCount: number;
  imageCount: number;
  spotsWithImages: number;
}

export interface KMLImportStats {
  folderCount: number;
  spotCount: number;
  imageCount: number;
  spotsWithImages: number;
  folders: KMLFolderStats[];
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

  getImportStats(): KMLImportStats {
    if (!this.setupInfo || !this._spotFolders) {
      return {
        folderCount: 0,
        spotCount: 0,
        imageCount: 0,
        spotsWithImages: 0,
        folders: [],
      };
    }

    const folders = this.setupInfo.folders.map((folder, folderIndex) => {
      const folderSpots = this._spotFolders?.[folderIndex] ?? [];
      let imageCount = 0;
      let spotsWithImages = 0;

      folderSpots.forEach((spot) => {
        const mediaCount = spot.spot.mediaUrls?.length ?? 0;
        imageCount += mediaCount;
        if (mediaCount > 0) {
          spotsWithImages += 1;
        }
      });

      return {
        name: folder.name,
        spotCount: folderSpots.length,
        imageCount,
        spotsWithImages,
      };
    });

    return {
      folderCount: folders.length,
      spotCount: folders.reduce((sum, folder) => sum + folder.spotCount, 0),
      imageCount: folders.reduce((sum, folder) => sum + folder.imageCount, 0),
      spotsWithImages: folders.reduce(
        (sum, folder) => sum + folder.spotsWithImages,
        0
      ),
      folders,
    };
  }

  getParsedSpots(): KMLSpot[] {
    if (!this._spotFolders) {
      return [];
    }
    return Object.values(this._spotFolders).flatMap((folderSpots) => folderSpots);
  }

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

        // Find the main Document element. Some files contain multiple Document
        // nodes (style wrappers + data), so pick the one with most placemarks.
        const documentNodes = this.getElementsByTagNameAnyNs(xmlDoc, "Document");
        let docNode: Element | null = null;
        if (documentNodes.length > 0) {
          docNode = documentNodes.reduce((bestNode, currentNode) => {
            const bestCount = this.getElementsByTagNameAnyNs(
              bestNode,
              "Placemark"
            ).length;
            const currentCount = this.getElementsByTagNameAnyNs(
              currentNode,
              "Placemark"
            ).length;
            return currentCount > bestCount ? currentNode : bestNode;
          });
        } else {
          docNode = xmlDoc.documentElement;
        }

        if (!docNode) {
          reject("KML file is invalid! No valid KML root element found.");
          return;
        }

        // name
        const docNameNode = this.getChildNode(docNode, "name");
        const docDescNode = this.getChildNode(docNode, "description");

        if (this.setupInfo) {
          this.setupInfo.name = docNameNode?.textContent || "Unnamed KML";
          this.setupInfo.description = docDescNode?.textContent || "";
        }

        const parsePlacemarks = (
          placemarks: Element[],
          folderName: string
        ): KMLSpot[] =>
          placemarks
            .map((placemark: Element) => {
              let parsedPoints: google.maps.LatLngLiteral[] = [];
              let geometryType: "point" | "polygon" | "line" = "point";

              // Try to find Point coordinates
              const pointNode = this.getElementsByTagNameAnyNs(
                placemark,
                "Point"
              )[0];
              const polygonNode = this.getElementsByTagNameAnyNs(
                placemark,
                "Polygon"
              )[0];

              if (pointNode) {
                const coordsNode = this.getElementsByTagNameAnyNs(
                  pointNode,
                  "coordinates"
                )[0];
                if (coordsNode) {
                  parsedPoints = this.parseCoordinatesValue(
                    coordsNode.textContent
                  );
                }
              } else if (polygonNode) {
                // Polygon -> outerBoundaryIs -> LinearRing -> coordinates
                geometryType = "polygon";
                const outerBoundary = this.getElementsByTagNameAnyNs(
                  polygonNode,
                  "outerBoundaryIs"
                )[0];
                if (outerBoundary) {
                  const linearRing = this.getElementsByTagNameAnyNs(
                    outerBoundary,
                    "LinearRing"
                  )[0];
                  if (linearRing) {
                    const coordsNode = this.getElementsByTagNameAnyNs(
                      linearRing,
                      "coordinates"
                    )[0];
                    if (coordsNode) {
                      parsedPoints = this.parseCoordinatesValue(
                        coordsNode.textContent
                      );
                    }
                  }
                }
              }

              // Fallback for LineString / namespace variants / gx:coord based formats.
              if (parsedPoints.length === 0) {
                const lineStringNode = this.getElementsByTagNameAnyNs(
                  placemark,
                  "LineString"
                )[0];
                if (lineStringNode) {
                  const coordsNode = this.getElementsByTagNameAnyNs(
                    lineStringNode,
                    "coordinates"
                  )[0];
                  if (coordsNode) {
                    parsedPoints = this.parseCoordinatesValue(
                      coordsNode.textContent
                    );
                    geometryType = "line";
                  }
                }
              }
              if (parsedPoints.length === 0) {
                const gxCoordNodes = this.getElementsByTagNameAnyNs(
                  placemark,
                  "coord"
                );
                if (gxCoordNodes.length > 0) {
                  parsedPoints = gxCoordNodes
                    .map((node) =>
                      this.parseCoordinateToken(node.textContent ?? "")
                    )
                    .filter(
                      (value): value is google.maps.LatLngLiteral =>
                        value !== null
                    );
                  geometryType = "line";
                }
              }
              if (parsedPoints.length === 0) {
                const genericCoordinatesNode = this.getElementsByTagNameAnyNs(
                  placemark,
                  "coordinates"
                )[0];
                if (genericCoordinatesNode) {
                  parsedPoints = this.parseCoordinatesValue(
                    genericCoordinatesNode.textContent
                  );
                  const parentName =
                    genericCoordinatesNode.parentElement?.localName?.toLowerCase() ??
                    "";
                  if (parentName === "linearring" || parentName === "polygon") {
                    geometryType = "polygon";
                  } else if (parentName === "linestring") {
                    geometryType = "line";
                  }
                }
              }

              const placemarkName =
                this.getChildNode(placemark, "name")?.textContent || "Unnamed";
              const placemarkDescription = (
                this.getChildNode(placemark, "description")?.textContent ?? ""
              ).trim();
              const mediaUrls = this.extractImageUrlsFromDescription(
                placemarkDescription
              );

              if (parsedPoints.length === 0) {
                const latitudeNode = this.getElementsByTagNameAnyNs(
                  placemark,
                  "latitude"
                )[0];
                const longitudeNode = this.getElementsByTagNameAnyNs(
                  placemark,
                  "longitude"
                )[0];
                const lat = parseFloat(latitudeNode?.textContent ?? "");
                const lng = parseFloat(longitudeNode?.textContent ?? "");
                if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                  parsedPoints = [{ lat, lng }];
                  geometryType = "point";
                }
              }

              if (parsedPoints.length === 0) {
                console.warn(
                  "Skipping placemark with no valid coordinates:",
                  placemarkName
                );
                return null;
              }

              let location: google.maps.LatLngLiteral;
              let bounds: google.maps.LatLngLiteral[] | undefined;
              if (geometryType === "polygon" || geometryType === "line") {
                const latSum = parsedPoints.reduce((sum, p) => sum + p.lat, 0);
                const lngSum = parsedPoints.reduce((sum, p) => sum + p.lng, 0);
                location = {
                  lat: latSum / parsedPoints.length,
                  lng: lngSum / parsedPoints.length,
                };
                bounds = parsedPoints;
              } else {
                location = parsedPoints[0];
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

              const kmlSpot: KMLSpot = {
                spot: spot,
                folder: folderName,
                language: "en",
                possibleDuplicateOf: [],
                paths: paths,
              };

              return kmlSpot;
            })
            .filter((spot: KMLSpot | null): spot is KMLSpot => spot !== null);

        // Process Folders
        const folderNodes = this.getElementsByTagNameAnyNs(docNode, "Folder");
        if (folderNodes.length === 0) {
          const rootPlacemarks = this.getElementsByTagNameAnyNs(
            docNode,
            "Placemark"
          );
          const fallbackFolderName =
            docNameNode?.textContent?.trim() || "Untitled layer";
          const parsedSpots = parsePlacemarks(rootPlacemarks, fallbackFolderName);
          this.setupInfo!.spotCount += parsedSpots.length;
          this.setupInfo!.folders.push({
            name: fallbackFolderName,
            spotCount: parsedSpots.length,
            import: true,
            type: undefined,
            access: undefined,
            amenities: {},
          });
          this._spotFolders![0] = parsedSpots;
        } else {
          Array.from(folderNodes).forEach((folder: Element, folderIndex: number) => {
            const folderName =
              this.getChildNode(folder, "name")?.textContent || "Unnamed folder";
            const placemarks = this.getElementsByTagNameAnyNs(
              folder,
              "Placemark"
            );
            const parsedSpots = parsePlacemarks(placemarks, folderName);
            this.setupInfo!.spotCount += parsedSpots.length;

            // add the folder name to the folders.
            this.setupInfo!.folders.push({
              name: folderName,
              spotCount: parsedSpots.length,
              import: true,
              type: undefined,
              access: undefined,
              amenities: {},
            });

            // load the spots from the folder.
            this._spotFolders![folderIndex] = parsedSpots;
          });

          // Some KML files include placemarks at Document level instead of inside folders.
          if (this.setupInfo!.spotCount === 0) {
            const documentPlacemarks = this.getElementsByTagNameAnyNs(
              docNode,
              "Placemark"
            );
            const fallbackFolderName =
              docNameNode?.textContent?.trim() || "Untitled layer";
            const parsedSpots = parsePlacemarks(
              documentPlacemarks,
              fallbackFolderName
            );

            if (parsedSpots.length > 0) {
              this.setupInfo!.spotCount = parsedSpots.length;
              this.setupInfo!.folders = [
                {
                  name: fallbackFolderName,
                  spotCount: parsedSpots.length,
                  import: true,
                  type: undefined,
                  access: undefined,
                  amenities: {},
                },
              ];
              this._spotFolders = { 0: parsedSpots };
            }
          }
        }

        const networkLinks = this.getElementsByTagNameAnyNs(docNode, "NetworkLink")
          .map((networkLink) => {
            const hrefNode = this.getElementsByTagNameAnyNs(
              networkLink,
              "href"
            )[0];
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
  private getElementsByTagNameAnyNs(
    root: Document | Element,
    tagName: string
  ): Element[] {
    const byNamespace = Array.from(root.getElementsByTagNameNS("*", tagName));
    if (byNamespace.length > 0) {
      return byNamespace;
    }
    const byTag = Array.from(root.getElementsByTagName(tagName));
    if (byTag.length > 0) {
      return byTag;
    }

    const tagLower = tagName.toLowerCase();
    return Array.from(root.getElementsByTagName("*")).filter(
      (element) => (element.localName ?? element.tagName).toLowerCase() === tagLower
    );
  }

  private parseCoordinateToken(
    coordinateToken: string
  ): google.maps.LatLngLiteral | null {
    const csvParts = coordinateToken
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (csvParts.length >= 2) {
      const lng = parseFloat(csvParts[0]);
      const lat = parseFloat(csvParts[1]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        return { lat, lng };
      }
    }

    const whitespaceParts = coordinateToken
      .trim()
      .split(/\s+/)
      .filter((part) => part.length > 0);
    if (whitespaceParts.length >= 2) {
      const lng = parseFloat(whitespaceParts[0]);
      const lat = parseFloat(whitespaceParts[1]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        return { lat, lng };
      }
    }

    return null;
  }

  private parseCoordinatesValue(
    coordinates: string | null | undefined
  ): google.maps.LatLngLiteral[] {
    const value = (coordinates ?? "").trim();
    if (!value) {
      return [];
    }

    const points: google.maps.LatLngLiteral[] = [];
    if (value.includes(",")) {
      value
        .split(/\s+/)
        .filter((token) => token.length > 0)
        .forEach((token) => {
          const parsed = this.parseCoordinateToken(token);
          if (parsed) {
            points.push(parsed);
          }
        });
      return points;
    }

    const numericParts = value
      .split(/\s+/)
      .map((part) => parseFloat(part))
      .filter((part) => !Number.isNaN(part));
    if (numericParts.length < 2) {
      return [];
    }

    const stride = numericParts.length % 3 === 0 ? 3 : 2;
    for (let index = 0; index + 1 < numericParts.length; index += stride) {
      const lng = numericParts[index];
      const lat = numericParts[index + 1];
      points.push({ lat, lng });
    }

    return points;
  }

  private getChildNode(element: Element, tagName: string): Element | undefined {
    const tagLower = tagName.toLowerCase();
    for (let i = 0; i < element.children.length; i++) {
      const child = element.children[i];
      const localName = child.localName?.toLowerCase();
      const tagNameExact = child.tagName;
      const tagNameLower = tagNameExact?.toLowerCase();
      if (
        localName === tagLower ||
        tagNameExact === tagName ||
        tagNameLower === tagLower ||
        tagNameLower?.endsWith(`:${tagLower}`)
      ) {
        return child;
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
    let spotsToCheckForDuplicates: Spot[] = [];
    if (tilesToLoad.length > 0) {
      spotsToCheckForDuplicates = await firstValueFrom(
        this.spotsService.getSpotsForTiles(tilesToLoad, this.locale),
        { defaultValue: [] }
      );
    }

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
   * Merges near-duplicate spots that are close to each other (approx 30m).
   * Merge scope is intentionally constrained:
   * - only within the same folder
   * - only when geometry classes match (point<->point, area/line<->area/line),
   *   unless names are exactly the same
   *
   * This prevents helper layers (e.g. night/wet subsets, route lines) from
   * collapsing unrelated spots across folders.
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
      let mergedSpot: KMLSpot = {
        ...currentChain,
        spot: {
          ...currentChain.spot,
          bounds: currentChain.spot.bounds
            ? [...currentChain.spot.bounds]
            : undefined,
          mediaUrls: currentChain.spot.mediaUrls
            ? [...currentChain.spot.mediaUrls]
            : undefined,
        },
      };

      // Check against all other subsequent spots
      // (Greedy approach: once merged, 'j' is consumed)
      for (let j = i + 1; j < spots.length; j++) {
        if (processed.has(spots[j])) continue;

        const candidate = spots[j];
        const mergedFolder = (mergedSpot.folder ?? "").trim();
        const candidateFolder = (candidate.folder ?? "").trim();
        if (mergedFolder !== candidateFolder) {
          continue;
        }

        const mergedHasBounds = (mergedSpot.spot.bounds?.length ?? 0) > 0;
        const candidateHasBounds = (candidate.spot.bounds?.length ?? 0) > 0;
        const sameGeometryClass = mergedHasBounds === candidateHasBounds;
        const normalizedMergedName = mergedSpot.spot.name.trim().toLowerCase();
        const normalizedCandidateName = candidate.spot.name.trim().toLowerCase();
        const sameName =
          normalizedMergedName.length > 0 &&
          normalizedMergedName === normalizedCandidateName;
        if (!sameGeometryClass && !sameName) {
          continue;
        }

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

          // 1.5. Keep the richer description and merge media URLs so previews don't lose images.
          const mergedDescription = (mergedSpot.spot.description ?? "").trim();
          const candidateDescription = (candidate.spot.description ?? "").trim();
          if (candidateDescription.length > mergedDescription.length) {
            mergedSpot.spot.description = candidate.spot.description;
          }

          const mergedMediaUrls = Array.from(
            new Set([
              ...(mergedSpot.spot.mediaUrls ?? []),
              ...(candidate.spot.mediaUrls ?? []),
            ])
          );
          mergedSpot.spot.mediaUrls =
            mergedMediaUrls.length > 0 ? mergedMediaUrls : undefined;

          // 2. Geometry: Prefer Polygon (bounds)
          if (candidate.spot.bounds && !mergedSpot.spot.bounds) {
            // Adopt the polygon
            mergedSpot.spot.bounds = [...candidate.spot.bounds];
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
        spot: {
          ...mergedSpot.spot,
          name: mergedSpot.spot.name.trim(),
          mediaUrls:
            mergedSpot.spot.mediaUrls && mergedSpot.spot.mediaUrls.length > 0
              ? Array.from(new Set(mergedSpot.spot.mediaUrls))
              : undefined,
        },
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
