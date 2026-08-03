import { animate, style, transition, trigger } from "@angular/animations";
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

@Component({
  selector: "app-fancy-counter",
  templateUrl: "./fancy-counter.component.html",
  styleUrls: ["./fancy-counter.component.scss"],
  animations: [
    trigger("digitChange", [
      transition(
        ":enter",
        [
          style({
            opacity: 0,
            transform: "translateY({{incrementMinus}}1rem)",
          }),
          animate("200ms ease", style({ opacity: 1, transform: "none" })),
        ],
        { params: { incrementMinus: "-" } }
      ),
      transition(
        ":leave",
        [
          style({ position: "absolute" }),
          animate(
            "50ms ease",
            style({
              opacity: 0,
              //transform: "scale(0)",
              //transform: "translateY({{decrementMinus}}1rem)",
            })
          ),
        ],
        { params: { decrementMinus: "" } }
      ),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
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

  getMinusIfIncrementing(enterAnimation: boolean): string {
    const transition = this.numberTransition();
    // We want to return a minus if we are incrementing
    const numberIsGreater = transition.current > transition.previous;
    return (
      !(numberIsGreater || enterAnimation) ||
      (numberIsGreater && enterAnimation)
        ? "-"
        : ""
    );
  }
}
