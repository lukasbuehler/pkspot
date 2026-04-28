import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { NgOptimizedImage } from "@angular/common";

@Component({
  selector: "app-media-placeholder",
  templateUrl: "./media-placeholder.component.html",
  styleUrls: ["./media-placeholder.component.scss"],
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaPlaceholderComponent {
  src = input("assets/spot_placeholder.png");
  showLabel = input(true);
  /**
   * Optional override for the placeholder label. When set, replaces the
   * default "No media" text — used e.g. on event cards to show the event
   * name as the placeholder caption.
   */
  label = input<string | null>(null);
}
