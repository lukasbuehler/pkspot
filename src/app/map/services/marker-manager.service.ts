import { Injectable, Signal, computed, inject, signal } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";
import { MarkerSchema } from "../../marker/marker.component";
import { Spot, LocalSpot } from "../../../db/models/Spot";
import { SpotClusterDotSchema } from "../../../db/schemas/SpotClusterTile";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { PolygonSchema } from "../../../db/schemas/PolygonSchema";
import { TilesObject } from "../map.component";

/**
 * Enhanced marker schema with rendering metadata
 */
export interface EnhancedMarkerSchema extends MarkerSchema {
  id: string;
  type: MarkerType;
  zIndex?: number;
  draggable?: boolean;
  clickable?: boolean;
  visible?: boolean;
  data?: any; // Associated data (spot, cluster, etc.)
}

/**
 * Different types of markers that can be displayed on the map
 */
export type MarkerType =
  | "spot"
  | "spot-cluster"
  | "selected-spot"
  | "selected-challenge"
  | "amenity-water"
  | "amenity-toilet"
  | "custom"
  | "geolocation"
  | "highlighted-spot";

/**
 * Configuration for different marker types
 */
export interface MarkerTypeConfig {
  defaultColor: "primary" | "secondary" | "tertiary" | "gray";
  defaultIcons: string[];
  defaultZIndex: number;
  showAtZoom?: number; // Minimum zoom level to show this marker type
  hideAtZoom?: number; // Maximum zoom level to show this marker type
  clickable: boolean;
  draggable?: boolean;
}

/**
 * Marker rendering options
 */
export interface MarkerRenderOptions {
  showDots?: boolean; // Show as small dots at low zoom
  showFull?: boolean; // Show as full markers at high zoom
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Central service for managing all map markers
 */
@Injectable({
  providedIn: "root",
})
export class MarkerManagerService {
  private readonly markerConfigs: Record<MarkerType, MarkerTypeConfig> = {
    spot: {
      defaultColor: "primary",
      defaultIcons: ["fiber_manual_record"],
      defaultZIndex: 100,
      showAtZoom: 16,
      clickable: true,
    },
    "spot-cluster": {
      defaultColor: "primary",
      defaultIcons: [],
      defaultZIndex: 50,
      hideAtZoom: 15,
      clickable: true,
    },
    "selected-spot": {
      defaultColor: "primary",
      defaultIcons: ["star", "fiber_manual_record"],
      defaultZIndex: 1000,
      clickable: true,
      draggable: true,
    },
    "selected-challenge": {
      defaultColor: "primary",
      defaultIcons: ["flag"],
      defaultZIndex: 1001,
      clickable: true,
      draggable: true,
    },
    "amenity-water": {
      defaultColor: "secondary",
      defaultIcons: ["water_full"],
      defaultZIndex: 200,
      showAtZoom: 16,
      clickable: true,
    },
    "amenity-toilet": {
      defaultColor: "tertiary",
      defaultIcons: ["wc"],
      defaultZIndex: 200,
      showAtZoom: 16,
      clickable: true,
    },
    custom: {
      defaultColor: "gray",
      defaultIcons: ["place"],
      defaultZIndex: 150,
      clickable: true,
    },
    geolocation: {
      defaultColor: "primary",
      defaultIcons: ["my_location"],
      defaultZIndex: 10000,
      clickable: false,
    },
    "highlighted-spot": {
      defaultColor: "primary",
      defaultIcons: ["star"],
      defaultZIndex: 500,
      clickable: true,
    },
  };

  // Internal marker storage
  private _allMarkers = signal<Map<string, EnhancedMarkerSchema>>(new Map());
  private _visibleMarkers = signal<EnhancedMarkerSchema[]>([]);
  private _currentZoom = signal<number>(4);
  private _visibleTiles = signal<TilesObject | null>(null);

  // Public observables
  public readonly visibleMarkers: Signal<EnhancedMarkerSchema[]> =
    this._visibleMarkers.asReadonly();
  public readonly allMarkers: Signal<Map<string, EnhancedMarkerSchema>> =
    this._allMarkers.asReadonly();

  constructor() {
    // Recompute visible markers when zoom or tiles change
    computed(() => {
      this.updateVisibleMarkers();
    });
  }

  /**
   * Set the current zoom level
   */
  setZoom(zoom: number): void {
    this._currentZoom.set(zoom);
  }

  /**
   * Set the currently visible tiles
   */
  setVisibleTiles(tiles: TilesObject | null): void {
    this._visibleTiles.set(tiles);
  }

  /**
   * Add or update a marker
   */
  addMarker(
    marker: Partial<EnhancedMarkerSchema> & {
      id: string;
      type: MarkerType;
      location: google.maps.LatLngLiteral;
    }
  ): void {
    const config = this.markerConfigs[marker.type];
    const enhancedMarker: EnhancedMarkerSchema = {
      ...marker,
      color: marker.color ?? config.defaultColor,
      icons: marker.icons ?? config.defaultIcons,
      zIndex: marker.zIndex ?? config.defaultZIndex,
      clickable: marker.clickable ?? config.clickable,
      draggable: marker.draggable ?? config.draggable ?? false,
      visible: marker.visible ?? true,
    };

    const currentMarkers = this._allMarkers();
    currentMarkers.set(marker.id, enhancedMarker);
    this._allMarkers.set(new Map(currentMarkers));
  }

  /**
   * Remove a marker by ID
   */
  removeMarker(id: string): void {
    const currentMarkers = this._allMarkers();
    currentMarkers.delete(id);
    this._allMarkers.set(new Map(currentMarkers));
  }

