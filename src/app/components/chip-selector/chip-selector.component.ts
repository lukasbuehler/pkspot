import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from "@angular/core";
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
  fallbackValue = input<string | null>(null);
  ariaLabel = input("Options");

  selectedValueChange = output<string | null>();
  private readonly _renderedSelectedValue = signal<string | null>(null);
  readonly renderedSelectedValue = this._renderedSelectedValue.asReadonly();

  constructor() {
    effect(() => {
      this._renderedSelectedValue.set(this.selectedValue());
    });
  }

  onListboxChange(value: string | null | undefined): void {
    if (value) {
      this._renderedSelectedValue.set(value);
      this.selectedValueChange.emit(value);
      return;
    }

    if (!this.requireSelection()) {
      this._renderedSelectedValue.set(null);
      this.selectedValueChange.emit(null);
      return;
    }

    const fallback =
      this.fallbackValue() ??
      this.selectedValue() ??
      this.options()[0]?.value ??
      null;

    this._renderedSelectedValue.set(null);
    queueMicrotask(() => this._renderedSelectedValue.set(fallback));
    this.selectedValueChange.emit(fallback);
  }
}
