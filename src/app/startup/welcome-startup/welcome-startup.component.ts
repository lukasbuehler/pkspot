import {
  ApplicationRef, ChangeDetectionStrategy, Component, DestroyRef,
  afterNextRender, inject, signal,
} from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { WelcomeContentComponent } from "../../components/welcome-content/welcome-content.component";
import { WelcomeFrameComponent } from "../../components/welcome-frame/welcome-frame.component";
import { CURRENT_TERMS_VERSION } from "../../services/consent-version";
import { recordWelcomeAcceptance } from "../../services/whats-new";
import { loadApplication } from "../application-loader";

/** Owns only the first-visit agreement; the existing SSR app remains untouched. */
@Component({
  selector: "app-welcome-startup",
  imports: [WelcomeContentComponent, WelcomeFrameComponent],
  templateUrl: "./welcome-startup.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeStartupComponent {
  private readonly app = inject(ApplicationRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private accepting = false;
  private application: Promise<() => void> | undefined;
  readonly pending = signal(false);
  readonly failed = signal(false);

  private startApplication(): Promise<() => void> {
    return this.application ??= (async () => {
      let ready!: (accept: () => void) => void;
      const acceptance = new Promise<() => void>((resolve) => { ready = resolve; });
      const { bootstrap } = await loadApplication();
      await bootstrap({ ready });
      return acceptance;
    })();
  }

  constructor() {
    const root = this.document.documentElement;
    const page = this.document.querySelector("app-root");
    const overflow = root.style.overflow;
    // Like a modal MatDialog: block the page behind the agreement.
    page?.setAttribute("inert", "");
    root.style.overflow = "hidden";
    this.destroyRef.onDestroy(() => {
      page?.removeAttribute("inert");
      root.style.overflow = overflow;
      root.classList.remove("pk-early-welcome");
    });

    // Paint the agreement first, then hydrate behind it so pre-consent pageviews
    // retain their existing behavior. Protected data still waits for consent.
    afterNextRender(() => {
      // This copy has the same layout, so swapping keeps the server paint as LCP.
      this.document.querySelector("app-welcome-prerender")?.setAttribute("hidden", "");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!this.destroyRef.destroyed) void this.startApplication().catch(() => {});
      }));
    });
  }

  async continue(): Promise<void> {
    if (this.accepting) return;
    if (this.failed()) {
      location.reload();
      return;
    }
    this.accepting = true;
    this.pending.set(true);
    try {
      const grantConsent = await this.startApplication();
      recordWelcomeAcceptance(localStorage, CURRENT_TERMS_VERSION);
      grantConsent();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      this.app.destroy();
    } catch (error) {
      console.error("Application startup failed after welcome", error);
      this.failed.set(true);
      this.accepting = false;
      this.pending.set(false);
    }
  }
}
