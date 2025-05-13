import { Component, input, Signal } from "@angular/core";
import { SpotChallenge } from "../../db/models/SpotChallenge";
import { NgOptimizedImage } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ChallengePreviewSchema } from "../../db/schemas/SpotChallengeSchema";
import { Spot } from "../../db/models/Spot";
import { AnyMedia } from "../../db/models/Media";
import { SpotId } from "../../db/schemas/SpotSchema";

@Component({
  selector: "app-challenge-list",
  imports: [NgOptimizedImage, RouterLink],
  templateUrl: "./challenge-list.component.html",
  styleUrl: "./challenge-list.component.scss",
})
export class ChallengeListComponent {
  spot = input<Spot | null>(null);
  challenges = input<
    | SpotChallenge[]
    | {
        name: Signal<string>;
        id: string;
        media: Signal<AnyMedia>;
        location?: google.maps.LatLngLiteral;
        spot?: {
          slug: string;
          id: string;
        };
      }[]
  >([]);
}
