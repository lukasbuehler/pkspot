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
import {
  buildMapMarkerOptions,
  getMapMarkerPriority,
} from "../markers/map-marker.model";
import { EventCardComponent } from "../../event-card/event-card.component";
import type { EventMapMarker } from "../map-event-map-items.model";

/**
 * Logo-first event marker for promoted events on the map. It intentionally
 * avoids the pin silhouette so events read differently from spots.
 */
@Component({
  selector: "app-event-dot-marker",
  imports: [EventCardComponent, MapAdvancedMarker, MatIconModule],
  templateUrl: "./event-dot-marker.component.html",
  styleUrl: "./event-dot-marker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDotMarkerComponent {
  readonly marker = input.required<EventMapMarker>();
  readonly hoverPreviewEnabled = input(false);
  readonly markerClick = output<EventMapMarker>();
  readonly previewVisible = signal(false);
  readonly hoverPreviewActive = computed(
    () => this.hoverPreviewEnabled() && Boolean(this.marker().name),
  );
  readonly effectivePreviewVisible = computed(
    () => this.hoverPreviewActive() && this.previewVisible(),
  );

  readonly markerOptions =
    computed<google.maps.marker.AdvancedMarkerElementOptions>(() =>
      ({
        ...buildMapMarkerOptions(this.marker()),
        collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
      })
    );
  readonly zIndex = computed(
    () =>
      getMapMarkerPriority(this.marker()) +
      (this.effectivePreviewVisible() ? 1_000_000 : 0),
  );

  readonly isLive = computed(() => this.marker().color === "secondary");
  readonly fallbackIcon = computed(() => this.marker().icons?.[0] ?? "event");

  readonly ariaLabel = computed(() => {
    const marker = this.marker();
    const status = this.isLive() ? "happening now" : "upcoming event";
    return `${marker.name ?? "Event"} ${status}`;
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

  showPreview(): void {
    if (this.hoverPreviewActive()) {
      this.previewVisible.set(true);
    }
  }

  hidePreview(): void {
    this.previewVisible.set(false);
  }

  onPreviewClick(event: MouseEvent): void {
    event.stopPropagation();
    this.hidePreview();
    if (!this.marker().previewEvent) {
      this.markerClick.emit(this.marker());
    }
  }
}
