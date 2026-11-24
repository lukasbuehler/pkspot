import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
} from "@angular/core";

interface NumberTransition {
  current: number;
  previous: number;
}

/**
 * Shows a number whose changed digits slide in. Each changed digit is a new
 * element that plays a CSS animation on insertion, and old digits leave at
 * once. A leave animation would keep the old digit in the DOM until it
 * finishes, and WebKit can pause animations while it redraws (for example
 * when an iPhone Duo folds), which left old digits next to the new ones.
 */
@Component({
  selector: "app-fancy-counter",
  templateUrl: "./fancy-counter.component.html",
  styleUrls: ["./fancy-counter.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[style.--digit-enter-offset]": "enterOffset()",
  },
})
export class FancyCounterComponent {
  readonly number = input(0);
  readonly decimals = input<number | null>(null); // when set, display number with fixed decimals
  private readonly numberTransition = linkedSignal<number, NumberTransition>({
    source: this.number,
    computation: (current, previous) => ({
      current,
      previous: previous?.value.current ?? 0,
    }),
  });
  readonly displayString = computed(() => {
    const current = this.numberTransition().current;
    const decimals = this.decimals();
    if (decimals === null || decimals === undefined) {
      return String(current);
    }
    return Number.isFinite(current) ? current.toFixed(decimals) : String(current);
  });
  readonly displayDigits = computed(() => this.displayString().split(""));
  /** New digits come from above when the number grows, from below when it shrinks. */
  readonly enterOffset = computed(() => {
    const { current, previous } = this.numberTransition();
    return current > previous ? "-1rem" : "1rem";
  });
}
