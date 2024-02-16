import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from "@angular/core";
import { Spot } from "src/scripts/db/Spot";
import { DatabaseService } from "../database.service";
import { ActivatedRoute } from "@angular/router";
import { GeoPoint } from "firebase/firestore";
import { take } from "rxjs";
import { MapHelper } from "src/scripts/map_helper";
import { Location } from "@angular/common";
import { AuthenticationService } from "../authentication.service";
import { MapComponent } from "../map/map.component";

/**
 * This interface is used to reference a spot in the loaded spots array.
 */
interface LoadedSpotReference {
  spot: Spot.Class;
  tile: { x: number; y: number };
  indexInTileArray: number;
  indexInTotalArray: number;
}

@Component({
  selector: "app-spot-map",
  templateUrl: "./spot-map.component.html",
  styleUrls: ["./spot-map.component.scss"],
})
export class SpotMapComponent implements AfterViewInit {
  @ViewChild("map") map: MapComponent;

  @Input() selectedSpot: Spot.Class | null = null;
  @Output() selectedSpotChange = new EventEmitter<Spot.Class | null>();

  setSelectedSpot(value: Spot.Class | null) {
    if (value !== this.selectedSpot) {
      this.selectedSpot = value;
      this.selectedSpotChange.emit(value);
    }
  }

  @Input() isEditing: boolean = false;
  @Output() isEditingChange = new EventEmitter<boolean>();

  setIsEditing(value: boolean) {
    if (value !== this.isEditing) {
      this.isEditing = value;
      this.isEditingChange.emit(value);
    }
  }

  @Input() mapStyle: string = "roadmap";
  @Output() mapStyleChange = new EventEmitter<string>();

  @Output() hasGeolocationChange = new EventEmitter<boolean>();

  visibleSpots: Spot.Class[] = [];
  @Output() visibleSpotsChange = new EventEmitter<Spot.Class[]>();

  uneditedSpot: Spot.Class = null;

  start_zoom: number = 4;
  mapZoom: number = this.start_zoom;
  mapCenterStart: google.maps.LatLngLiteral = {
    lat: 48.6270939,
    lng: 2.4305363,
  };
  mapCenter: google.maps.LatLngLiteral;
  bounds: google.maps.LatLngBounds;

  loadedSpots: any = {}; // is a map of tile coords to spot arrays
  dots: any[] = [];

  private _northEastTileCoordsZ16: google.maps.Point;
  private _southWestTileCoordsZ16: google.maps.Point;

  constructor(
    private route: ActivatedRoute,
    private _dbService: DatabaseService,
    private location: Location,
    private authService: AuthenticationService
  ) {}

  ngAfterViewInit(): void {
    let spotId: string = this.route.snapshot.paramMap.get("spotID") ?? "";
    let lat = this.route.snapshot.queryParamMap.get("lat") ?? null;
    let lng = this.route.snapshot.queryParamMap.get("lng") ?? null;
    let zoom = this.route.snapshot.queryParamMap.get("z") ?? this.start_zoom;

    if (spotId) {
      this.openSpotById(spotId);
    } else {
      this.mapCenter = {
        lat: Number(lat ?? this.mapCenterStart.lat),
        lng: Number(lng ?? this.mapCenterStart.lng),
      };
      this.mapZoom = Number(zoom);

      this.mapCenterStart = this.mapCenter;

      // update URL
      this.updateMapURL();
    }

    // TODO remove
    this._dbService.getTestSpots().subscribe((spots) => {
      // add all these loaded spots to the loaded spots array
      for (let spot of spots) {
        let tile = spot.tileCoordinates.z16;
        if (!this.loadedSpots[`z${16}_${tile.x}_${tile.y}`]) {
          // the tile was not loaded before
          this.loadedSpots[`z${16}_${tile.x}_${tile.y}`] = [];
        }
        this.loadedSpots[`z${16}_${tile.x}_${tile.y}`].push(spot);
      }
    });
  }

  // Map events ///////////////////////////////////////////////////////////////

  zoomChanged(zoom: number) {
    this.mapZoom = zoom;
  }

  mapClick(event: google.maps.MapMouseEvent) {
    /**
     * When the map is clicked with a spot open, the spot is
     * closed and the bottom panel cloes as well.
     */
    if (this.selectedSpot) {
      this.closeSpot();
    }
  }

