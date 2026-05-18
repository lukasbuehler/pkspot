import { Component, computed, input, output } from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";

/**
 * Small clickable dot marker for a community on the map. Sits at the
 * community's `bounds_center`. Tapping it bubbles the community key up
 * so the host can open the panel.
 *
 * Visual: filled blue dot, sized by scope hierarchy (country > region >
 * locality). Matches the spot-cluster-dot-marker style so the map keeps
 * a unified "blue interactive dot" language. No text label — labels
 * appear on hover via the native title tooltip; tapping opens the panel
 * where the full name shows.
 *
 * Distinct from the active-community area circle (google-map-2d's
 * `communityArea` input) — that's a visual area overlay; this is the
 * persistent click target.
 */
export interface CommunityMapMarker {
  communityKey: string;
  displayName: string;
  scope?: "country" | "region" | "locality";
  center: { lat: number; lng: number };
  radiusM: number;
}

@Component({
  selector: "app-community-dot-marker",
  imports: [MapAdvancedMarker],
  template: `
    <div
      #dot
      class="community-dot"
      [class.scope-country]="community().scope === 'country'"
      [class.scope-region]="community().scope === 'region'"
      [class.scope-locality]="community().scope === 'locality'"
      [style.width.px]="dotSize()"
      [style.height.px]="dotSize()"
      [attr.title]="community().displayName"
      [attr.aria-label]="community().displayName"
    ></div>
    <map-advanced-marker
      [position]="community().center"
      [content]="dot"
      [options]="markerOptions()"
      (mapClick)="markerClick.emit(community().communityKey)"
      (markerInitialized)="centerMarkerAnchor($event)"
      [zIndex]="zIndex()"
    ></map-advanced-marker>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      /* Filled blue dot. Mirrors spot-cluster-dot-marker's palette so the
         map keeps a unified "interactive blue dot" language; communities
         distinguish themselves by sitting at named-place anchors and via
         their larger sizes at higher scopes. */
      .community-dot {
        border-radius: 50%;
        background-color: #b8c4ff;
        border: 1px solid #0036ba;
        box-shadow: 0 0 4px #0036ba;
        opacity: 0.85;
        cursor: pointer;
        transition:
          transform 120ms ease,
          opacity 120ms ease;
      }

      .community-dot:hover {
        transform: scale(1.18);
        opacity: 1;
      }
    `,
  ],
})
export class CommunityDotMarkerComponent {
  community = input.required<CommunityMapMarker>();
  /** zIndex hint — pass higher numbers for community circles you want above others. */
  zIndex = input<number>(2);
  markerClick = output<string>();
  readonly markerOptions =
    computed<google.maps.marker.AdvancedMarkerElementOptions>(() => ({
      gmpClickable: true,
      // Community dots are persistent context, so they should remain visible
      // even when a higher-priority highlight marker overlaps them.
      collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
      zIndex: this.zIndex(),
    }));

  /**
   * Diameter in pixels, derived from the community's scope so the dot
   * hierarchy is visually legible: country > region > locality.
   * Defaults to the region size when no scope is set.
   */
  readonly dotSize = computed<number>(() => {
    switch (this.community().scope) {
      case "country":
        return 20;
      case "region":
        return 14;
      case "locality":
        return 10;
      default:
        return 12;
    }
  });

  /**
   * Advanced markers default to bottom-center anchoring, which is right for
   * pins but wrong for circular dots. Re-anchor the underlying web component
   * to its visual center so the dot and community circle share the same point.
   */
  centerMarkerAnchor(marker: google.maps.marker.AdvancedMarkerElement): void {
    const centeredMarker =
      marker as google.maps.marker.AdvancedMarkerElement & {
        anchorLeft?: string;
        anchorTop?: string;
      };
    centeredMarker.anchorLeft = "-50%";
    centeredMarker.anchorTop = "-50%";
  }
}
