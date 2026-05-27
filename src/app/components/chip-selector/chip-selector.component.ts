import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";

export interface ChipSelectorOption<TValue extends string = string> {
  value: TValue;
  label: string;
  icon?: string;
  disabled?: boolean;
}

@Component({
  selector: "app-chip-selector",
  imports: [MatChipsModule, MatIconModule],
  templateUrl: "./chip-selector.component.html",
  styleUrl: "./chip-selector.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChipSelectorComponent {
  options = input<readonly ChipSelectorOption[]>([]);
  selectedValue = input<string | null>(null);
  requireSelection = input(true);
  ariaLabel = input("Options");

  selectedValueChange = output<string | null>();

  onSelectionChange(value: string, selected: boolean): void {
    if (selected) {
      this.selectedValueChange.emit(value);
      return;
    }

    if (!this.requireSelection() && this.selectedValue() === value) {
      this.selectedValueChange.emit(null);
    }
  }
}
