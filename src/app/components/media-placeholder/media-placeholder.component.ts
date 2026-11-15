import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

export type MediaPlaceholderVariant = "spot" | "event";

@Component({
  selector: "app-media-placeholder",
  templateUrl: "./media-placeholder.component.html",
  styleUrls: ["./media-placeholder.component.scss"],
  imports: [MatIconModule],
  host: {
    "[class.media-placeholder--event]": "variant() === 'event'",
    "[class.media-placeholder--dated]": "!!dateDay()",
    "[class.media-placeholder--tertiary]": "tone() === 'tertiary'",
    "[class.media-placeholder--compact]": "compact()",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaPlaceholderComponent {
  /**
   * Optional image behind the placeholder. Without one, the spot variant shows
   * a designed missing-photo tile.
   */
  src = input<string | null>(null);
  showLabel = input(true);
  /**
   * Loading layer behind an image that is still on its way: show only the
   * neutral texture, not the missing-photo prompt.
   */
  loading = input(false);
  variant = input<MediaPlaceholderVariant>("spot");
  /**
   * Optional override for the placeholder label. When set, replaces the
   * default "No media" text — used e.g. on event cards to show the event
   * name as the placeholder caption.
   */
  label = input<string | null>(null);
  /**
   * Event cover fallback: a calendar-style date block and the event type icon
   * replace the label, so a card never shows its title twice.
   */
  dateDay = input<string | null>(null);
  dateMonth = input<string | null>(null);
  icon = input<string | null>(null);
  /**
   * Short strip for cards where a missing photo should not take a full image
   * slot: the prompt sits on one line and the event watermark shrinks.
   */
  compact = input(false);
  /** Colour family of the event cover gradient. */
  tone = input<"primary" | "tertiary">("primary");
}
