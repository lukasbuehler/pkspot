import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";

/**
 * A low-emphasis map presence marker used when a richer marker would collide.
 * Required collision behavior keeps the dot visible while its low z-index lets
 * full spot and event markers remain the visual focus.
 */
@Component({
  selector: "app-map-presence-dot-marker",
  imports: [MapAdvancedMarker],
  template: `
    <div
      #dot
      class="presence-dot"
      [style.height.px]="size()"
      [style.width.px]="size()"
      [attr.aria-label]="label()"
      [attr.title]="label()"
    ></div>

    <map-advanced-marker
      [position]="position()"
      [content]="dot"
      [options]="markerOptions()"
      [zIndex]="zIndex()"
      (mapClick)="markerClick.emit()"
      (markerInitialized)="centerMarkerAnchor($event)"
    />
  `,
  styles: `
    :host {
      display: contents;
    }

    .presence-dot {
      border-radius: 50%;
      box-sizing: border-box;
      cursor: pointer;
      opacity: 0.82;
      pointer-events: auto;
      background: var(--mat-sys-primary-container);
      border: 1px solid var(--mat-sys-primary);
      transition:
        opacity 120ms ease,
        transform 120ms ease;
    }

    .presence-dot:hover {
      opacity: 1;
      transform: scale(1.35);
    }

  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPresenceDotMarkerComponent {
  readonly position = input.required<google.maps.LatLngLiteral>();
  readonly label = input.required<string>();
  readonly size = input<number>(8);
  readonly zIndex = input<number>(5);
  readonly markerClick = output<void>();

  readonly markerOptions = computed<google.maps.marker.AdvancedMarkerElementOptions>(
    () => ({
      collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
      gmpClickable: true,
      zIndex: this.zIndex(),
    }),
  );

  centerMarkerAnchor(marker: google.maps.marker.AdvancedMarkerElement): void {
    const centeredMarker = marker as google.maps.marker.AdvancedMarkerElement & {
      anchorLeft?: string;
      anchorTop?: string;
    };
    centeredMarker.anchorLeft = "-50%";
    centeredMarker.anchorTop = "-50%";
  }
}
