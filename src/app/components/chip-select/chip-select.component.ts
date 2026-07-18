import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  input,
  output,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatChipsModule } from "@angular/material/chips";
import { MatSelect, MatSelectModule } from "@angular/material/select";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-chip-select",
  imports: [
    MatChipsModule,
    MatSelectModule,
    MatIconModule,
    ReactiveFormsModule,
  ],
  templateUrl: "./chip-select.component.html",
  styleUrls: ["./chip-select.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChipSelectComponent {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  readonly icon = input("arrow_drop_down");
  readonly label = input("");
  readonly options = input<readonly string[]>([]);
  readonly optionNames = input<Record<string, string>>({});
  readonly optionIcons = input<Record<string, string>>({});
  readonly formCtrl = input.required<FormControl<string[]>>();
  readonly allLabel = input<string>();
  readonly multiple = input(true);
  readonly showSummary = input(true);
  readonly selected = input<readonly string[]>();

  readonly opened = output<void>();
  readonly selectedChange = output<string[]>();

  constructor() {
    effect((onCleanup) => {
      const formCtrl = this.formCtrl();
      const selected = this.selected();

      if (selected && formCtrl.value !== selected) {
        formCtrl.setValue([...selected], { emitEvent: false });
      }

      const subscription = formCtrl.valueChanges.subscribe((value) => {
        this.selectedChange.emit(value ?? []);
        this.changeDetectorRef.markForCheck();
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  openSelect(select: MatSelect): void {
    select.open();
    this.opened.emit();
  }
}
