import { Inject, Injectable, LOCALE_ID } from "@angular/core";
import { BehaviorSubject, Observable, firstValueFrom } from "rxjs";
import { Spot } from "../../db/models/Spot";
import { MapHelpers } from "../../scripts/MapHelpers";

import { parseString } from "xml2js";
import { SpotsService } from "./firebase/firestore/spots.service";
import { MapsApiService } from "./maps-api.service";
import { LocaleCode } from "../../db/models/Interfaces";

export interface KMLSetupInfo {
  name?: string;
  lang?: LocaleCode;
  description?: string;
  spotCount: number;
  folders: { name: string; spotCount: number; import: boolean }[];
  regex: RegExp | null;
}

export interface KMLSpot {
  spot: {
    name: string;
    location: google.maps.LatLngLiteral;
  };
  folder?: string;
  language: LocaleCode;
  possibleDuplicateOf: Spot[];
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
          };

          let doc = this._parsedKml.kml?.Document[0];

          if (!doc) {
            reject("KML file is invalid! No Document in parsed KML found.");
            return;
          }

          // name
          this.setupInfo.name = doc.name[0] || "Unnamed KML";
          this.setupInfo.description = doc.description[0] || "";

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
            });

            // load the spots from the folder.
            let kmlSpots: KMLSpot[] = folder.Placemark.map((placemark: any) => {
              const regex = /(-?\d+\.\d+),(-?\d+\.\d+)/;
              const matches = placemark.Point[0].coordinates[0].match(regex);

              const spot: KMLSpot["spot"] = {
                name: placemark.name[0] || "Unnamed spot",
                location: {
                  lat: parseFloat(matches[2]),
                  lng: parseFloat(matches[1]),
                },
              };

              let kmlSpot: KMLSpot = {
                spot: spot,
                folder: folder.name[0] || "Unnamed folder",
                language: "en",
                possibleDuplicateOf: [],
              };

              return kmlSpot;
            });
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
    // set the spots to import and not to import using the folders to import
    let spotsToImport: KMLSpot[] = [];
    let spotsNotToImport: KMLSpot[] = [];
    let tilesToLoad: google.maps.Point[] = [];

    if (!this.setupInfo) {
      console.error("No setup info found. Please parse a KML file first.");
      return;
    }

    if (!this._spotFolders) {
      console.error("No spot folders found. Please parse a KML file first.");
      return;
    }

    this.setupInfo.folders.forEach((folder, folderIndex) => {
      let spotsInFolder: KMLSpot[] = this._spotFolders![folderIndex];

      if (folder.import) {
        spotsInFolder.forEach((spot) => {
          // add the tiles which are close to this spot to the list to load
          // spots for to check for duplicates
          let tile = MapHelpers.getTileCoordinatesForLocationAndZoom(
            spot.spot.location,
            16
          );

          if (
            !tilesToLoad.some(
              (someTile) => someTile.x === tile.x && someTile.y === tile.y
            )
          ) {
            tilesToLoad.push(new google.maps.Point(tile.x, tile.y));
          }
        });
      }
    });

    // load all the spots for the tiles to check for possible spot duplicates
    let spotsToCheckForDuplicates: Spot[] = await firstValueFrom(
      this.spotsService.getSpotsForTiles(tilesToLoad, this.locale)
    );

    // check for duplicates for each spot
    let latLngDist: number = 0.0005;
    Object.values(this._spotFolders).forEach((folder, folderIndex) => {
      folder.forEach((kmlSpot, spotIndex) => {
        let minlat = kmlSpot.spot.location.lat - latLngDist;
        let maxLat = kmlSpot.spot.location.lat + latLngDist;
        let minLng = kmlSpot.spot.location.lng - latLngDist;
        let maxLng = kmlSpot.spot.location.lng + latLngDist;

        this._spotFolders![folderIndex][spotIndex].possibleDuplicateOf =
          spotsToCheckForDuplicates.filter((spot) => {
            if (spot.location().lat > minlat && spot.location().lat < maxLat) {
              if (
                spot.location().lng > minLng &&
                spot.location().lng < maxLng
              ) {
                return true;
              }
            }
          });
      });
    });

    this.setupInfo.folders.forEach((folder, folderIndex) => {
      let spotsInFolder = this._spotFolders![folderIndex];
      if (folder.import) {
        spotsInFolder.forEach((spot) => {
          // apply the name regex to all spots in the folder
          const regex = this.setupInfo?.regex;
          if (regex) {
            const matches = regex.exec(spot.spot.name);
            if (matches) {
              spot.spot.name = matches[0];
            } else {
              spotsNotToImport.push(spot);
              return;
            }
          }

          if (spot.possibleDuplicateOf.length > 0) {
            spotsNotToImport.push(spot);
          } else {
            spotsToImport.push(spot);
          }
        });
      }
    });

    this._spotsToImport$.next(spotsToImport);
    this._spotsNotToImport$.next(spotsNotToImport);
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