  focusOnGeolocation() {
    this.map.focusOnGeolocation();
  }

  mapBoundsChanged(bounds: google.maps.LatLngBounds, zoom: number) {
    this.bounds = bounds;

    if (zoom >= 16) {
      this.dots = [];
      // inside this zoom level we are constantly loading spots if new tiles become visible

      let northEastLiteral: google.maps.LatLngLiteral = {
        lat: bounds.getNorthEast().lat(),
        lng: bounds.getNorthEast().lng(),
      };
      let southWestLiteral: google.maps.LatLngLiteral = {
        lat: bounds.getSouthWest().lat(),
        lng: bounds.getSouthWest().lng(),
      };

      let northEastTileCoords = MapHelper.getTileCoordinatesForLocationAndZoom(
        northEastLiteral,
        16
      );
      let southWestTileCoords = MapHelper.getTileCoordinatesForLocationAndZoom(
        southWestLiteral,
        16
      );

      this._northEastTileCoordsZ16 = northEastTileCoords;
      this._southWestTileCoordsZ16 = southWestTileCoords;

      //this.loadNewSpotOnTiles(northEastTileCoords, southWestTileCoords);
      this.updateVisibleSpots();
    } else {
      // hide the spots and show the dots
      this.visibleSpots = [];
      this.updateDots();
      //   if (zoomLevel <= 2) {
      //     zoomLevel = 2;
      //     this._northEastTileCoordsZ16.x = 0;
      //     this._northEastTileCoordsZ16.y = 0;
      //     this._southWestTileCoordsZ16.x = (1 << 16) - 1;
      //     this._southWestTileCoordsZ16.y = (1 << 16) - 1;
      //   }
      //   if (zoomLevel <= 16 - 2) {
      //     if (zoomLevel % 2 !== 0) {
      //       zoomLevel--;
      //     }
      //     const tileCoords: { ne: google.maps.Point; sw: google.maps.Point } = {
      //       ne: new google.maps.Point(
      //         this._northEastTileCoordsZ16.x >> (16 - zoomLevel),
      //         this._northEastTileCoordsZ16.y >> (16 - zoomLevel)
      //       ),
      //       sw: new google.maps.Point(
      //         this._southWestTileCoordsZ16.x >> (16 - zoomLevel),
      //         this._southWestTileCoordsZ16.y >> (16 - zoomLevel)
      //       ),
      //     };

      // this.loadNewSpotDotsOnTiles(zoomLevel, tileCoords.ne, tileCoords.sw);
      //}
    }
  }

  // Spot loading /////////////////////////////////////////////////////////////

  getAllSpots(): Spot.Class[] {
    const values = [];
    for (const key of Object.keys(this.loadedSpots)) {
      if (!key.includes("z16")) continue;
      values.push(this.loadedSpots[key]);
    }

    return [].concat.apply([], values);
  }

  loadNewSpotOnTiles(
    northEastTileCoords: google.maps.Point,
    southWestTileCoords: google.maps.Point
  ) {
    let tilesToLoad: { x: number; y: number }[] = [];

    // make a list of coordinate pairs that we need to fetch from this.
    for (let x = southWestTileCoords.x; x <= northEastTileCoords.x; x++) {
      for (let y = northEastTileCoords.y; y <= southWestTileCoords.y; y++) {
        // here we go through all the x,y pairs for every visible tile on screen right now.
        if (!this.loadedSpots[`z${16}_${x}_${y}`]) {
          // the tile was not loaded before

          // mark this tile as loaded, will be filled after the data was
          // fetched. This prevents multiple fetches for the same tile
          // !([]) is false, !(undefined) is true
          // this way it wont be loaded twice
          this.loadedSpots[`z${16}_${x}_${y}`] = [];
          tilesToLoad.push({ x: x, y: y });
        }
      }
    }
    this.loadSpotsForTiles(tilesToLoad);
  }

