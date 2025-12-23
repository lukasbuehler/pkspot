import { Component, computed, input, output } from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";
import { MarkerComponent } from "../marker/marker.component";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { AmenityIcons } from "../../../db/schemas/Amenities";
import { getImportantAmenities } from "../../../db/models/Amenities";

/**
 * Component for rendering a single highlight marker on the map.
 *
 * This component solves the critical issue of template reference sharing in loops.
 * When using @for loops with template references (#marker), all iterations share
 * the same reference, causing Advanced Markers to lose their DOM content.
 *
 * By encapsulating the marker within its own component, each instance maintains
 * its own isolated template reference, ensuring stable DOM connections.
 *
 * Collision Behavior:
 * - Uses OPTIONAL_AND_HIDES_LOWER_PRIORITY to hide lower priority markers
 * - Priority is based on spot rating (higher rating = higher priority)
 * - Markers are offset so the location is at the bottom (like selected spot)
 *
 * Icon Selection:
 * - Shows amenity icons (e.g., house + dollar sign for indoor spots with entry fee)
 * - Falls back to star_circle for iconic spots
 * - Falls back to star if no amenities are set
 *
 * @example
 * ```html
 * @for (spot of highlightedSpots(); track spot.id) {
 *   <app-highlight-marker
 *     [spot]="spot"
 *     [zIndex]="10"
 *     (markerClick)="onSpotClick($event)"
 *   />
 * }
 * ```
 */
@Component({
  selector: "app-highlight-marker",
  standalone: true,
  imports: [MapAdvancedMarker, MarkerComponent],
  template: `
    @if(spot().location) {
    <app-marker
      #markerContent
      class="fade-in"
      style="pointer-events: none"
      [icons]="markerIcons()"
      [number]="getRoundedRating()"
      [isRating]="true"
      [color]="color()"
      [size]="0.8"
      [title]="spot().name"
    />

    <map-advanced-marker
      [position]="{
        lat: spot().location!.latitude,
        lng: spot().location!.longitude
      }"
      [content]="markerContent.elementRef.nativeElement"
      [zIndex]="computedZIndex()"
      [options]="markerOptions()"
      (mapClick)="markerClick.emit(spot())"
    />
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .fade-in {
        animation: fadeIn 0.2s ease-out;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    `,
  ],
})
export class HighlightMarkerComponent {
  /** The spot data to display */
  spot = input.required<SpotPreviewData>();

  /** Base Z-index for marker layering */
  zIndex = input<number>(0);

  /** Color of the marker */
  color = input<"primary" | "secondary" | "tertiary" | "gray">("primary");

  /** Emitted when the marker is clicked */
  markerClick = output<SpotPreviewData>();

  /**
   * Compute Z-index based on rating for proper layering.
   * Higher rated spots should appear above lower rated ones.
   */
  computedZIndex = computed(() => {
    const baseZ = this.zIndex();
    const rating = this.spot().rating ?? 0;
    // Add rating as offset (max 5 points) to base z-index
    return baseZ + Math.round(rating);
  });

  /**
   * Marker options with collision behavior and offset.
   * - OPTIONAL_AND_HIDES_LOWER_PRIORITY: Hides lower priority markers on collision
   * - Priority based on rating (higher rating = higher priority, range 1000-5000)
   * - Offset so the location is at the bottom of the marker (like selected spot)
   */
  markerOptions = computed<google.maps.marker.AdvancedMarkerElementOptions>(
    () => {
      const rating = this.spot().rating ?? 0;
      // Priority range: 1000-5000 based on rating (0-5)
      // This puts highlights above amenities (priority 100-900) but below selected spot
      const priority = 1000 + Math.round(rating * 800);

      return {
        gmpClickable: true,
        collisionBehavior:
          google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY,
        zIndex: priority,
      };
    }
  );

  /**
   * Get rounded rating for display (e.g., 4.2 -> 4.2, 4.15 -> 4.2)
   */
  getRoundedRating(): number | null {
    const rating = this.spot().rating;
    return rating ? Math.round(rating * 10) / 10 : null;
  }

  /**
   * Computed marker icons based on spot amenities and iconic status.
   * Uses the centralized getImportantAmenities function to ensure consistency
   * with spot details and spot preview cards.
   * Priority:
   * 1. Show 'stars' icon for iconic spots (matching spot details)
   * 2. Show amenity icons (indoor, outdoor, entry_fee) if available
   * 3. Fall back to star if no amenities are set
   */
  markerIcons = computed<string[]>(() => {
    const spot = this.spot();

    // If iconic, always show 'stars' icon (matches spot details)
    if (spot.isIconic) {
      return ["stars"];
    }

    // If no amenities, fall back to star
    if (!spot.amenities) {
      return ["star"];
    }

    // Get important amenities using centralized logic
    const importantAmenities = getImportantAmenities(spot.amenities, spot.type);

    // Extract icons from important amenities
    const icons: string[] = importantAmenities
      .filter((amenity) => amenity.icon)
      .map((amenity) => amenity.icon!);

    // If we have icons, return them, otherwise fall back to star
    return icons.length > 0 ? icons : ["star"];
  });
}
