import { Component, computed, input, output } from "@angular/core";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { SpotPreviewMarkerComponent } from "../spot-preview-marker/spot-preview-marker.component";

/**
 * Highlight markers reuse the hover-preview marker so rated/iconic spots
 * behave the same as regular spots on desktop maps.
 */
@Component({
  selector: "app-highlight-marker",
  standalone: true,
  imports: [SpotPreviewMarkerComponent],
  template: `
    <app-spot-preview-marker
      [spot]="spot()"
      [mapZoom]="mapZoom()"
      [hoverPreviewEnabled]="hoverPreviewEnabled()"
      [color]="color()"
      [zIndexBase]="computedZIndex()"
      (markerClick)="emitMarkerClick($event)"
    ></app-spot-preview-marker>
  `,
})
export class HighlightMarkerComponent {
  spot = input.required<SpotPreviewData>();
  zIndex = input<number>(0);
  mapZoom = input<number | null>(null);
  hoverPreviewEnabled = input<boolean>(true);
  color = input<"primary" | "secondary" | "tertiary" | "gray">("primary");
  markerClick = output<SpotPreviewData>();

  computedZIndex = computed(() => {
    const baseZ = this.zIndex();
    const rating = this.spot().rating ?? 0;
    return baseZ + Math.round(rating * 10);
  });

  emitMarkerClick(spot: SpotPreviewData | unknown) {
    this.markerClick.emit(spot as SpotPreviewData);
  }
}
