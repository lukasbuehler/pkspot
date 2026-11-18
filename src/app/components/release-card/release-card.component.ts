import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { DatePipe } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { ReleaseView } from "../../releases/release-view";
import { ReleaseHeroComponent } from "../release-hero/release-hero.component";
import { ReleaseHighlightsComponent } from "../release-highlights/release-highlights.component";

/**
 * One release in the `/releases` list: the same banner as its release page,
 * its translated highlights and a link to the full notes. The banner plays
 * when the card scrolls into view.
 */
@Component({
  selector: "app-release-card",
  imports: [DatePipe, MatButtonModule, MatCardModule, MatIconModule, RouterLink, ReleaseHeroComponent, ReleaseHighlightsComponent],
  templateUrl: "./release-card.component.html",
  styleUrl: "./release-card.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseCardComponent {
  readonly view = input.required<ReleaseView>();
  readonly latest = input(false);
}
