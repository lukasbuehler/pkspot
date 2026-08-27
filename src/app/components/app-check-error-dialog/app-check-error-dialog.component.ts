import { DOCUMENT } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import {
  isKnownUiLocalePrefix,
  normalizeUiLocale,
} from "../../config/ui-locales";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
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
    MatDialogClose,
    MatIcon,
  ],
  templateUrl: "./app-check-error-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppCheckErrorDialogComponent {
  readonly data = inject<FirebaseAppCheckStatus>(MAT_DIALOG_DATA);
  private readonly document = inject(DOCUMENT);
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
      .find((part) => isKnownUiLocalePrefix(part));

    if (locale) {
      return normalizeUiLocale(locale);
    }

    try {
      const savedLanguage = this.document.defaultView?.localStorage.getItem("language");
      if (savedLanguage) {
        return normalizeUiLocale(savedLanguage);
      }
    } catch {
      // Ignore storage access failures and use the stable default locale.
    }

    return "en";
  }
}
