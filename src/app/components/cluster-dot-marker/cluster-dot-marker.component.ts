import { Component, computed, input, output } from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";
import { SpotClusterDotSchema } from "../../../db/schemas/SpotClusterTile";
import { NgClass } from "@angular/common";
import { ThemeService } from "../../services/theme.service";
import { GeoPoint } from "firebase/firestore";

@Component({
  selector: "app-cluster-dot-marker",
  standalone: true,
  imports: [MapAdvancedMarker, NgClass],
  template: `
    <div
      #smallDot
      class="small-dot-marker"
      [ngClass]="{
        'marker-primary-dark': resolvedDarkMode(),
        'marker-primary-light': !resolvedDarkMode()
      }"
      [style]="{
        height: 12 + sqrt(dot().weight) * 2 + 'px',
        width: 12 + sqrt(dot().weight) * 2 + 'px'
      }"
    ></div>
    <map-advanced-marker
      [position]="position()"
      [content]="smallDot"
      [options]="{ gmpClickable: true }"
      (mapClick)="markerClick.emit(dot())"
      [zIndex]="dot().weight"
    ></map-advanced-marker>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .small-dot-marker {
        border-radius: 50%;
        opacity: 0.8;
      }
      .marker-primary-dark {
        background-color: #b8c4ff;
        border: 1px solid #0036ba;
        box-shadow: 0 0 4px #0036ba;
      }
      .marker-primary-light {
        background-color: #0036ba;
        border: 1px solid #b8c4ff;
        box-shadow: 0 0 4px #b8c4ff;
      }
    `,
  ],
})
export class ClusterDotMarkerComponent {
  dot = input.required<SpotClusterDotSchema>();
  markerClick = output<SpotClusterDotSchema>();

  sqrt = Math.sqrt;

  constructor(private theme: ThemeService) {}

  resolvedDarkMode = computed<boolean>(() => {
    return this.theme.isDark("roadmap"); // Assuming roadmap style for now or inject parent's mapStyle if needed
  });

  position = computed<google.maps.LatLngLiteral>(() => {
    const d = this.dot();
    if (d.location && d.location.latitude && d.location.longitude) {
      return { lat: d.location.latitude, lng: d.location.longitude };
    } else if (d.location_raw) {
      return { lat: d.location_raw.lat, lng: d.location_raw.lng };
    }
    // Fallback?
    return { lat: 0, lng: 0 };
  });
}
