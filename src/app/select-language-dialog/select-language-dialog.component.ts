import { Component, inject, OnInit } from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { LocaleCode } from "../../db/models/Interfaces";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { languageCodes } from "../../scripts/Languages";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { map, Observable, startWith } from "rxjs";
import { AsyncPipe } from "@angular/common";

export interface SelectLanguageDialogData {
  locale: LocaleCode | null;
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
export class SelectLanguageDialogComponent implements OnInit {
  public data = inject<SelectLanguageDialogData>(MAT_DIALOG_DATA);
  public dialogRef =
    inject<MatDialogRef<SelectLanguageDialogComponent>>(MatDialogRef);

  languages = languageCodes;
  allLocaleCodes: LocaleCode[] = Object.keys(languageCodes) as LocaleCode[];
  myControl: FormControl = new FormControl();
  filteredOptions: Observable<LocaleCode[]> | null = null;

  ngOnInit() {
    this.myControl.setValue(this.data.locale);
    this.filteredOptions = this.myControl.valueChanges.pipe(
      startWith(""),
      map((value) => this._filter(value))
    );
  }

  private _filter(value: string): string[] {
    const filterValue = value.toLowerCase();

    return this.allLocaleCodes.filter((option: LocaleCode) =>
      this.getLanguageNameFromLocale(option).toLowerCase().includes(filterValue)
    );
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
}
