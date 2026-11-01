import {
  ApplicationRef, ChangeDetectionStrategy, Component, DestroyRef,
  afterNextRender, inject,
} from "@angular/core";
import { MatDialog, type MatDialogRef } from "@angular/material/dialog";
import { WelcomeContentComponent } from "../../components/welcome-content/welcome-content.component";
import { CURRENT_TERMS_VERSION } from "../../services/consent-version";
import { recordWelcomeAcceptance } from "../../services/whats-new";
import { loadApplication } from "../application-loader";
import { WELCOME_DIALOG_OPTIONS } from "../welcome-dialog-options";

/** Owns only the first-visit dialog; the existing SSR app remains untouched. */
@Component({
  selector: "app-welcome-startup",
  templateUrl: "./welcome-startup.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeStartupComponent {
  private readonly app = inject(ApplicationRef);
  private readonly destroyRef = inject(DestroyRef);
  private accepting = false;
  private failed = false;
  private application: Promise<() => void> | undefined;

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
    const dialog = inject(MatDialog).open(WelcomeContentComponent, {
      ...WELCOME_DIALOG_OPTIONS,
      exitAnimationDuration: "0ms",
    });
    const accepted = dialog.componentInstance.accepted.subscribe(() => {
      void this.continue(dialog);
    });
    this.destroyRef.onDestroy(() => accepted.unsubscribe());
    dialog.afterClosed().subscribe(() => this.app.destroy());

    // Paint the agreement first, then hydrate behind it so pre-consent pageviews
    // retain their existing behavior. Protected data still waits for consent.
    afterNextRender(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!this.destroyRef.destroyed) void this.startApplication().catch(() => {});
      }));
    });
  }

  private async continue(dialog: MatDialogRef<WelcomeContentComponent>): Promise<void> {
    if (this.accepting) return;
    if (this.failed) {
      location.reload();
      return;
    }
    this.accepting = true;
    dialog.componentRef?.setInput("pending", true);
    try {
      const grantConsent = await this.startApplication();
      recordWelcomeAcceptance(localStorage, CURRENT_TERMS_VERSION);
      grantConsent();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      dialog.close(true);
    } catch (error) {
      console.error("Application startup failed after welcome", error);
      this.failed = true;
      this.accepting = false;
      dialog.componentRef?.setInput("pending", false);
      dialog.componentRef?.setInput("failed", true);
    }
  }
}
