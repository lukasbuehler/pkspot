import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";
import { COMMUNITY_DOT_SIZE_PX } from "./community-map-rendering";

/**
 * Lightweight community marker data for map overlays. Sits at the community's
 * `bounds_center`; tapping either its center marker or area overlay bubbles
 * the community key up so the host can open the panel.
 *
 * All mode uses locality area markers. Communities mode can additionally set
 * `pinVisible` and pin metadata for full country, region, and locality pins.
 *
 * Distinct from the active-community area circle (`communityArea` on the map)
 * which is a visual area overlay; this is the persistent click target.
 */
export interface CommunityMapMarker {
  communityKey: string;
  displayName: string;
  scope?: "country" | "region" | "locality";
  countryCode?: string;
  pinVisible?: boolean;
  pinIcon?: string;
  pinLabel?: string;
  pinSize?: number;
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

  readonly dotSizePx = COMMUNITY_DOT_SIZE_PX;

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
