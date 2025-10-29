import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnInit,
  ViewChild,
  LOCALE_ID,
} from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { LocaleCode } from "../../../db/models/Interfaces";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { languageCodes } from "../../../scripts/Languages";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { map, Observable, startWith } from "rxjs";
import { AsyncPipe } from "@angular/common";

export interface SelectLanguageDialogData {
  locale: LocaleCode | null;
  /** If provided: languages that currently have content (description view). */
  availableLocales?: LocaleCode[];
  /** Supported UI/application languages (for UI picker). */
  supportedUiLocales?: LocaleCode[];
  /** Mode influences filtering & ordering logic.*/
  mode?: "view" | "add" | "ui";
  /** Existing locales that should be excluded (e.g., when adding a new translation). */
  excludeLocales?: LocaleCode[];
}

@Component({
  selector: "app-select-language-dialog",
  imports: [
    MatFormFieldModule,
    MatAutocompleteModule,
    MatInputModule,
    MatButtonModule,
    MatDialogModule,
    ReactiveFormsModule,
    AsyncPipe,
  ],
  templateUrl: "./select-language-dialog.component.html",
  styleUrl: "./select-language-dialog.component.scss",
})
export class SelectLanguageDialogComponent implements OnInit, AfterViewInit {
  /**
   * Dialog modes summary:
   * - view: show ONLY locales that have existing content (availableLocales). Order: current locale first, rest alphabetical.
   * - add: user adds a new translation. Exclude existing locales, prioritize: current locale, supported UI locales, others.
   * - ui: user changes interface language. Restrict strictly to supportedUiLocales. Order: current first, then alphabetical.
   */
  public data = inject<SelectLanguageDialogData>(MAT_DIALOG_DATA);
  public dialogRef =
    inject<MatDialogRef<SelectLanguageDialogComponent>>(MatDialogRef);
  @ViewChild("input") input: ElementRef<HTMLInputElement> | null = null;
  private appLocale = inject(LOCALE_ID) as LocaleCode;

  languages = languageCodes;
  allLocaleCodes: LocaleCode[] = Object.keys(this.languages) as LocaleCode[];
  // Fallback default supported UI locales
  private defaultSupported: LocaleCode[] = [
    "en",
    "de",
    "de-CH",
    "fr",
    "it",
    "es",
    "nl",
  ] as LocaleCode[];
  /** Computed base list BEFORE search filtering, depending on mode */
  private baseList(): LocaleCode[] {
    const mode = this.data.mode ?? "add";
    const available = (this.data.availableLocales ?? []) as LocaleCode[];
    const supported = (this.data.supportedUiLocales ??
      this.defaultSupported) as LocaleCode[];
    const exclude = new Set(this.data.excludeLocales ?? []);

    if (mode === "view") {
      // Only show locales that actually have content.
      return available;
    }
    if (mode === "ui") {
      // User choosing interface locale: restrict strictly to supported UI locales.
      return supported;
    }
    // mode === "add" (add new translation)
    // Show all locales not already present; prioritize supported first.
    const present = new Set(available);
    const remaining = this.allLocaleCodes.filter(
      (c) => !present.has(c) && !exclude.has(c)
    );
    return remaining;
  }
  /** Priority ordering groups depending on mode */
  private orderGroups(list: LocaleCode[]): LocaleCode[] {
    const mode = this.data.mode ?? "add";
    const supported = (this.data.supportedUiLocales ??
      this.defaultSupported) as LocaleCode[];
    const supportedSet = new Set(supported);
    const appLocale = this.appLocale;

    const byName = (a: LocaleCode, b: LocaleCode) => {
      const an =
        this.languages[a].name_native ?? this.languages[a].name_english;
      const bn =
        this.languages[b].name_native ?? this.languages[b].name_english;
      return an.localeCompare(bn);
    };

    if (mode === "view") {
      // Keep stable order: current locale first if present, rest alphabetically.
      const current = list.filter((c) => c === appLocale);
      const others = list.filter((c) => c !== appLocale).sort(byName);
      return [...current, ...others];
    }
    if (mode === "ui") {
      // Current app locale first, rest of supported locales alphabetically.
      const current = list.filter((c) => c === appLocale);
      const remaining = list.filter((c) => c !== appLocale).sort(byName);
      return [...current, ...remaining];
    }
    // add mode: current locale first, then supported (excluding current), then all others
    const current = list.filter((c) => c === appLocale);
    const preferred = list.filter(
      (c) => c !== appLocale && supportedSet.has(c)
    );
    const others = list.filter((c) => c !== appLocale && !supportedSet.has(c));
    preferred.sort(byName);
    others.sort(byName);
    return [...current, ...preferred, ...others];
  }

  myControl: FormControl = new FormControl();
  filteredOptions: Observable<LocaleCode[]> | null = null;

  ngOnInit() {
    this.myControl.setValue(this.data.locale);
    this.filteredOptions = this.myControl.valueChanges.pipe(
      startWith(""),
      map((value) => this._filter(value))
    );
  }
  ngAfterViewInit() {
    setTimeout(() => {
      if (this.input) {
        this.input.nativeElement.focus();
      }
    }, 100);
  }

  private _filter(value: string): string[] {
    const filterValue = (value ?? "").toString().toLowerCase();
    const baseSource = this.baseList();
    const narrowed = baseSource.filter((option: LocaleCode) => {
      const native = this.languages[option].name_native?.toLowerCase() ?? "";
      const english = this.languages[option].name_english.toLowerCase();
      return (
        option.toLowerCase().includes(filterValue) ||
        native.includes(filterValue) ||
        english.includes(filterValue)
      );
    });
    return this.orderGroups(narrowed);
  }

  getLanguageNameFromLocale(locale: LocaleCode): string {
    if (languageCodes[locale]) {
      return `${languageCodes[locale]?.emoji ?? ""} ${
        languageCodes[locale]?.name_native ?? ""
      }`;
    }
    return "";
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  close(): void {
    this.dialogRef.close(this.data.locale);
  }
}
