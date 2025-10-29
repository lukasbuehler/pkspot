import {
  animate,
  keyframes,
  query,
  stagger,
  state,
  style,
  transition,
  trigger,
} from "@angular/animations";

export const speedDialFabAnimations = [
  trigger("mainFabButtonIconRotation", [
    state(
      "closed",
      style({
        transform: "rotate(0deg)",
      })
    ),
    state(
      "open",
      style({
        transform: "rotate({{degrees}}deg)",
      }),
      { params: { degrees: 225 } }
    ),

    transition("* <=> *", animate("200ms ease")),
  ]),
  trigger("speedDialStagger", [
    transition("* <=> *", [
      query(":enter", style({ opacity: 0 }), { optional: true }),
      query(
        ":enter",
        stagger("40ms", [
          animate(
            "200ms ease",
            keyframes([
              style({ opacity: 0, transform: "translateY(10px)" }),
              style({ opacity: 1, transform: "translateY(0)" }),
            ])
          ),
        ]),
        { optional: true }
      ),
      query(
        ":leave",
        animate(
          "200ms ease",
          keyframes([style({ opacity: 1 }), style({ opacity: 0 })])
        ),
        { optional: true }
      ),
    ]),
  ]),
];