  loadNewSpotDotsOnTiles(
    zoom: number,
    northEastTileCoords: google.maps.Point,
    southWestTileCoords: google.maps.Point
  ) {
    let tilesToLoad: { x: number; y: number }[] = [];

    // make a list of coordinate pairs that we need to fetch from this.
    for (let x = southWestTileCoords.x; x <= northEastTileCoords.x; x++) {
      for (let y = northEastTileCoords.y; y <= southWestTileCoords.y; y++) {
        // here we go through all the x,y pairs for every visible tile on screen right now.
        if (!this.loadedSpots[`z${zoom}_${x}_${y}`]) {
          // the tile was not loaded before

          // mark this tile as loaded, will be filled after the data was
          // fetched. This prevents multiple fetches for the same tile
          // !([]) is false, !(undefined) is true
          // this way it wont be loaded twice
          this.loadedSpots[`z${zoom}_${x}_${y}`] = [];
          tilesToLoad.push({ x: x, y: y });
        }
      }
    }

    // this._dbService.getPreviewSpotsForTiles(zoom, tilesToLoad).subscribe(
    //   (spots) => {
    //     if (spots.length > 0) {
    //       let tile = spots[0].data.tile_coordinates.z16;
    //       this.loadedSpots[`z${zoom}_${tile.x}_${tile.y}`] = spots;
    //       //console.log("new sposts laoded:");
    //       //console.log(spots);
    //       this.updateDots();
    //     }
    //   },
    //   (error) => {
    //     console.error(error);
    //   }
    // );
  }

  // Public Map helper functions

  updateMapURL() {
    if (this.selectedSpot) {
      this.location.go(`/map/${this.selectedSpot.id}`);
    } else {
      this.location.go(`/map`);
    }
  }

  /**
   * This function takes in the new corners of the visible area and hides and shows spots as necessairy
   * @param northEastLiteral
   * @param southWestLiteral
   */
  updateVisibleSpots() {
    // clear visible spots
    this.visibleSpots = [];

    for (
      let x = this._southWestTileCoordsZ16.x;
      x <= this._northEastTileCoordsZ16.x;
      x++
    ) {
      for (
        let y = this._northEastTileCoordsZ16.y;
        y <= this._southWestTileCoordsZ16.y;
        y++
      ) {
        // here we go through all the x,y pairs for every visible tile on screen right now.
        if (this.loadedSpots[`z${16}_${x}_${y}`]) {
          this.visibleSpots = this.visibleSpots.concat(
            this.loadedSpots[`z${16}_${x}_${y}`]
          );
        }
      }
    }
    this.visibleSpotsChange.emit(this.visibleSpots);

    // If the selected spot is visible reference the instance from the visible spots
    if (this.selectedSpot) {
      const selectedSpotIndexInVisibleSpots: number =
        this.visibleSpots.findIndex((spot) => {
          return this.selectedSpot.id === spot.id;
        });
      if (selectedSpotIndexInVisibleSpots >= 0) {
        // The selected spot is visible, reference the instance from the visible
        // spots instead of the one from the database
        this.setSelectedSpot(
          this.visibleSpots[selectedSpotIndexInVisibleSpots]
        );
      }
    }
  }

  updateSpotInLoadedSpots(spot: Spot.Class) {
    this.loadedSpots[
      `z${16}_${spot.tileCoordinates.z16.x}_${spot.tileCoordinates.z16.y}`
    ].forEach((loadedSpot: Spot.Class, index: number) => {
      if (loadedSpot.id === spot.id) {
        this.loadedSpots[
          `z${16}_${spot.tileCoordinates.z16.x}_${spot.tileCoordinates.z16.y}`
        ][index] = spot;
      }
    });
  }

  updateDots() {
    const allSpots: Spot.Class[] = this.getAllSpots();

    this.dots = allSpots.map((spot) => {
      return spot.location;
    });
  }

  openSpotById(spotId: string) {
    this._dbService
      .getSpotById(spotId)
      .pipe(take(1))
      .subscribe((spot) => {
        this.openSpot(spot);
      });
  }

  openSpot(spot: Spot.Class) {
    this.setSelectedSpot(spot);
    this.focusSpot(spot);

    // update the map URL
    this.updateMapURL();
  }

  focusSpot(spot: Spot.Class) {
    this.mapCenterStart = spot.location;
    this.mapZoom = 18;
  }

  toggleMapStyle() {
    this.map.toggleMapStyle();
  }

  createSpot() {
    if (!this.authService.isSignedIn) {
      // TODO show sign in dialog
      alert("Please sign in to create a spot"); // TODO
      return;
    }

    let center_coordinates: google.maps.LatLngLiteral = this.mapCenter;

    this.setSelectedSpot(
      new Spot.Class(
        "", // The id needs to be empty for the spot to be recognized as new
        {
          name: { de_CH: "New Spot" }, // TODO change to user lang
          location: new GeoPoint(
            center_coordinates.lat,
            center_coordinates.lng
          ),
        }
      )
    );

    // sets the map and the spot to edit mode
    this.setIsEditing(true);
  }

