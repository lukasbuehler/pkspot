import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";

/**
 * Small clickable dot marker for a community on the map. Sits at the
 * community's `bounds_center`. Tapping it bubbles the community key up
 * so the host can open the panel.
 *
 * Visual: filled blue dot, sized by scope hierarchy (country > region >
 * locality). No text label; labels appear on hover via the native title
 * tooltip, and tapping opens the panel.
 *
 * Distinct from the active-community area circle (`communityArea` on the map)
 * which is a visual area overlay; this is the persistent click target.
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
  templateUrl: "./community-dot-marker.component.html",
  styleUrl: "./community-dot-marker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityDotMarkerComponent {
  readonly community = input.required<CommunityMapMarker>();
  readonly zIndex = input<number>(2);
  readonly markerClick = output<string>();
  readonly markerOptions =
    computed<google.maps.marker.AdvancedMarkerElementOptions>(() => ({
      gmpClickable: true,
      collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
      zIndex: this.zIndex(),
    }));

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
