import {
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  model,
} from "@angular/core";
import { LocaleCode, LocaleMap } from "../../db/models/Interfaces";
import { languageCodes } from "../../scripts/Languages";
import { getBestLocale } from "../../scripts/LanguageHelpers";
import { MatDialog } from "@angular/material/dialog";
import { SelectLanguageDialogComponent } from "../select-language-dialog/select-language-dialog.component";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";

@Component({
  selector: "app-locale-map-view",
  imports: [MatIconModule, MatButtonModule],
  templateUrl: "./locale-map-view.component.html",
  styleUrl: "./locale-map-view.component.scss",
})
export class LocaleMapViewComponent {
  dialog = inject(MatDialog);

  localeMap = input<LocaleMap | undefined | null>(undefined);
  locale = model<string>(inject(LOCALE_ID));
  title = input<string>("Locale Map");
  availableLocales = computed(() => {
    const localeMap = this.localeMap();

    return Object.keys(localeMap ?? {});
  });
  numberOfLocales = computed(() => {
    const availableLocales = this.availableLocales();
    return availableLocales.length;
  });

  bestLocale = computed(() => {
    const availableLocales = this.availableLocales();
    const locale = this.locale();

    return getBestLocale(availableLocales, locale);
  });

  languages = languageCodes;

  text = computed(() => {
    const localeMap = this.localeMap() ?? {};
    const bestLocale = this.bestLocale();

    return localeMap[bestLocale]?.text ?? "";
  });

  changeLocale() {
    const currentLocale = this.bestLocale();
    const availbleLocales = this.availableLocales();

    const ref = this.dialog.open(SelectLanguageDialogComponent, {
      width: "400px",
      maxWidth: "95vw",
      data: {
        locale: currentLocale,
        availableLocales: availbleLocales,
      },
    });

    ref.afterClosed().subscribe((locale: LocaleCode) => {
      if (locale) {
        this.locale.set(locale);
      }
    });
  }
}
