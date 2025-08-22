import {
  Component,
  Input,
  Signal,
  computed,
  input,
  output,
} from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";
import { NgClass } from "@angular/common";
import { MarkerComponent } from "../../marker/marker.component";
import {
  EnhancedMarkerSchema,
  MarkerRenderOptions,
} from "../services/marker-manager.service";

/**
 * Component responsible for rendering individual markers on the map
 * This handles the different rendering modes (dots vs full markers) and click events
 */
@Component({
  selector: "app-map-marker-renderer",
  template: `
    <!-- Small dot marker for low zoom levels -->
    @if (renderOptions().showDots && !renderOptions().showFull) {
    <map-advanced-marker
      [position]="marker().location"
      [content]="dotElement"
      [options]="{
        gmpClickable: marker().clickable,
        gmpDraggable: marker().draggable
      }"
      [zIndex]="marker().zIndex || 0"
      (mapClick)="onMarkerClick()"
      (mapDragend)="onMarkerDragEnd($event)"
    ></map-advanced-marker>
    <div
      #dotElement
      class="marker-dot"
      [ngClass]="getDotClasses()"
      [style]="getDotStyles()"
    ></div>
    }

    <!-- Full marker for high zoom levels or special markers -->
    @if (renderOptions().showFull) {
    <map-advanced-marker
      [position]="marker().location"
      [content]="markerComponent.elementRef.nativeElement"
      [options]="{
        gmpClickable: marker().clickable,
        gmpDraggable: marker().draggable
      }"
      [zIndex]="marker().zIndex || 0"
      (mapClick)="onMarkerClick()"
      (mapDragend)="onMarkerDragEnd($event)"
    ></map-advanced-marker>
    <app-marker
      #markerComponent
      class="fade-in"
      [icons]="marker().icons"
      [number]="marker().number"
      [color]="marker().color || 'primary'"
      [size]="getMarkerSize()"
      [title]="marker().name"
      [isIconic]="isIconicMarker()"
      [clickable]="marker().clickable || false"
      (click)="onMarkerClick()"
    ></app-marker>
    }
  `,
  styles: [
    `
      .marker-dot {
        border-radius: 50%;
        transform: translateY(50%);
        border-style: solid;
        border-width: 2px;
        transition: background-color 0.3s ease, border-color 0.3s ease;
        pointer-events: none;
      }

      .marker-dot-primary {
        background-color: #b8c4ff;
        border-color: #0036ba;
      }

      .marker-dot-secondary {
        background-color: #ffd7f4;
        border-color: #b000a3;
      }

      .marker-dot-tertiary {
        background-color: #ffd7b8;
        border-color: #ba6800;
      }

      .marker-dot-gray {
        background-color: #d0d0d0;
        border-color: #313131;
      }

      .marker-dot-cluster {
        background-color: rgba(184, 196, 255, 0.8);
        border-color: #0036ba;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 10px;
        color: #0036ba;
      }

      .fade-in {
        opacity: 0;
        animation: fadeIn 0.3s ease-out forwards;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(50%) scale(0.8);
        }
        to {
          opacity: 1;
          transform: translateY(50%) scale(1);
        }
      }
    `,
  ],
  imports: [MapAdvancedMarker, NgClass, MarkerComponent],
})
export class MapMarkerRendererComponent {
  marker = input.required<EnhancedMarkerSchema>();
  zoom = input.required<number>();
  isDarkMode = input<boolean>(true);

  // Events
  markerClick = output<EnhancedMarkerSchema>();
  markerDragEnd = output<{
    marker: EnhancedMarkerSchema;
    position: google.maps.LatLng;
  }>();

  // Computed render options
  renderOptions: Signal<MarkerRenderOptions> = computed(() => {
    const marker = this.marker();
    const zoom = this.zoom();

    // Determine if we should show dots or full markers
    const showDots =
      zoom <= 17 &&
      marker.type !== "selected-spot" &&
      marker.type !== "selected-challenge" &&
      marker.type !== "geolocation";

    const showFull =
      zoom > 17 ||
      marker.type === "selected-spot" ||
      marker.type === "selected-challenge" ||
      marker.type === "geolocation";

    return {
      showDots,
      showFull,
      minZoom: this.getMinZoom(marker.type),
      maxZoom: this.getMaxZoom(marker.type),
    };
  });

  onMarkerClick(): void {
    if (this.marker().clickable) {
      this.markerClick.emit(this.marker());
    }
  }

  onMarkerDragEnd(event: google.maps.MapMouseEvent): void {
    if (event.latLng && this.marker().draggable) {
      this.markerDragEnd.emit({
        marker: this.marker(),
        position: event.latLng,
      });
    }
  }

  getDotClasses(): string {
    const marker = this.marker();
    const classes = ["marker-dot"];

    if (marker.type === "spot-cluster") {
      classes.push("marker-dot-cluster");
    } else {
      classes.push(`marker-dot-${marker.color || "primary"}`);
    }

    return classes.join(" ");
  }

  getDotStyles(): Record<string, string> {
    const marker = this.marker();
    const baseSize = 8;

    if (marker.type === "spot-cluster" && marker.number) {
      // Cluster dots scale with weight
      const size = baseSize + Math.sqrt(marker.number) * 3;
      return {
        height: `${size}px`,
        width: `${size}px`,
      };
    }

    return {
      height: `${baseSize}px`,
      width: `${baseSize}px`,
    };
  }

  getMarkerSize(): number {
    const marker = this.marker();

    if (
      marker.type === "selected-spot" ||
      marker.type === "selected-challenge"
    ) {
      return 1.2; // Larger for selected items
    }

    return 0.8; // Default size
  }

  isIconicMarker(): boolean {
    const marker = this.marker();
    return marker.type === "selected-spot" && marker.data?.isIconic;
  }

  private getMinZoom(type: string): number | undefined {
    const zoomLimits: Record<string, number> = {
      spot: 16,
      "amenity-water": 16,
      "amenity-toilet": 16,
    };
    return zoomLimits[type];
  }

  private getMaxZoom(type: string): number | undefined {
    const zoomLimits: Record<string, number> = {
      "spot-cluster": 15,
    };
    return zoomLimits[type];
  }
}
