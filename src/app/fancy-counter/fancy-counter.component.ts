import { animate, style, transition, trigger } from "@angular/animations";
import { Component, Input, OnInit } from "@angular/core";
import { NgFor } from "@angular/common";

@Component({
  selector: "app-fancy-counter",
  standalone: true,
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
  imports: [NgFor],
})
export class FancyCounterComponent implements OnInit {
  private _number: number = 0;
  previousNumber: number = 0;
  @Input() decimals: number | null = null; // when set, display number with fixed decimals

  @Input() set number(newNumber: number) {
    this.previousNumber = this._number;
    this._number = newNumber;
  }

  get number() {
    return this._number;
  }

  constructor() {}

  ngOnInit(): void {}

  get displayString(): string {
    if (this.decimals === null || this.decimals === undefined) {
      return "" + this._number;
    }
    if (Number.isFinite(this._number)) {
      return this._number.toFixed(this.decimals);
    }
    return "" + this._number;
  }

  getMinusIfIncrementing(newNumber: number, enterAnimation: boolean) {
    // We want to return a minus if we are incrementing
    let numberIsGreater: boolean = newNumber > this.previousNumber;

    let minus =
      !(numberIsGreater || enterAnimation) ||
      (numberIsGreater && enterAnimation)
        ? "-"
        : "";

    return minus;
  }
}
