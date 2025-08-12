import { MarkerSchema } from "../../marker/marker.component";
import {
  EnhancedMarkerSchema,
  MarkerType,
} from "../services/marker-manager.service";

/**
 * Utility functions for marker operations
 */
export class MarkerUtils {
  /**
   * Convert a basic MarkerSchema to an EnhancedMarkerSchema
   */
  static enhanceMarker(
    marker: MarkerSchema,
    id: string,
    type: MarkerType
  ): EnhancedMarkerSchema {
    return {
      ...marker,
      id,
      type,
      visible: true,
      clickable: true,
      draggable: false,
    };
  }

  /**
   * Generate unique IDs for markers based on type and index
   */
  static generateMarkerId(
    type: MarkerType,
    index: number,
    prefix?: string
  ): string {
    const prefixPart = prefix ? `${prefix}-` : "";
    return `${prefixPart}${type}-${index}`;
  }

  /**
   * Filter markers by zoom level visibility
   */
  static filterMarkersByZoom(
    markers: EnhancedMarkerSchema[],
    zoom: number
  ): EnhancedMarkerSchema[] {
    return markers.filter((marker) => {
      switch (marker.type) {
        case "spot":
        case "amenity-water":
        case "amenity-toilet":
          return zoom >= 16;
        case "spot-cluster":
          return zoom <= 15;
        case "selected-spot":
        case "selected-challenge":
        case "geolocation":
          return true; // Always visible
        default:
          return true;
      }
    });
  }

  /**
   * Sort markers by priority/zIndex
   */
  static sortMarkersByPriority(
    markers: EnhancedMarkerSchema[]
  ): EnhancedMarkerSchema[] {
    return markers.sort((a, b) => {
      const aZIndex = a.zIndex || 0;
      const bZIndex = b.zIndex || 0;
      return aZIndex - bZIndex;
    });
  }

  /**
   * Group markers by type
   */
  static groupMarkersByType(
    markers: EnhancedMarkerSchema[]
  ): Map<MarkerType, EnhancedMarkerSchema[]> {
    const groups = new Map<MarkerType, EnhancedMarkerSchema[]>();

    markers.forEach((marker) => {
      if (!groups.has(marker.type)) {
        groups.set(marker.type, []);
      }
      groups.get(marker.type)!.push(marker);
    });

    return groups;
  }

  /**
   * Check if a marker should be rendered as a dot or full marker
   */
  static shouldRenderAsDot(
    marker: EnhancedMarkerSchema,
    zoom: number
  ): boolean {
    return (
      zoom <= 17 &&
      marker.type !== "selected-spot" &&
      marker.type !== "selected-challenge" &&
      marker.type !== "geolocation"
    );
  }

  /**
   * Get marker size based on type and zoom
   */
  static getMarkerSize(marker: EnhancedMarkerSchema, zoom: number): number {
    if (
      marker.type === "selected-spot" ||
      marker.type === "selected-challenge"
    ) {
      return 1.2;
    }

    if (marker.type === "spot-cluster") {
      return 0.8 + Math.min(0.4, (marker.number || 1) * 0.1);
    }

    return 0.8;
  }

  /**
   * Get dot size for cluster markers
   */
  static getDotSize(marker: EnhancedMarkerSchema): number {
    const baseSize = 8;

    if (marker.type === "spot-cluster" && marker.number) {
      return baseSize + Math.sqrt(marker.number) * 3;
    }

    return baseSize;
  }

  /**
   * Create a marker for a spot location
   */
  static createSpotMarker(
    spot: any,
    id: string,
    type: MarkerType = "spot"
  ): EnhancedMarkerSchema {
    return {
      id,
      type,
      location: spot.location(),
      name: spot.name(),
      icons: [spot.isIconic ? "star" : "fiber_manual_record"],
      color: "primary",
      zIndex: type === "selected-spot" ? 1000 : 100,
      clickable: true,
      draggable: type === "selected-spot",
      visible: true,
      data: spot,
    };
  }

  /**
   * Create a marker for amenities (water, toilets, etc.)
   */
  static createAmenityMarker(
    element: any,
    amenityType: "water" | "toilet",
    index: number
  ): EnhancedMarkerSchema {
    const isWater = amenityType === "water";

    return {
      id: `amenity-${amenityType}-${index}`,
      type: isWater ? "amenity-water" : "amenity-toilet",
      location: {
        lat: element.lat,
        lng: element.lon,
      },
      name: element.tags.name || (isWater ? "Drinking Water" : "Toilet"),
      icons: isWater ? ["water_full"] : ["wc"],
      color: isWater ? "secondary" : "tertiary",
      zIndex: 200,
      clickable: true,
      draggable: false,
      visible: true,
      data: element,
    };
  }

  /**
   * Update marker visibility based on tile bounds
   */
  static updateMarkerVisibilityByTiles(
    markers: EnhancedMarkerSchema[],
    visibleTiles: any
  ): EnhancedMarkerSchema[] {
    // Implementation would depend on your tile system
    // For now, return all markers as visible
    return markers.map((marker) => ({ ...marker, visible: true }));
  }
}