  /**
   * Remove all markers of a specific type
   */
  removeMarkersByType(type: MarkerType): void {
    const currentMarkers = this._allMarkers();
    for (const [id, marker] of currentMarkers) {
      if (marker.type === type) {
        currentMarkers.delete(id);
      }
    }
    this._allMarkers.set(new Map(currentMarkers));
  }

  /**
   * Clear all markers
   */
  clearAllMarkers(): void {
    this._allMarkers.set(new Map());
  }

  /**
   * Add multiple spots as markers
   */
  addSpotsAsMarkers(spots: (Spot | LocalSpot)[]): void {
    spots.forEach((spot, index) => {
      this.addMarker({
        id: `spot-${spot instanceof Spot ? spot.id : `local-${index}`}`,
        type: "spot",
        location: spot.location(),
        name: spot.name(),
        icons: [spot.isIconic ? "stars" : "fiber_manual_record"],
        data: spot,
      });
    });
  }

  /**
   * Add cluster dots as markers
   */
  addClusterDotsAsMarkers(dots: SpotClusterDotSchema[]): void {
    dots.forEach((dot, index) => {
      this.addMarker({
        id: `cluster-dot-${index}`,
        type: "spot-cluster",
        location: {
          lat: dot.location.latitude,
          lng: dot.location.longitude,
        },
        number: dot.weight,
        data: dot,
      });
    });
  }

  /**
   * Add highlighted spots as markers
   */
  addHighlightedSpotsAsMarkers(spots: SpotPreviewData[]): void {
    spots.forEach((spot, index) => {
      if (spot.location) {
        this.addMarker({
          id: `highlighted-spot-${spot.id || index}`,
          type: "highlighted-spot",
          location: {
            lat: spot.location.latitude,
            lng: spot.location.longitude,
          },
          name: spot.name,
          data: spot,
        });
      }
    });
  }

  /**
   * Add amenity markers (water, toilets, etc.)
   */
  addAmenityMarkers(
    markers: MarkerSchema[],
    type: "amenity-water" | "amenity-toilet"
  ): void {
    markers.forEach((marker, index) => {
      this.addMarker({
        id: `${type}-${index}`,
        type: type,
        location: marker.location,
        name: marker.name,
        icons: marker.icons,
        color: marker.color,
        data: marker,
      });
    });
  }

  /**
   * Add custom markers (events, parking, etc.)
   */
  addCustomMarkers(markers: MarkerSchema[]): void {
    markers.forEach((marker, index) => {
      this.addMarker({
        id: `custom-${index}`,
        type: "custom",
        location: marker.location,
        name: marker.name,
        icons: marker.icons,
        color: marker.color,
        data: marker,
      });
    });
  }

  /**
   * Set the selected spot marker
   */
  setSelectedSpotMarker(
    spot: Spot | LocalSpot | null,
    isEditing = false
  ): void {
    this.removeMarker("selected-spot");

    if (spot) {
      this.addMarker({
        id: "selected-spot",
        type: "selected-spot",
        location: spot.location(),
        name: spot.name(),
        icons: [spot.isIconic ? "stars" : "fiber_manual_record"],
        draggable: isEditing,
        data: spot,
      });
    }
  }

  /**
   * Set the selected challenge marker
   */
  setSelectedChallengeMarker(challenge: any, isEditing = false): void {
    this.removeMarker("selected-challenge");

    if (challenge && challenge.location) {
      this.addMarker({
        id: "selected-challenge",
        type: "selected-challenge",
        location: challenge.location(),
        name: challenge.name(),
        icons: ["flag"],
        draggable: isEditing,
        data: challenge,
      });
    }
  }

  /**
   * Set the geolocation marker
   */
  setGeolocationMarker(location: google.maps.LatLngLiteral | null): void {
    this.removeMarker("geolocation");

    if (location) {
      this.addMarker({
        id: "geolocation",
        type: "geolocation",
        location: location,
        name: "Your location",
        icons: ["my_location"],
      });
    }
  }

  /**
   * Get markers by type
   */
  getMarkersByType(type: MarkerType): EnhancedMarkerSchema[] {
    return Array.from(this._allMarkers().values()).filter(
      (marker) => marker.type === type
    );
  }

  /**
   * Get a marker by ID
   */
  getMarkerById(id: string): EnhancedMarkerSchema | undefined {
    return this._allMarkers().get(id);
  }

  /**
   * Update visible markers based on current zoom and tiles
   */
  private updateVisibleMarkers(): void {
    const zoom = this._currentZoom();
    const allMarkers = Array.from(this._allMarkers().values());

    const visibleMarkers = allMarkers.filter((marker) => {
      if (!marker.visible) return false;

      const config = this.markerConfigs[marker.type];

      // Check zoom-based visibility
      if (config.showAtZoom && zoom < config.showAtZoom) return false;
      if (config.hideAtZoom && zoom > config.hideAtZoom) return false;

      // Additional filtering logic can be added here (e.g., tile-based visibility)

      return true;
    });

    // Sort by zIndex
    visibleMarkers.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    this._visibleMarkers.set(visibleMarkers);
  }

  /**
   * Create marker rendering options for different zoom levels
   */
  getMarkerRenderOptions(
    marker: EnhancedMarkerSchema,
    zoom: number
  ): MarkerRenderOptions {
    const config = this.markerConfigs[marker.type];

    return {
      showDots:
        zoom <= 17 &&
        marker.type !== "selected-spot" &&
        marker.type !== "selected-challenge",
      showFull:
        zoom > 17 ||
        marker.type === "selected-spot" ||
        marker.type === "selected-challenge",
      minZoom: config.showAtZoom,
      maxZoom: config.hideAtZoom,
    };
  }
}
