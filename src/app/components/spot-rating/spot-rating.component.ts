import { Component, Input, OnChanges } from "@angular/core";
import { MatIcon } from "@angular/material/icon";

@Component({
  selector: "app-spot-rating",
  templateUrl: "./spot-rating.component.html",
  styleUrls: ["./spot-rating.component.scss"],
  imports: [MatIcon],
})
export class SpotRatingComponent implements OnChanges {
  @Input() rating1to5: number | null = null; // floating point number between 1 and 5
  @Input() showEmptyStars: boolean = true;
  @Input() numReviews: number = 0; // integer number of reviews
  @Input() showNumReviews: boolean = false;
  @Input() isCompact: boolean = false;
  @Input() showRating: boolean = true;

  constructor() {}

  rating1to5rounded: string | null = null;
  rating1to10rounded: string | null = null;
  numFullStars: number = 0;
  showHalfStar: boolean = false;
  numEmptyStars: number = 0;

  ngOnChanges() {
    // clamp rating to 1-5
    if (this.rating1to5) {
      this.rating1to5 = Math.min(5, Math.max(1, this.rating1to5));
      this.rating1to5rounded = this.rating1to5.toFixed(1);
      this.rating1to10rounded = (this.rating1to5 * 2).toFixed(1);

      this.numFullStars = Math.floor(Math.round(this.rating1to5 * 2) / 2);
      this.showHalfStar = (Math.round(this.rating1to5 * 2) / 2) % 1 !== 0;
      this.numEmptyStars = 5 - this.numFullStars - (this.showHalfStar ? 1 : 0);
    }
  }
}
