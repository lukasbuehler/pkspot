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
        height: dotSize() + 'px',
        width: dotSize() + 'px'
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
  private readonly DOT_SIZE_SCALE = 0.75;

  dot = input.required<SpotClusterDotSchema>();
  markerClick = output<SpotClusterDotSchema>();

  constructor(private theme: ThemeService) {}

  resolvedDarkMode = computed<boolean>(() => {
    return this.theme.isDark("roadmap"); // Assuming roadmap style for now or inject parent's mapStyle if needed
  });

  private toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private extractLatLng(dot: SpotClusterDotSchema): google.maps.LatLngLiteral | null {
    const location: any = dot.location as any;
    const locationRaw: any = dot.location_raw as any;

    const latFn =
      location && typeof location.lat === "function"
        ? this.toNumber(location.lat())
        : null;
    const lngFn =
      location && typeof location.lng === "function"
        ? this.toNumber(location.lng())
        : null;
    if (latFn !== null && lngFn !== null) {
      return { lat: latFn, lng: lngFn };
    }

    if (location && typeof location.toJSON === "function") {
      const json = location.toJSON();
      const lat = this.toNumber((json as any)?.lat);
      const lng = this.toNumber((json as any)?.lng);
      if (lat !== null && lng !== null) {
        return { lat, lng };
      }
    }

    const candidates: Array<[unknown, unknown]> = [
      [location?.latitude, location?.longitude],
      [location?._latitude, location?._longitude],
      [location?._lat, location?._long],
      [location?.lat, location?.lng],
      [location?.lat, location?.lon],
      [locationRaw?.lat, locationRaw?.lng],
    ];

    for (const [latRaw, lngRaw] of candidates) {
      const lat = this.toNumber(latRaw);
      const lng = this.toNumber(lngRaw);
      if (lat !== null && lng !== null) {
        return { lat, lng };
      }
    }

    if (typeof location === "string") {
      const match = location.match(
        /(latitude|_latitude|lat)\s*[=:]\s*([-\d.]+).*?(longitude|_longitude|lng|lon)\s*[=:]\s*([-\d.]+)/
      );
      if (match) {
        const lat = this.toNumber(match[2]);
        const lng = this.toNumber(match[4]);
        if (lat !== null && lng !== null) {
          return { lat, lng };
        }
      }
    }

    return null;
  }

  position = computed<google.maps.LatLngLiteral>(() => {
    return this.extractLatLng(this.dot()) ?? { lat: 0, lng: 0 };
  });

  dotSize = computed<number>(() => {
    const raw = 12 + Math.sqrt(this.dot().weight) * 2;
    return raw * this.DOT_SIZE_SCALE;
  });
}
