import { NgOptimizedImage } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import { MatIcon } from "@angular/material/icon";
import { MatMenu, MatMenuModule } from "@angular/material/menu";

@Component({
  selector: "app-mat3-nav-button",
  host: {
    tabindex: "-1",
  },
  templateUrl: "./mat3-nav-button.component.html",
  styleUrls: ["./mat3-nav-button.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatMenuModule, NgOptimizedImage],
})
export class Mat3NavButtonComponent {
  readonly icon = input("info");
  readonly label = input("label");
  readonly image = input("");
  readonly active = input(false);
  readonly liveIndicator = input(false);
  /** Unread items behind this destination, shown as a small count badge. */
  readonly badgeCount = input(0);
  readonly menu = input<MatMenu | null>(null);
  /**
   * Inside a navigation link the link is the one focusable element, so this
   * renders a plain span instead of a nested button.
   */
  readonly presentational = input(false);

  readonly isOutlineIcon = computed(() => this.icon().endsWith("_border"));
  readonly badgeText = computed(() => {
    const count = this.badgeCount();
    return count > 99 ? "99+" : String(count);
  });
  readonly accessibleLabel = computed(() =>
    navigationAccessibleLabel(this.label(), this.liveIndicator(), this.badgeCount()),
  );
}

/**
 * The spoken name of a navigation destination: its label, plus a live event
 * underway or the number of unread items when either applies.
 */
export function navigationAccessibleLabel(
  label: string,
  live: boolean,
  unreadCount: number,
): string {
  if (live) return `${label}, ${$localize`:@@navigation.live_event:live event underway`}`;
  if (unreadCount > 0) {
    return `${label}, ${$localize`:@@navigation.unread_count:${unreadCount}:count: unread`}`;
  }
  return label;
}
