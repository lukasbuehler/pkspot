import { DOCUMENT } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import { FirebaseAppCheckStatus } from "../../services/firebase/app-check.service";

@Component({
  selector: "app-app-check-error-dialog",
  imports: [
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatIcon,
  ],
  template: `
    <h2 mat-dialog-title i18n="@@app_check_error.title">
      App verification failed
    </h2>
    <mat-dialog-content>
      <div class="d-flex gap-3 align-items-start">
        <mat-icon color="warn" class="flex-shrink-0">verified_user</mat-icon>
        <div>
          <p i18n="@@app_check_error.body">
            PK Spot could not verify this app installation. Data may not load
            until verification succeeds.
          </p>
          @if (isNativePlatform()) {
            <p i18n="@@app_check_error.native_hint">
              Install PK Spot from the official app store, or use pkspot.app in
              your browser.
            </p>
          } @else {
            <p i18n="@@app_check_error.web_hint">
              Reload the page, disable aggressive script blocking, or use the
              official app.
            </p>
          }
          @if (data.message) {
            <p class="mat-body-small opacity-75 mb-0">
              {{ data.message }}
            </p>
          }
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (isNativePlatform()) {
        <a mat-button [href]="webUrl()">
          <span i18n="@@app_check_error.open_web">Open website</span>
        </a>
      }
      <button mat-flat-button color="primary" (click)="reload()">
        <span i18n="@@app_check_error.reload">Reload</span>
      </button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppCheckErrorDialogComponent {
  readonly data = inject<FirebaseAppCheckStatus>(MAT_DIALOG_DATA);
  private readonly document = inject(DOCUMENT);
  private readonly supportedLocales = ["en", "de", "de-CH", "it", "fr", "es", "nl"];

  isNativePlatform(): boolean {
    return this.data.platform === "ios" || this.data.platform === "android";
  }

  reload(): void {
    const view = this.document.defaultView;
    if (!view) {
      return;
    }

    if (this.isNativePlatform()) {
      const locale = this.getNativeReloadLocale(view.location.pathname);
      view.location.replace(`/${locale}/index.html`);
      return;
    }

    view.location.reload();
  }

  webUrl(): string {
    return `/${this.getNativeReloadLocale(
      this.document.defaultView?.location.pathname ?? "",
    )}/`;
  }

  private getNativeReloadLocale(pathname: string): string {
    const locale = pathname
      .split("/")
      .find((part) => this.supportedLocales.includes(part));

    if (locale) {
      return locale;
    }

    try {
      const savedLanguage = this.document.defaultView?.localStorage.getItem("language");
      if (savedLanguage && this.supportedLocales.includes(savedLanguage)) {
        return savedLanguage;
      }
      const shortLanguage = savedLanguage?.split("-")[0];
      if (shortLanguage && this.supportedLocales.includes(shortLanguage)) {
        return shortLanguage;
      }
    } catch {
      // Ignore storage access failures and use the stable default locale.
    }

    return "en";
  }
}
