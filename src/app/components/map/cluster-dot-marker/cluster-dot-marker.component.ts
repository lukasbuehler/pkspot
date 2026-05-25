import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";
import { SpotClusterDotSchema } from "../../../../db/schemas/SpotClusterTile";
import { ThemeService } from "../../../services/theme.service";

type LatLngRecord = Record<string, unknown> & {
  lat?: unknown;
  lng?: unknown;
  toJSON?: () => unknown;
};

@Component({
  selector: "app-cluster-dot-marker",
  imports: [MapAdvancedMarker],
  templateUrl: "./cluster-dot-marker.component.html",
  styleUrl: "./cluster-dot-marker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClusterDotMarkerComponent {
  private readonly theme = inject(ThemeService);
  private readonly dotSizeScale = 0.75;

  readonly dot = input.required<SpotClusterDotSchema>();
  readonly markerClick = output<SpotClusterDotSchema>();
  readonly markerOptions: google.maps.marker.AdvancedMarkerElementOptions = {
    gmpClickable: true,
  };

  readonly resolvedDarkMode = computed<boolean>(() => {
    return this.theme.isDark("roadmap");
  });

  readonly position = computed<google.maps.LatLngLiteral>(() => {
    return this.extractLatLng(this.dot()) ?? { lat: 0, lng: 0 };
  });

  readonly dotSize = computed<number>(() => {
    const raw = 12 + Math.sqrt(this.dot().weight) * 2;
    return raw * this.dotSizeScale;
  });

  private toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private toRecord(value: unknown): LatLngRecord | null {
    return value !== null && typeof value === "object"
      ? (value as LatLngRecord)
      : null;
  }

  private callLatLngMethod(
    location: LatLngRecord | null,
    key: "lat" | "lng"
  ): number | null {
    const value = location?.[key];
    return typeof value === "function" ? this.toNumber(value()) : null;
  }

  private readJsonLatLng(
    location: LatLngRecord | null
  ): google.maps.LatLngLiteral | null {
    if (typeof location?.toJSON !== "function") {
      return null;
    }

    const json = this.toRecord(location.toJSON());
    const lat = this.toNumber(json?.lat);
    const lng = this.toNumber(json?.lng);
    return lat !== null && lng !== null ? { lat, lng } : null;
  }

  private extractLatLng(
    dot: SpotClusterDotSchema
  ): google.maps.LatLngLiteral | null {
    const rawLocation: unknown = dot.location;
    const location = this.toRecord(rawLocation);
    const locationRaw = this.toRecord(dot.location_raw);

    const latFn = this.callLatLngMethod(location, "lat");
    const lngFn = this.callLatLngMethod(location, "lng");
    if (latFn !== null && lngFn !== null) {
      return { lat: latFn, lng: lngFn };
    }

    const jsonLatLng = this.readJsonLatLng(location);
    if (jsonLatLng) {
      return jsonLatLng;
    }

    const candidates: Array<[unknown, unknown]> = [
      [location?.["latitude"], location?.["longitude"]],
      [location?.["_latitude"], location?.["_longitude"]],
      [location?.["_lat"], location?.["_long"]],
      [location?.["lat"], location?.["lng"]],
      [location?.["lat"], location?.["lon"]],
      [locationRaw?.["lat"], locationRaw?.["lng"]],
    ];

    for (const [latRaw, lngRaw] of candidates) {
      const lat = this.toNumber(latRaw);
      const lng = this.toNumber(lngRaw);
      if (lat !== null && lng !== null) {
        return { lat, lng };
      }
    }

    if (typeof rawLocation === "string") {
      const match = rawLocation.match(
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
}
