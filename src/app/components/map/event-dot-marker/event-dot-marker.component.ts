import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";
import { MatIconModule } from "@angular/material/icon";
import {
  buildMapMarkerOptions,
  getMapMarkerPriority,
} from "../markers/map-marker.model";
import { MapPointMarker } from "../../maps/map-overlays";

/**
 * Logo-first event marker for promoted events on the map. It intentionally
 * avoids the pin silhouette so events read differently from spots.
 */
export type EventMapMarker = MapPointMarker;

@Component({
  selector: "app-event-dot-marker",
  imports: [MapAdvancedMarker, MatIconModule],
  templateUrl: "./event-dot-marker.component.html",
  styleUrl: "./event-dot-marker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDotMarkerComponent {
  readonly marker = input.required<EventMapMarker>();
  readonly markerClick = output<EventMapMarker>();

  readonly markerOptions =
    computed<google.maps.marker.AdvancedMarkerElementOptions>(() =>
      ({
        ...buildMapMarkerOptions(this.marker()),
        collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
      })
    );
  readonly zIndex = computed(() => getMapMarkerPriority(this.marker()));

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
}
