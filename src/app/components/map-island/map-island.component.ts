import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from "@angular/core";
import { NgOptimizedImage } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { Event as PkEvent } from "../../../db/models/Event";
import { CommunityLandingPageData } from "../../services/firebase/firestore/landing-pages.service";
import { LocationStrategy } from "@angular/common";

/**
 * Variant payloads for the map island. Add new kinds here as the island grows.
 */
export type MapIslandContent =
  | { kind: "filter"; message: string }
  | { kind: "event"; event: PkEvent }
  | { kind: "community"; community: CommunityLandingPageData };

/**
 * The map island is a floating top-center overlay on the map, surfacing
 * context-relevant content: an active event in the visible region, a
 * matching community when looking at a place, or a "no spots for filter"
 * helper. Generalizes the previous inline `filterHelper` template.
 *
 * Presentational only — variant selection and dismissal logic live in the
 * host (map-page).
 */
@Component({
  selector: "app-map-island",
  imports: [MatButtonModule, MatIconModule, NgOptimizedImage],
  templateUrl: "./map-island.component.html",
  styleUrl: "./map-island.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapIslandComponent {
  /** Active content. When null, the island renders nothing. */
  content = input<MapIslandContent | null>(null);

  /** Filter variant: user clicked clear. */
  clearFilter = output<void>();

  /** Event variant: user opened the event (e.g., navigates to event page). */
  openEvent = output<PkEvent>();
  /** Event variant: user dismissed the chip (host should suppress for some time). */
  dismissEvent = output<PkEvent>();

  /** Community variant: user opened the community landing. */
  openCommunity = output<CommunityLandingPageData>();
  /** Community variant: user dismissed the chip. */
  dismissCommunity = output<CommunityLandingPageData>();

  onClearFilter() {
    this.clearFilter.emit();
  }

  onOpenEvent() {
    const c = this.content();
    if (c?.kind === "event") this.openEvent.emit(c.event);
  }

  onDismissEvent() {
    const c = this.content();
    if (c?.kind === "event") this.dismissEvent.emit(c.event);
  }

  onOpenCommunity() {
    const c = this.content();
    if (c?.kind === "community") this.openCommunity.emit(c.community);
  }

  onDismissCommunity() {
    const c = this.content();
    if (c?.kind === "community") this.dismissCommunity.emit(c.community);
  }
}
