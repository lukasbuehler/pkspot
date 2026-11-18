import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { ReleaseHero } from "../../releases/release-notes";

/**
 * Animated release banner: the icons float up one after another, then the
 * centerpiece settles in the middle with a single shine. About two seconds,
 * after which the icons keep a slow drift. The same banner appears on the
 * release card, the release page and the what's-new dialog.
 *
 * With `playWhenVisible`, the animation waits until the banner scrolls into
 * view, so a list of cards plays each one as it appears. Static with
 * reduced motion.
 */
@Component({
  selector: "app-release-hero",
  imports: [MatIconModule],
  templateUrl: "./release-hero.component.html",
  styleUrl: "./release-hero.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "aria-hidden": "true",
    "[class.is-waiting]": "playWhenVisible() && !visible()",
  },
})
export class ReleaseHeroComponent {
  readonly hero = input.required<ReleaseHero>();
  readonly playWhenVisible = input(false);

  protected readonly visible = signal(false);

  /** The six floating slots are laid out in the stylesheet. */
  protected readonly icons = computed(() =>
    this.hero().icons.slice(0, 6).map((item) => ({ icon: item.icon, toneClass: `is-${item.tone ?? "primary"}` })),
  );
  protected readonly centerpieceToneClass = computed(() => `is-${this.hero().centerpiece.tone ?? "primary"}`);

  constructor() {
    const element = inject(ElementRef<HTMLElement>).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (!this.playWhenVisible()) return;
      if (typeof IntersectionObserver === "undefined") {
        this.visible.set(true);
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.visible.set(true);
            observer.disconnect();
          }
        },
        { threshold: 0.4 },
      );
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
