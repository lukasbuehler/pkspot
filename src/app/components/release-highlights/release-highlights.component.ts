import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { ReleaseHighlight } from "../../releases/release-highlights";

/** A release's translated headline features, each with a tonal icon tile. */
@Component({
  selector: "app-release-highlights",
  imports: [MatIconModule],
  templateUrl: "./release-highlights.component.html",
  styleUrl: "./release-highlights.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseHighlightsComponent {
  readonly highlights = input.required<readonly ReleaseHighlight[]>();
}
