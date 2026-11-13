import { CdkTrapFocus } from "@angular/cdk/a11y";
import {
  ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation,
  afterNextRender, inject, input, signal,
} from "@angular/core";

/**
 * A static stand-in for the MatDialog that hosts the first-visit welcome.
 *
 * The server renders it into every page, hidden unless the inline script in
 * `index.html` marks a first visit, so the agreement paints with the HTML.
 * The early welcome app renders the same frame to make it interactive. Both
 * copies share this layout, so the browser keeps the server paint as the
 * Largest Contentful Paint instead of waiting for JavaScript.
 *
 * The rules mirror Angular Material's dialog container and the options in
 * `WELCOME_DIALOG_OPTIONS`; keep them in step when either changes.
 */
@Component({
  selector: "app-welcome-frame",
  imports: [CdkTrapFocus],
  templateUrl: "./welcome-frame.component.html",
  styleUrl: "./welcome-frame.component.scss",
  // Material's dialog classes inside projected content must match these rules.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeFrameComponent {
  /** Only the interactive copy traps and takes focus. */
  readonly interactive = input(false);
  readonly labelledBy = signal<string | null>(null);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      this.labelledBy.set(host.querySelector(".mat-mdc-dialog-title")?.id || null);
      if (this.interactive()) host.querySelector<HTMLElement>(".mat-mdc-dialog-container")?.focus();
    });
  }
}
