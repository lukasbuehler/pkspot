import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { ReleaseHero } from "../../releases/release-notes";

/**
 * Animated release banner: the icons float up one after another, then the
 * centerpiece settles in the middle with a single shine. About two seconds,
 * after which the icons keep a slow drift. Static with reduced motion or
 * when `animated` is false (for example in a long list).
 */
@Component({
  selector: "app-release-hero",
  imports: [MatIconModule],
  templateUrl: "./release-hero.component.html",
  styleUrl: "./release-hero.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "aria-hidden": "true",
    "[class.is-static]": "!animated()",
  },
})
export class ReleaseHeroComponent {
  readonly hero = input.required<ReleaseHero>();
  readonly animated = input(true);

  /** The six floating slots are laid out in the stylesheet. */
  protected readonly icons = computed(() =>
    this.hero().icons.slice(0, 6).map((item) => ({ icon: item.icon, toneClass: `is-${item.tone ?? "primary"}` })),
  );
  protected readonly centerpieceToneClass = computed(() => `is-${this.hero().centerpiece.tone ?? "primary"}`);
}
