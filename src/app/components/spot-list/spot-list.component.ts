import {
  Component,
  EventEmitter,
  input,
  Input,
  OnChanges,
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

@Component({
  selector: "app-spot-list",
  animations: [
    trigger("gridElementAnimation", [
      transition(":enter", [
        style({ opacity: 0, height: "0px", transform: "translateY(-300px)" }),
        sequence([
          animate(
            "0.5s ease",
            style({ height: "*", width: "*", opacity: 1, transform: "none" })
          ),
        ]),
      ]),
      transition(":leave", [
        sequence([
          animate(
            "0.5s ease",
            style({ height: 0, width: 0, opacity: 0, transform: "scale(0.0)" })
          ),
        ]),
      ]),
    ]),
  ],
  imports: [
    SpotPreviewCardComponent,
    MatButtonToggleModule,
    MatIconModule,
    RouterLink,
  ],
  templateUrl: "./spot-list.component.html",
  styleUrl: "./spot-list.component.scss",
})
export class SpotListComponent implements OnChanges {
  @Input() highlightedSpots: SpotPreviewData[] = [];
  @Input() spots: (Spot | LocalSpot)[] = [];

  withHrefLink = input(true);

  text = input<string>($localize`Spots in this area`);

  @Output("spotClickIndex") spotClickIndexEvent = new EventEmitter<number>();

  // all spots minus the highlighted spots, set manually in ngOnChanges
  remainingSpots: (Spot | LocalSpot)[] = [];

  ngOnChanges() {
    this.filterOutHighlightedSpotsFromOtherSpots();
  }

  filterOutHighlightedSpotsFromOtherSpots() {
    this.remainingSpots = this.spots.filter((spot) => {
      const foundSpot: SpotPreviewData | undefined = this.highlightedSpots.find(
        (highlightedSpot) => {
          if (spot instanceof Spot && highlightedSpot.id) {
            return highlightedSpot.id === spot.id;
          }
          return false;
        }
      );
      // if the spot is found in the highlights array,
      // then we want to exclude it from the remaining spots
      // meaning we want to return true if a spot is not found for it be not filtered out
      return !foundSpot;
    });
  }

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
}
