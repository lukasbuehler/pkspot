import { animate, style, transition, trigger } from "@angular/animations";
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
} from "@angular/core";

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
export class FancyCounterComponent implements OnChanges {
  private _number: number = 0;
  private _displayString = "0";

  previousNumber: number = 0;
  displayDigits: string[] = ["0"];

  @Input() decimals: number | null = null; // when set, display number with fixed decimals

  @Input() set number(newNumber: number) {
    this.previousNumber = this._number;
    this._number = newNumber;
    this.updateDisplayString();
  }

  get number() {
    return this._number;
  }

  ngOnChanges(): void {
    this.updateDisplayString();
  }

  get displayString(): string {
    return this._displayString;
  }

  private updateDisplayString(): void {
    if (this.decimals === null || this.decimals === undefined) {
      this._displayString = "" + this._number;
    } else if (Number.isFinite(this._number)) {
      this._displayString = this._number.toFixed(this.decimals);
    } else {
      this._displayString = "" + this._number;
    }

    this.displayDigits = this._displayString.split("");
  }

  getMinusIfIncrementing(newNumber: number, enterAnimation: boolean): string {
    // We want to return a minus if we are incrementing
    const numberIsGreater = newNumber > this.previousNumber;
    return (
      !(numberIsGreater || enterAnimation) ||
      (numberIsGreater && enterAnimation)
        ? "-"
        : ""
    );
  }
}
