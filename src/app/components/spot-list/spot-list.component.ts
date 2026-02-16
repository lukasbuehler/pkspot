import {
  Component,
  computed,
  EventEmitter,
  input,
  Output,
} from "@angular/core";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import {
  transition,
  trigger,
  sequence,
  style,
  animate,
} from "@angular/animations";
import { AutoAnimateDirective } from "../../directives/auto-animate.directive";

@Component({
  selector: "app-spot-list",
  animations: [],
  imports: [
    SpotPreviewCardComponent,
    MatButtonToggleModule,
    MatIconModule,
    RouterLink,
    AutoAnimateDirective,
  ],
  templateUrl: "./spot-list.component.html",
  styleUrl: "./spot-list.component.scss",
})
export class SpotListComponent {
  highlightedSpots = input<SpotPreviewData[]>([]);
  spots = input<(Spot | LocalSpot)[]>([]);
  mapZoom = input<number | null>(null);

  limit = input<number | undefined>(undefined);
  enableAnimation = input<boolean>(true);

  withHrefLink = input(true);

  text = input<string>($localize`Spots in this area`);

  @Output("spotClickIndex") spotClickIndexEvent = new EventEmitter<number>();

  // Filter out highlighted spots from regular spots
  remainingSpots = computed(() => {
    const spots = this.spots();
    const highlights = this.highlightedSpots();

    return spots.filter((spot) => {
      const foundSpot: SpotPreviewData | undefined = highlights.find(
        (highlightedSpot) => {
          if (spot instanceof Spot && highlightedSpot.id) {
            return highlightedSpot.id === spot.id;
          }
          return false;
        }
      );
      return !foundSpot;
    });
  });

  renderedHighlightedSpots = computed(() => {
    const limit = this.limit();
    const highlights = this.highlightedSpots();

    if (limit === undefined) {
      return highlights;
    }
    return highlights.slice(0, limit);
  });

  renderedRemainingSpots = computed(() => {
    const limit = this.limit();
    const remaining = this.remainingSpots();
    const renderedHighlightsCount = this.renderedHighlightedSpots().length;

    if (limit === undefined) {
      return remaining;
    }

    const remainingLimit = limit - renderedHighlightsCount;
    if (remainingLimit <= 0) {
      return [];
    }
    return remaining.slice(0, remainingLimit);
  });

  spotClick(spotIndex: number) {
    this.spotClickIndexEvent.emit(spotIndex);
  }

  getSpotIdOrSlugForSpotObj(spot: Spot | LocalSpot): string {
    if (spot instanceof Spot) {
      if (spot.slug) {
        return spot.slug;
      } else {
        return spot.id;
      }
    } else {
      return "";
    }
  }

  trackSpot(index: number, spot: SpotPreviewData | Spot | LocalSpot): string {
    if ("id" in spot && spot.id) {
      return spot.id;
    }
    return index.toString();
  }
}
