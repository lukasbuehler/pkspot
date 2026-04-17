import { inject, Injectable, LOCALE_ID } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { Capacitor } from "@capacitor/core";
import { LocaleCode } from "../../db/models/Interfaces";

const SUPPORTED_UI_LOCALES: LocaleCode[] = [
  "en",
  "de",
  "de-CH",
  "fr",
  "it",
  "es",
  "nl",
];

@Injectable({
  providedIn: "root",
})
export class UiLanguageService {
  private readonly _dialog = inject(MatDialog);
  private readonly _locale = inject(LOCALE_ID) as LocaleCode;

  readonly supportedUiLocales = SUPPORTED_UI_LOCALES;

  get currentUiLocale(): LocaleCode {
    if (typeof window === "undefined") {
      return this._normalizeLocale(this._locale);
    }

    const segmentLocale = window.location.pathname.split("/")[1];
    return this._normalizeLocale(segmentLocale || this._locale);
  }

  changeLanguage(): void {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const segments = url.pathname.split("/");
    const currentLocale = this.currentUiLocale;

    import("../components/select-language-dialog/select-language-dialog.component").then(
      ({ SelectLanguageDialogComponent }) => {
        const dialogRef = this._dialog.open(SelectLanguageDialogComponent, {
          data: {
            locale: currentLocale,
            supportedUiLocales: this.supportedUiLocales,
            mode: "ui",
          },
          width: "400px",
          maxWidth: "90vw",
        });

        dialogRef.afterClosed().subscribe((localeCode?: LocaleCode) => {
          if (!localeCode || localeCode === currentLocale) {
            return;
          }

          try {
            localStorage.setItem("language", localeCode);
          } catch (error) {
            console.error("Could not save language preference", error);
          }

          segments[1] = localeCode;
          url.pathname = segments.join("/");

          if (
            Capacitor.isNativePlatform() &&
            !url.pathname.endsWith("index.html")
          ) {
            const baseUrl = window.location.href.split(`/${currentLocale}/`)[0];
            window.location.href = `${baseUrl}/${localeCode}/index.html`;
            return;
          }

          window.location.href = url.toString();
        });
      }
    );
  }

  private _normalizeLocale(locale?: string | null): LocaleCode {
    if (!locale) {
      return "en";
    }

    if (this.supportedUiLocales.includes(locale as LocaleCode)) {
      return locale as LocaleCode;
    }

    return "en";
  }
}
