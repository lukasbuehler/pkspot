import { Component, computed, input, output } from "@angular/core";
import { trigger, transition, style, animate } from "@angular/animations";
import { MapAdvancedMarker } from "@angular/google-maps";
import { MarkerComponent, MarkerSchema } from "../marker/marker.component";
import { NgClass } from "@angular/common";

/**
 * Component for rendering a single custom marker on the map.
 *
 * This component encapsulates marker content and Advanced Marker to ensure
 * each marker instance has its own DOM element reference, preventing the
 * template reference sharing issue that occurs in @for loops.
 *
 * Supports two display modes:
 * - Dot mode: Small colored dots for low zoom levels
 * - Full mode: Complete styled markers with icons for high zoom levels
 *
 * Collision Behavior:
 * - Uses OPTIONAL_AND_HIDES_LOWER_PRIORITY for amenity markers
 * - Priority based on marker type (secondary=drinking water, tertiary=toilets)
 * - Lower priority than highlight markers (100-900 vs 1000-5000)
 * - Markers are offset so the location is at the bottom
 */
@Component({
  selector: "app-custom-marker",
  standalone: true,
  imports: [MapAdvancedMarker, MarkerComponent, NgClass],
  animations: [
    trigger("fadeInOut", [
      transition(":enter", [
        style({ opacity: 0, transform: "translateY(20%) scale(0.9)" }),
        animate(
          "0.22s ease-out",
          style({ opacity: 1, transform: "translateY(50%) scale(1)" })
        ),
      ]),
      transition(":leave", [
        style({ opacity: 1, transform: "translateY(50%) scale(1)" }),
        animate(
          "0.18s ease-in",
          style({ opacity: 0, transform: "translateY(20%) scale(0.9)" })
        ),
      ]),
    ]),
  ],
  template: `
    @if(useDotMode()) {
    <!-- Small dot marker for low zoom -->
    <div
      #dotElement
      [@fadeInOut]
      class="shadow-sm border"
      style="width: 8px; height: 8px; border-radius: 4px"
      tabindex="0"
      role="button"
      [ngClass]="{
        'marker-primary-dark': marker().color === 'primary',
        'marker-secondary-dark': marker().color === 'secondary',
        'marker-tertiary-dark': marker().color === 'tertiary'
      }"
    ></div>
    <map-advanced-marker
      [position]="marker().location"
      [content]="dotElement"
      [options]="dotMarkerOptions()"
      (mapClick)="onDotMapClick(dotElement, $event)"
    />
    } @else {
    <!-- Full marker for high zoom -->
    <app-marker
      #markerContent
      [@fadeInOut]
      style="pointer-events: none"
      [icons]="marker().icons"
      [number]="marker().number"
      [color]="marker().color ?? 'primary'"
      [size]="0.8"
      [title]="marker().name"
      (click)="onMarkerContentClick(markerContent)"
    />
    <map-advanced-marker
      [position]="marker().location"
      [content]="markerContent.elementRef.nativeElement"
      [options]="fullMarkerOptions()"
      (mapClick)="onMarkerContentClick(markerContent, $event)"
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
export class CustomMarkerComponent {
  /** Marker data to display */
  marker = input.required<MarkerSchema>();

  /** Index of this marker in the parent array */
  index = input.required<number>();

  /** Current zoom level to determine display mode */
  zoom = input.required<number>();

  /** Zoom threshold below which to show dots (inclusive) */
  dotModeThreshold = input<number>(17);

  /** Emitted when the marker is clicked, with the marker's index */
  markerClick = output<number>();

  /**
   * Determine if we should show dot mode based on zoom level
   */
  useDotMode = () => this.zoom() <= this.dotModeThreshold();

  /**
   * Get priority based on marker's explicit priority or fallback to color/type.
   * Amenity markers have lower priority than highlight markers.
   * - If marker has explicit priority, use that
   * - Otherwise:
   *   - secondary (drinking water): priority 500
   *   - tertiary free toilets: priority 350
   *   - tertiary unknown toilets: priority 300
   *   - tertiary paid toilets: priority 250
   *   - primary (other): priority 100
   */
  private getMarkerPriority(): number {
    // Use explicit priority if set
    if (
      this.marker().priority !== undefined &&
      typeof this.marker().priority === "number"
    ) {
      return this.marker().priority as number;
    }

    // Fallback to color-based priority
    const color = this.marker().color;
    switch (color) {
      case "secondary": // Drinking water
        return 500;
      case "tertiary": // Toilets (will be overridden by explicit priority)
        return 300;
      case "primary":
      default:
        return 100;
    }
  }

  /**
   * Options for dot mode markers (low zoom).
   * Small offset for dots since they're tiny.
   */
  dotMarkerOptions = computed<google.maps.marker.AdvancedMarkerElementOptions>(
    () => ({
      gmpClickable: true,
      collisionBehavior:
        google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY,
      zIndex: this.getMarkerPriority(),
    })
  );

  /**
   * Options for full markers (high zoom).
   * Larger offset so location is at the bottom of the marker.
   */
  fullMarkerOptions = computed<google.maps.marker.AdvancedMarkerElementOptions>(
    () => ({
      gmpClickable: true,
      collisionBehavior:
        google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY,
      zIndex: this.getMarkerPriority(),
    })
  );

  /**
   * Handle marker click events
   */
  /** Focus-only handlers for amenity markers/dots */
  onDotMapClick(el: HTMLElement | null | undefined, $event?: unknown): void {
    try {
      el?.focus();
    } catch (e) {
      // ignore
    }
    if ($event && typeof ($event as any).stopPropagation === "function") {
      ($event as any).stopPropagation();
    }
  }

  onMarkerContentClick(markerContent?: any, $event?: unknown): void {
    if (!markerContent) return;
    try {
      markerContent?.elementRef?.nativeElement?.focus();
    } catch (e) {
      // ignore
    }
    if ($event && typeof ($event as any).stopPropagation === "function") {
      ($event as any).stopPropagation();
    }
  }
}
