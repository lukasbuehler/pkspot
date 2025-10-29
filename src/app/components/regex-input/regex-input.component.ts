import { FocusMonitor } from "@angular/cdk/a11y";
import { coerceBooleanProperty } from "@angular/cdk/coercion";
import {
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
  Optional,
  Output,
  Self,
} from "@angular/core";
import {
  AbstractControl,
  ControlValueAccessor,
  UntypedFormBuilder,
  UntypedFormGroup,
  NgControl,
  ValidationErrors,
  Validator,
  ValidatorFn,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import {
  MatFormField,
  MatFormFieldControl,
} from "@angular/material/form-field";
import { Subject } from "rxjs";

interface ExpressionFlags {
  global?: boolean; // g
  caseInsensitive?: boolean; // i
  multiline?: boolean; // m
  singleLine?: boolean; // s
  unicode?: boolean; // u
  sticky?: boolean; // y
}

const expressionFlagsChars: Record<string, string> = {
  g: "global",
  i: "caseInsensitive",
  m: "multiline",
  s: "singleLine",
  u: "unicode",
  y: "sticky",
};

export interface MyRegex {
  regularExpression: string;
  expressionFlags: string;
}

export function regexValidator(): ValidatorFn {
  return (control: AbstractControl): { [key: string]: any } | null => {
    let isValid = true;
    let regexStr = control.value;

    try {
      let regex = new RegExp(regexStr);
    } catch (e) {
      isValid = false;
    }

    return !isValid ? { invalidRegex: { value: control.value } } : null;
  };
}

@Component({
  selector: "app-regex-input",
  templateUrl: "./regex-input.component.html",
  styleUrls: ["./regex-input.component.scss"],
  providers: [
    { provide: MatFormFieldControl, useExisting: RegexInputComponent },
  ],
  host: {
    "(change)": "_onChange($event.target.value)",
  },
  imports: [FormsModule, ReactiveFormsModule],
})
export class RegexInputComponent
  implements
    MatFormFieldControl<MyRegex>,
    ControlValueAccessor,
    Validator,
    OnDestroy
{
  // stateChanges
  stateChanges = new Subject<void>();

  // id
  static nextId = 0;
  @HostBinding() id = `regex-input-${RegexInputComponent.nextId++}`;

  // focused
  focused = false;

  // shouldLabelFloat
  @HostBinding("class.floating")
  get shouldLabelFloat() {
    return this.focused || !this.empty;
  }

  // errorState
  get errorState() {
    return this.parts.invalid && this.parts.dirty;
  }
  getErrorMessage() {
    const regexParts = this.parts.get("regularExpression");
    if (regexParts?.errors && regexParts.errors["invalidRegex"]) {
      return "The regular expression is invalid";
    }
    return "An unkown error occured";
  }

  // controlType
  controlType = "regex-input";

  parts: UntypedFormGroup;

  @Input() get value(): MyRegex | null {
    let parts: {
      regularExpression: string;
      expressionFlags: string;
    } = this.parts.value;
    if (parts.regularExpression) {
      let regex = parts.regularExpression;
      let flags = parts.expressionFlags;

      return { regularExpression: regex, expressionFlags: flags };
    }
    return null;
  }
  set value(regex: MyRegex | null) {
    if (regex) {
      this.parts.setValue({
        regularExpression: regex.regularExpression,
        expressionFlags: regex.expressionFlags,
      });
      this.valueChange.emit(regex);
      this.stateChanges.next();
    }
  }

  @Output() valueChange = new EventEmitter<MyRegex>();

  @Input() get flags(): string {
    if (!this.value) {
      console.error("value is null");
      return "";
    }

    return this.value.expressionFlags;
  }
  set flags(flags: ExpressionFlags) {
    //this.value.expressionFlags = flags;
    this.stateChanges.next();
  }

  @Input() get flagsString(): string {
    return this.parts.get("experssionFlags")?.value;
  }
  set flagsString(flagsString: string) {
    this.parts.get("expressionFlags")?.setValue(flagsString);
    this.stateChanges.next();
  }

  @Input() get placeholder() {
    return this._placeholder;
  }
  set placeholder(plh) {
    this._placeholder = plh;
    this.stateChanges.next();
  }
  private _placeholder: string = "";

  @Input() get required() {
    return this._required;
  }
  set required(req) {
    this._required = coerceBooleanProperty(req);
    this.stateChanges.next();
  }
  private _required = false;

  @Input() get disabled(): boolean {
    return this._disabled;
  }
  set disabled(value: boolean) {
    this._disabled = coerceBooleanProperty(value);
    if (this.disabledFlags) {
      this._disabled
        ? this.parts.disable()
        : this.parts.get("regularExpression")?.enable();
    } else {
      this._disabled ? this.parts.disable() : this.parts.enable();
    }
    this.stateChanges.next();
  }
  private _disabled = false;

  @Input() get disabledFlags() {
    return this._disabledFlags;
  }
  set disabledFlags(value: boolean) {
    this._disabledFlags = coerceBooleanProperty(value);
    this._disabledFlags
      ? this.parts.get("expressionFlags")?.disable()
      : this.parts.get("expressionFlags")?.enable();
    this.stateChanges.next();
  }
  private _disabledFlags = false;

  @Input("aria-describedby") userAriaDescribedBy: string = ""; // TODO
  setDescribedByIds(ids: string[]) {
    // const controlElement =
    //   this._elementRef.nativeElement.querySelector("regularExpression")!;
    // controlElement.setAttribute("aria-describedby", ids.join(" "));
  }

  get empty() {
    let parts: {
      regularExpression: string;
      expressionFlags: string;
    } = this.parts.value;
    return !parts.regularExpression;
  }

  onContainerClick(event: MouseEvent) {
    if ((event.target as Element).tagName.toLowerCase() != "input") {
      this._elementRef.nativeElement.querySelector("input")?.focus();
    }
  }

  constructor(
    fb: UntypedFormBuilder,
    @Optional() @Self() public ngControl: NgControl,
    private fm: FocusMonitor,
    private _elementRef: ElementRef<HTMLElement>,
    @Optional() public parentFormField: MatFormField
  ) {
    if (this.ngControl != null) {
      // Setting the value accessor directly (instead of using
      // the providers) to avoid running into a circular import.
      this.ngControl.valueAccessor = this;
    }

    this.parts = fb.group(
      {
        regularExpression: ["", [regexValidator()]],
        expressionFlags: ["gim", []],
      },
      { validators: [] }
    );

    // focused
    fm.monitor(_elementRef.nativeElement, true).subscribe((origin) => {
      this.focused = !!origin;
      this.stateChanges.next();
    });
  }
  validate(control: AbstractControl): ValidationErrors | null {
    return this.parts.errors;
  }
  registerOnValidatorChange?(fn: () => void): void {}
  writeValue(value: any): void {
    this.value = value;
  }
  registerOnChange(fn: (_: any) => void): void {
    this._onChange = fn;
  }
  private _onChange: (_: any) => void = () => {};

  registerOnTouched(fn: any): void {}
  setDisabledState?(isDisabled: boolean): void {}

  private _makeExpressionFlags(flagString: string): ExpressionFlags {
    let expressionFlags: ExpressionFlags = {};

    for (let char in expressionFlagsChars) {
      if (flagString?.includes(char)) {
        const flag: keyof ExpressionFlags = expressionFlagsChars[
          char
        ] as keyof ExpressionFlags;
        // set the matching expression flag to true
        expressionFlags[flag] = true;
      }
    }

    return expressionFlags;
  }

  ngOnDestroy(): void {
    this.stateChanges.complete();
    this.fm.stopMonitoring(this._elementRef.nativeElement);
  }
}