  saveSpot(spot: Spot.Class) {
    if (!spot) return;

    if (spot.hasBounds()) {
      let editedPaths = this.map.getPolygonPathForSpot(spot.id);
      if (editedPaths) {
        spot.paths = editedPaths;
      }
    }

    // If the spot does not have an ID, it does not exist in the database yet.

    let saveSpotPromise: Promise<void>;
    if (spot.id) {
      // this is an old spot that is edited
      saveSpotPromise = this._dbService.setSpot(spot.id, spot.data);
    } else {
      // this is a new spot
      saveSpotPromise = this._dbService.createSpot(spot.data);
    }

    saveSpotPromise
      .then(() => {
        // Successfully updated
        this.setIsEditing(false);
        // TODO Snackbar or something
        this.addOrUpdateNewSpotToLoadedSpotsAndUpdate(spot);
      })
      .catch((error) => {
        this.setIsEditing(false);
        console.error("Error on spot save", error);
      });
  }

  startEdit() {
    this.setIsEditing(true);

    this.uneditedSpot = this.selectedSpot.clone();
  }

  discardEdit() {
    // reset paths of editing polygon
    this.setIsEditing(false);

    if (!this.uneditedSpot) {
      // there is no backup unedited spot of the selected spot, therefore this is a newly created spot
      // delete local newly created spots
      //this.removeNewSpotFromLoadedSpotsAndUpdate();
      this.setSelectedSpot(null);
    } else {
      // set the selected spot to be the backup unedited spot
      this.setSelectedSpot(this.uneditedSpot);
      this.selectedSpot.paths = this.uneditedSpot.paths; // ?

      delete this.uneditedSpot;

      // reset the map to show the unedited spot
      // this.updateSpotInLoadedSpots(this.selectedSpot);
      // this.updateVisibleSpots();
    }
  }

  loadSpotsForTiles(tilesToLoad: { x: number; y: number }[]) {
    console.log("loading spots for tiles..." + tilesToLoad.toString());
    // this._dbService.getSpotsForTiles(tilesToLoad).subscribe(
    //   (spots) => {
    //     if (spots.length > 0) {
    //       let tile = spots[0].data.tile_coordinates.z16;
    //       this.loadedSpots[`z${16}_${tile.x}_${tile.y}`] = spots;
    //       this.updateVisibleSpots();
    //     }
    //   },
    //   (error) => {
    //     console.error(error);
    //   },
    //   () => {} // complete
    //);
  }

  spotMarkerMoved(event: { coords: google.maps.LatLngLiteral }) {
    if (this.selectedSpot) {
      this.selectedSpot.location = event.coords;
      this.selectedSpot.location = event.coords; // reflect move on map
    } else {
      console.error(
        "User somehow could change the spot marker position without having a spot selected"
      );
    }
  }

  /**
   * Unselect the spot and close the bottom panel
   */
  closeSpot() {
    if (this.isEditing) {
      // TODO show dialog
      alert(
        "You are currently editing a spot. Please save or discard your changes before closing the spot."
      );
      return;
      //this.discardEdit();
    }

    // unselect
    this.setSelectedSpot(null);

    // update the map URL
    this.updateMapURL();
  }

  /**
   * Add the first bounds to a spot. This can be used if the spot has no bounds attached to it.
   */
  addBounds() {
    if (!this.selectedSpot.id) {
      console.error(
        "The spot has no ID. It needs to be saved before bounds can be added to it."
      );
      return;
    }

    // TODO fix with mercator projection (this brakes at the poles)
    const dist = 0.0001;
    const location: google.maps.LatLngLiteral = this.selectedSpot.location;
    let _paths: Array<Array<google.maps.LatLngLiteral>> = [
      [
        { lat: location.lat + dist, lng: location.lng + dist },
        { lat: location.lat - dist, lng: location.lng + dist },
        { lat: location.lat - dist, lng: location.lng - dist },
        { lat: location.lat + dist, lng: location.lng - dist },
      ],
    ];
    //console.log("made inital bounds");
    this.selectedSpot.paths = _paths;
  }

