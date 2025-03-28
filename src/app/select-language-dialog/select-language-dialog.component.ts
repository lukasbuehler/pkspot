import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnInit,
  ViewChild,
} from "@angular/core";
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
  availableLocales?: LocaleCode[];
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
  public data = inject<SelectLanguageDialogData>(MAT_DIALOG_DATA);
  public dialogRef =
    inject<MatDialogRef<SelectLanguageDialogComponent>>(MatDialogRef);
  @ViewChild("input") input: ElementRef<HTMLInputElement> | null = null;

  languages = languageCodes;
  allLocaleCodes: LocaleCode[] = Object.keys(this.languages) as LocaleCode[];
  availableLocaleCodes = this.data.availableLocales
    ? this.allLocaleCodes.filter((code) =>
        this.data.availableLocales!.includes(code)
      )
    : this.allLocaleCodes;

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
    if (this.input) {
      this.input.nativeElement.focus();
    }
  }

  private _filter(value: string): string[] {
    const filterValue = value.toLowerCase();

    return this.availableLocaleCodes.filter(
      (option: LocaleCode) =>
        option.toLowerCase().includes(filterValue) ||
        this.languages[option].name_native
          .toLowerCase()
          .includes(filterValue) ||
        this.languages[option].name_english.toLowerCase().includes(filterValue)
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

  close(): void {
    this.dialogRef.close(this.data.locale);
  }
}
