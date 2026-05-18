import { Component, computed, input, output } from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";
import { MatIconModule } from "@angular/material/icon";

/**
 * Small clickable chip-marker for an event on the map. Sits at the
 * event's bounds center. Sponsored events get a sponsor-tinted style;
 * plain events get the neutral chip.
 *
 * Independent of the map-island event promo — the island is a
 * timezone-and-viewport-driven attention banner; this marker is a
 * persistent click target that lets users find events visually.
 */
export interface EventMapMarker {
  eventId: string;
  /** Slug if available, else the doc id — used by the host to route. */
  routeId: string;
  name: string;
  center: { lat: number; lng: number };
  status: "upcoming" | "live" | "past";
  isSponsored: boolean;
}

@Component({
  selector: "app-event-dot-marker",
  imports: [MapAdvancedMarker, MatIconModule],
  template: `
    <div
      #chip
      class="event-chip"
      [class.event-chip-live]="event().status === 'live'"
      [class.event-chip-past]="event().status === 'past'"
      [class.event-chip-sponsored]="event().isSponsored"
      [attr.aria-label]="ariaLabel()"
    >
      <mat-icon class="chip-icon">{{ icon() }}</mat-icon>
      <span class="chip-name">{{ event().name }}</span>
    </div>
    <map-advanced-marker
      [position]="event().center"
      [content]="chip"
      [options]="{ gmpClickable: true }"
      (mapClick)="markerClick.emit(event().routeId)"
      [zIndex]="zIndex()"
    ></map-advanced-marker>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .event-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px 4px 6px;
        border-radius: 999px;
        background: var(--mat-sys-surface-container, rgba(31, 31, 35, 0.85));
        color: var(--mat-sys-on-surface, #ffffff);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border: 1px solid var(--mat-sys-outline-variant, rgba(255, 255, 255, 0.15));
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        transition: transform 120ms ease, background-color 120ms ease;
      }

      .event-chip:hover {
        transform: translateY(-1px);
        background: var(--mat-sys-surface-container-high, rgba(40, 40, 45, 0.92));
      }

      .chip-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        /* Default tint matches "upcoming" — primary blue. */
        color: var(--mat-sys-primary, #b8c4ff);
      }

      .event-chip.event-chip-live .chip-icon {
        /* Live events use the secondary green per AGENTS.md theme rules. */
        color: var(--mat-sys-secondary, #8dd978);
      }

      .event-chip.event-chip-past {
        opacity: 0.55;
        .chip-icon {
          color: var(--mat-sys-on-surface-variant, #c8c8d0);
        }
      }

      /* Sponsored events get a subtle border highlight so paid placements
         visually pop a bit. Doesn't change the iconography. */
      .event-chip.event-chip-sponsored {
        border-color: var(--mat-sys-primary, #b8c4ff);
        box-shadow:
          0 0 0 1px rgba(184, 196, 255, 0.25),
          0 1px 4px rgba(0, 0, 0, 0.3);
      }

      .chip-name {
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ],
})
export class EventDotMarkerComponent {
  event = input.required<EventMapMarker>();
  /** zIndex hint — events sit above community chips by default. */
  zIndex = input<number>(3);
  /** Emits the event's `routeId` (slug or id) when clicked. */
  markerClick = output<string>();

  readonly icon = computed(() => {
    switch (this.event().status) {
      case "live":
        return "stars"; // signals "active now"
      case "past":
        return "history";
      default:
        return "event";
    }
  });

  readonly ariaLabel = computed(() => {
    const e = this.event();
    return e.status === "live"
      ? `${e.name} — happening now`
      : e.status === "past"
        ? `${e.name} — past event`
        : `${e.name} — upcoming event`;
  });
}
