import { Component, Input, Output, EventEmitter } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatChipsModule } from "@angular/material/chips";
import { MatSelectModule } from "@angular/material/select";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-chip-select",
  standalone: true,
  imports: [
    MatChipsModule,
    MatSelectModule,
    MatIconModule,
    ReactiveFormsModule,
  ],
  templateUrl: "./chip-select.component.html",
  styleUrls: ["./chip-select.component.scss"],
})
export class ChipSelectComponent {
  @Input() icon: string = "arrow_drop_down";
  @Input() label: string = "";
  @Input() options: string[] = [];
  @Input() optionNames: Record<string, string> = {};
  @Input() optionIcons?: Record<string, string>;
  @Input() formCtrl!: FormControl<string[]>;
  @Input() allLabel?: string;
  @Input() multiple: boolean = true;
  @Input() showSummary: boolean = true;
  @Input() trackBy: ((index: number, item: string) => any) | undefined;
  private _selected: string[] = [];
  @Input()
  get selected(): string[] {
    return this._selected;
  }
  set selected(val: string[]) {
    this._selected = val;
    if (this.formCtrl && val && this.formCtrl.value !== val) {
      this.formCtrl.setValue(val, { emitEvent: false });
    }
  }
  @Output() opened = new EventEmitter<void>();
  @Output() selectedChange = new EventEmitter<string[]>();

  get localizedLabel(): string {
    return this.label ? $localize`${this.label}` : "";
  }
  get localizedAllLabel(): string {
    return this.allLabel ? $localize`${this.allLabel}` : $localize`All`;
  }
  get otherLabel(): string {
    return $localize`other`;
  }
  get othersLabel(): string {
    return $localize`others`;
  }

  ngOnInit() {
    this.formCtrl.valueChanges.subscribe((value) => {
      this.selectedChange.emit(value ?? []);
    });
  }

  openSelect(select: any) {
    select.open();
    this.opened.emit();
  }
}
