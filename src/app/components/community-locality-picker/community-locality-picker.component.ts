import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from "@angular/core";
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from "@angular/material/autocomplete";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import type { CommunityMergeLocalityOptionSchema } from "../../../db/schemas/CommunityMergeAdminSchema";

@Component({
  selector: "app-community-locality-picker",
  imports: [
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: "./community-locality-picker.component.html",
  styleUrl: "./community-locality-picker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityLocalityPickerComponent {
  readonly options = input<CommunityMergeLocalityOptionSchema[]>([]);
  readonly value = input("");
  readonly disabled = input(false);
  readonly valueChange = output<string>();
  readonly selectionChange =
    output<CommunityMergeLocalityOptionSchema | null>();

  readonly query = signal("");
  readonly selected = computed(
    () =>
      this.options().find((option) => option.communityKey === this.value()) ??
      null,
  );
  readonly filteredOptions = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    if (!query) {
      return this.options().slice(0, 30);
    }
    return this.options()
      .filter((option) =>
        [
          option.displayName,
          option.geography.regionName,
          option.geography.countryName,
        ]
          .filter((value): value is string => !!value)
          .some((value) => value.toLocaleLowerCase().includes(query)),
      )
      .slice(0, 30);
  });

  updateQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  selectOption(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as CommunityMergeLocalityOptionSchema;
    this.query.set("");
    this.valueChange.emit(option.communityKey);
    this.selectionChange.emit(option);
  }

  clear(): void {
    this.query.set("");
    this.valueChange.emit("");
    this.selectionChange.emit(null);
  }
}