  getReferenceToLoadedSpotById(spotId: string): LoadedSpotReference | null {
    const allSpots = this.getAllSpots();

    // find the spot with no id
    const spot: Spot.Class = allSpots.find((spot) => {
      return spot.id === spotId;
    });

    if (spot) {
      const tile = spot?.tileCoordinates?.z16;
      const indexInTileArray =
        this.loadedSpots[`z${16}_${tile.x}_${tile.y}`].indexOf(spot);

      //console.log(JSON.stringify(this.loadedSpots));

      const loadedSpotRef: LoadedSpotReference = {
        spot: spot,
        tile: tile,
        indexInTileArray: indexInTileArray,
        indexInTotalArray: spot ? allSpots.indexOf(spot) : -1,
      };

      return loadedSpotRef;
    } else {
      return null;
    }
  }

  /**
   * Add a newly created spot (before first save) to the loaded spots for nice display. It can be identified by having its ID set to empty string
   * @param newSpot The newly created spot class.
   */
  addOrUpdateNewSpotToLoadedSpotsAndUpdate(newSpot: Spot.Class) {
    //Get the tile coordinates to save in loaded spots
    const ref = this.getReferenceToLoadedSpotById(newSpot.id);
    console.log("ref", ref);
    if (ref?.spot && ref.indexInTileArray >= 0 && ref.tile) {
      // The spot exists and should be updated
      // Update the spot
      this.loadedSpots[`z${16}_${ref.tile.x}_${ref.tile.y}`][
        ref.indexInTileArray
      ] = newSpot;
    } else {
      // the spot does not exist

      // get the tile coordinates for the location of the new spot
      let tile = MapHelper.getTileCoordinatesForLocationAndZoom(
        newSpot.location,
        16
      );
      let spots = this.loadedSpots[`z${16}_${tile.x}_${tile.y}`];

      if (spots) {
        spots.push(newSpot);
      } else {
        // There are no spots loaded for this tile, add it to the loaded spots
        this.loadedSpots[`z${16}_${tile.x}_${tile.y}`] = [newSpot];
      }
    }
    // update the map to show the new spot on the loaded spots array.
    this.updateVisibleSpots();
  }

  /**
   * This function is used if the new spot was deleted, discarded or never saved.
   * It removes the first spot it finds without an id.
   */
  //   removeNewSpotFromLoadedSpotsAndUpdate() {
  //     const spotToRemoveRef = this.getReferenceToLoadedSpotById("");

  //     if (
  //       spotToRemoveRef &&
  //       spotToRemoveRef.spot &&
  //       spotToRemoveRef.tile &&
  //       spotToRemoveRef.indexInTileArray >= 0
  //     ) {
  //       this.loadedSpots[
  //         `z${16}_${spotToRemoveRef.tile.x}_${spotToRemoveRef.tile.y}`
  //       ].splice(spotToRemoveRef.indexInTileArray, 1);
  //     } else {
  //       console.warn("Dev: No spot to remove from loaded spots was found");
  //     }
  //   }

  /**
   * This function is used if the new spot was saved and now has an id. It replaces the first spot it finds with no ID with the newSaveSpot
   * @param newSavedSpot The new spot that replaces the unsaved new spot
   */
  updateNewSpotIdOnLoadedSpotsAndUpdate(newSavedSpot: Spot.Class) {
    if (newSavedSpot.id) {
      // TODO
    } else {
      console.error(
        "The newly saved spot doesn't have an ID attached to it. Something is wrong"
      );
    }
  }

  // Other public functions ///////////////////////////////////////////////////

  // calculateAllDotRadii() {
  //   for (let i = 0; i < 16; i++) {
  //     this.spotDotZoomRadii[i] = this.calculateDotRadius(i);
  //   }
  // }

  // calculateDotRadius(zoom: number) {
  //   let radius = 10 * (1 << (16 - zoom));
  //   return radius;
  // }

  // calculateAllDotOpcacities() {
  //   for (let zoom = 0; zoom < 16; zoom++) {
  //     const opacity = Math.min(Math.max((zoom - 4) / 20, 0.05), 0.8);
  //     this.zoomDotOpacities.push(opacity);
  //   }
  // }

  // oldDotRadius(zoom, location) {
  //   let mercator = Math.cos((location.latitude * Math.PI) / 180);
  //   let radius = 5 * (1 << (16 - zoom)) * (1 / mercator);
  //   return radius;
  // }
}
