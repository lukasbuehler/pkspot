import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";
import { MatIconModule } from "@angular/material/icon";
import { MarkerComponent } from "../../marker/marker.component";
import { buildMapMarkerOptions } from "../markers/map-marker.model";
import type { MapMarkerSchema } from "../markers/map-marker.model";

/**
 * Technical adapter for Google Advanced Markers.
 *
 * It owns the DOM shell passed to `map-advanced-marker`, switches between dot
 * and full marker rendering by zoom, and applies collision/z-index options.
 */
@Component({
  selector: "app-advanced-map-marker",
  imports: [MapAdvancedMarker, MatIconModule, MarkerComponent],
  templateUrl: "./advanced-map-marker.component.html",
  styleUrl: "./advanced-map-marker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdvancedMapMarkerComponent {
  marker = input.required<MapMarkerSchema>();
  index = input.required<number>();
  zoom = input.required<number>();
  dotModeThreshold = input<number>(17);
  forceFullMarker = input<boolean>(false);
  emitDotClick = input<boolean>(false);
  hoverPreviewEnabled = input<boolean>(false);
  markerClick = output<number>();
  readonly previewVisible = signal(false);

  readonly useDotMode = computed(
    () => !this.forceFullMarker() && this.zoom() <= this.dotModeThreshold()
  );

  readonly markerOptions =
    computed<google.maps.marker.AdvancedMarkerElementOptions>(() => {
      const options = buildMapMarkerOptions(this.marker());
      const hoverBoost =
        this.hoverPreviewEnabled() && this.previewVisible() ? 1_000_000 : 0;
      return {
        ...options,
        zIndex: (options.zIndex ?? 0) + hoverBoost,
      };
    });

  onDotMapClick(el: HTMLElement | null | undefined, event?: unknown): void {
    this.focusMarkerShell(el);
    this.stopPropagation(event);
    if (this.emitDotClick()) {
      this.markerClick.emit(this.index());
    }
  }

  onMarkerContentClick(markerContent?: HTMLElement, event?: unknown): void {
    if (!markerContent) return;

    this.focusMarkerShell(markerContent);
    this.stopPropagation(event);
    this.markerClick.emit(this.index());
  }

  showPreview(): void {
    if (this.hoverPreviewEnabled()) {
      this.previewVisible.set(true);
    }
  }

  hidePreview(): void {
    this.previewVisible.set(false);
  }

  private focusMarkerShell(el: HTMLElement | null | undefined): void {
    el?.focus();
  }

  private stopPropagation(event: unknown): void {
    if (this.canStopPropagation(event)) {
      event.stopPropagation();
    }
  }

  private canStopPropagation(
    event: unknown
  ): event is { stopPropagation: () => void } {
    return (
      typeof event === "object" &&
      event !== null &&
      "stopPropagation" in event &&
      typeof event.stopPropagation === "function"
    );
  }
}
