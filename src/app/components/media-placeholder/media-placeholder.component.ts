import { ChangeDetectionStrategy, Component, input } from "@angular/core";

export type MediaPlaceholderVariant = "spot" | "event";

@Component({
  selector: "app-media-placeholder",
  templateUrl: "./media-placeholder.component.html",
  styleUrls: ["./media-placeholder.component.scss"],
  host: {
    "[class.media-placeholder--event]": "variant() === 'event'",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaPlaceholderComponent {
  src = input<string | null>("assets/spot_placeholder.png");
  showLabel = input(true);
  variant = input<MediaPlaceholderVariant>("spot");
  /**
   * Optional override for the placeholder label. When set, replaces the
   * default "No media" text — used e.g. on event cards to show the event
   * name as the placeholder caption.
   */
  label = input<string | null>(null);
}
