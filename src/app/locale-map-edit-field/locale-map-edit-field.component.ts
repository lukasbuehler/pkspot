import {
  Component,
  computed,
  inject,
  input,
  InputSignal,
  LOCALE_ID,
  model,
  ModelSignal,
  signal,
  Signal,
  WritableSignal,
} from "@angular/core";
import { MatFormFieldModule } from "@angular/material/form-field";
import { LocaleCode, LocaleMap } from "../../db/models/Interfaces";
import { getValueFromEventTarget } from "../../scripts/Helpers";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { trigger, transition, style, animate } from "@angular/animations";
import { languageCodes } from "../../scripts/Languages";
import { SelectLanguageDialogComponent } from "../select-language-dialog/select-language-dialog.component";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { getBestLocale } from "../../scripts/LanguageHelpers";

@Component({
  selector: "app-locale-map-edit-field",
  imports: [
    MatFormFieldModule,
    ReactiveFormsModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
  ],
  animations: [
    trigger("fadeInOut", [
      transition(":enter", [
        style({ opacity: 0, transform: "scale(0.8)", height: 0 }),
        animate(
          "0.3s ease-in-out",
          style({ opacity: 1, transform: "scale(1)", height: "*" })
        ),
      ]),
      transition(":leave", [
        style({ opacity: 1, transform: "scale(1)", height: "*" }),
        animate(
          "0.3s ease-in-out",
          style({ opacity: 0, transform: "scale(0.8)", height: 0 })
        ),
      ]),
    ]),
  ],
  templateUrl: "./locale-map-edit-field.component.html",
  styleUrl: "./locale-map-edit-field.component.scss",
})
export class LocaleMapEditFieldComponent {
  appLocale = inject<LocaleCode>(LOCALE_ID);
  dialog = inject(MatDialog);

  bestLocale = computed<LocaleCode>(() => {
    const appLocale = this.appLocale;
    const localeKeys = this.localeKeys();
    if (localeKeys.length === 0) {
      return appLocale;
    }
    return getBestLocale(localeKeys, appLocale);
  });

  localeMap: ModelSignal<LocaleMap | undefined | null> = model<
    LocaleMap | undefined | null
  >({});
  isTextArea: InputSignal<boolean> = input(false);
  placeholder: InputSignal<string> = input("");

  languages = languageCodes;

  localeKeys: Signal<LocaleCode[]> = computed(() => {
    const localeMap = this.localeMap();
    console.log("localeMap", localeMap);

    const localeKeys = Object.keys(localeMap ?? {}) as LocaleCode[];
    console.log("localeKeys", localeKeys);

    return localeKeys;
  });
  shownLocales: Signal<LocaleCode[]> = computed(() => {
    const isExpanded = this.isExpanded();
    const localeMap = this.localeMap() ?? {};
    const localeKeys = this.localeKeys();
    const bestLocale = this.bestLocale();

    console.log("localeKeys", localeKeys);

    if (localeKeys.length === 0) {
      return [];
    }
    if (!isExpanded) {
      return [bestLocale];
    } else {
      if (localeKeys.includes(this.appLocale)) {
        const keysWithoutAppLocale = Object.keys(localeMap).filter(
          (key) => key !== this.appLocale
        );
        return [this.appLocale, ...keysWithoutAppLocale];
      } else {
        return Object.keys(localeMap) as LocaleCode[];
      }
    }
  });

  isExpanded: WritableSignal<boolean> = signal(false);

  valueChanged(event: Event, locale: LocaleCode) {
    this.localeMap.update((val) => {
      const newText = getValueFromEventTarget(event.target);
      return {
        ...val,
        [locale as LocaleCode]: { text: newText, provider: "user" },
      } as LocaleMap;
    });
  }

  addTranslation() {
    // open a dialog with an autocomplete for the user to select a language
    const dialogRef = this.dialog.open(SelectLanguageDialogComponent, {
      data: {
        locale: null,
        mode: "add",
        availableLocales: this.localeKeys(),
        excludeLocales: this.localeKeys(),
      },
      hasBackdrop: true,
      maxWidth: "95vw",
      width: "400px",
      // maxHeight: "95vh",
      // panelClass: "dialog",
    });

    dialogRef.afterClosed().subscribe((locale: LocaleCode | null) => {
      console.log("Selected locale: ", locale);

      if (locale) {
        this.localeMap.update((val) => {
          const newVal = {
            ...(val ?? {}),
            [locale]: { text: "", provider: "user" },
          };
          console.log("newVal", newVal);
          return newVal;
        });
        // Expand only after we actually added a locale
        this.isExpanded.set(true);
      } else {
        console.error("No locale selected");
      }
    });
  }

  removeTranslation(locale: LocaleCode) {
    this.localeMap.update((val) => {
      const newVal = { ...val };
      delete newVal[locale];
      return newVal;
    });
  }
}
