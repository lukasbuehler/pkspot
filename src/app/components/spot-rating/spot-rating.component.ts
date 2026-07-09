import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import { MatIcon } from "@angular/material/icon";

@Component({
  selector: "app-spot-rating",
  templateUrl: "./spot-rating.component.html",
  styleUrls: ["./spot-rating.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon],
})
export class SpotRatingComponent {
  readonly rating1to5 = input<number | null>(null); // floating point number between 1 and 5
  readonly showEmptyStars = input(true);
  readonly numReviews = input(0); // integer number of reviews
  readonly showNumReviews = input(false);
  readonly isCompact = input(false);
  readonly showRating = input(true);

  private readonly clampedRating = computed(() => {
    const rating = this.rating1to5();
    return rating ? Math.min(5, Math.max(1, rating)) : null;
  });

  private readonly roundedHalfStep = computed(() => {
    const rating = this.clampedRating();
    return rating ? Math.round(rating * 2) / 2 : 0;
  });

  readonly rating1to5rounded = computed(() =>
    this.clampedRating()?.toFixed(1) ?? null
  );
  readonly rating1to10rounded = computed(() => {
    const rating = this.clampedRating();
    return rating ? (rating * 2).toFixed(1) : null;
  });
  readonly numFullStars = computed(() => Math.floor(this.roundedHalfStep()));
  readonly showHalfStar = computed(() => this.roundedHalfStep() % 1 !== 0);
  readonly numEmptyStars = computed(
    () => 5 - this.numFullStars() - (this.showHalfStar() ? 1 : 0)
  );
  readonly fullStars = computed(() => this.range(this.numFullStars()));
  readonly emptyStars = computed(() => this.range(this.numEmptyStars()));

  private range(length: number): readonly number[] {
    return Array.from({ length }, (_, index) => index);
  }
}
