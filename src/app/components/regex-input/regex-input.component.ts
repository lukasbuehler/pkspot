import { FocusMonitor } from "@angular/cdk/a11y";
import { coerceBooleanProperty } from "@angular/cdk/coercion";
import {
  Component,
  ElementRef,
  OnDestroy,
  Optional,
  Self,
  ChangeDetectionStrategy,
  booleanAttribute,
  effect,
  input,
  output,
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
  return (control: AbstractControl): ValidationErrors | null => {
    let isValid = true;
    const regexStr = control.value;

    try {
      new RegExp(regexStr);
    } catch {
      isValid = false;
    }

    return !isValid ? { invalidRegex: { value: control.value } } : null;
  };
}

@Component({
  selector: "app-regex-input",
  host: {
    "[id]": "id",
    "[class.floating]": "shouldLabelFloat",
  },
  templateUrl: "./regex-input.component.html",
  styleUrls: ["./regex-input.component.scss"],
  providers: [
    { provide: MatFormFieldControl, useExisting: RegexInputComponent },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  id = `regex-input-${RegexInputComponent.nextId++}`;

  // focused
  focused = false;

  // shouldLabelFloat
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

  protected readonly valueInput = input<MyRegex | null | undefined>(undefined, {
    alias: "value",
  });
  protected readonly flagsInput = input<ExpressionFlags | undefined>(
    undefined,
    { alias: "flags" },
  );
  protected readonly flagsStringInput = input<string | undefined>(undefined, {
    alias: "flagsString",
  });
  protected readonly placeholderInput = input<string | undefined>(undefined, {
    alias: "placeholder",
  });
  protected readonly requiredInput = input(false, {
    alias: "required",
    transform: booleanAttribute,
  });
  protected readonly disabledInput = input(false, {
    alias: "disabled",
    transform: booleanAttribute,
  });
  protected readonly disabledFlagsInput = input(false, {
    alias: "disabledFlags",
    transform: booleanAttribute,
  });
  protected readonly ariaDescribedByInput = input("", {
    alias: "aria-describedby",
  });
  userAriaDescribedBy = "";

  get value(): MyRegex | null {
    const parts: {
      regularExpression: string;
      expressionFlags: string;
    } = this.parts.value;
    if (parts.regularExpression) {
      const regex = parts.regularExpression;
      const flags = parts.expressionFlags;

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

  readonly valueChange = output<MyRegex>();

  get flags(): string {
    if (!this.value) {
      console.error("value is null");
      return "";
    }

    return this.value.expressionFlags;
  }
  set flags(_flags: ExpressionFlags) {
    //this.value.expressionFlags = flags;
    this.stateChanges.next();
  }

  get flagsString(): string {
    return this.parts.get("expressionFlags")?.value;
  }
  set flagsString(flagsString: string) {
    this.parts.get("expressionFlags")?.setValue(flagsString);
    this.stateChanges.next();
  }

  get placeholder(): string {
    return this._placeholder;
  }
  set placeholder(plh: string) {
    this._placeholder = plh;
    this.stateChanges.next();
  }
  private _placeholder: string = "";

  get required(): boolean {
    return this._required;
  }
  set required(req: boolean) {
    this._required = coerceBooleanProperty(req);
    this.stateChanges.next();
  }
  private _required = false;

  get disabled(): boolean {
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

  get disabledFlags(): boolean {
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

  setDescribedByIds(ids: string[]) {
    // const controlElement =
    //   this._elementRef.nativeElement.querySelector("regularExpression")!;
    // controlElement.setAttribute("aria-describedby", ids.join(" "));
  }

  get empty() {
    const parts: {
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
    @Optional() public parentFormField: MatFormField | null
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

    effect(() => {
      const value = this.valueInput();
      if (value !== undefined) this.value = value;
    });
    effect(() => {
      const flags = this.flagsInput();
      if (flags !== undefined) this.flags = flags;
    });
    effect(() => {
      const flagsString = this.flagsStringInput();
      if (flagsString !== undefined) this.flagsString = flagsString;
    });
    effect(() => {
      const placeholder = this.placeholderInput();
      if (placeholder !== undefined) this.placeholder = placeholder;
    });
    effect(() => {
      this.required = this.requiredInput();
    });
    effect(() => {
      this.disabledFlags = this.disabledFlagsInput();
    });
    effect(() => {
      this.disabled = this.disabledInput();
    });
    effect(() => {
      this.userAriaDescribedBy = this.ariaDescribedByInput();
      this.stateChanges.next();
    });

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
  writeValue(value: MyRegex | null): void {
    this.value = value;
  }
  registerOnChange(fn: (value: MyRegex | null) => void): void {
    this._onChange = fn;
  }
  private _onChange: (value: MyRegex | null) => void = () => {};

  registerOnTouched(_fn: () => void): void {}
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  private _makeExpressionFlags(flagString: string): ExpressionFlags {
    const expressionFlags: ExpressionFlags = {};

    for (const char in expressionFlagsChars) {
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
