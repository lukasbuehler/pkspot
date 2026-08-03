import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { SpotWarningInput } from "../../services/firebase/firestore/moderation-reports.service";

interface SpotWarningDialogData {
  reason: string;
}

@Component({
  selector: "app-spot-warning-dialog",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: "./spot-warning-dialog.component.html",
  styleUrl: "./spot-warning-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotWarningDialogComponent {
  private readonly _dialogRef =
    inject<MatDialogRef<SpotWarningDialogComponent>>(MatDialogRef);
  private readonly _data = inject<SpotWarningDialogData>(MAT_DIALOG_DATA);

  readonly type = new FormControl<SpotWarningInput["type"]>(
    this._defaultType(this._data.reason),
    { nonNullable: true, validators: Validators.required },
  );
  readonly message = new FormControl(this._data.reason, {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(240)],
  });

  publish(): void {
    if (this.type.invalid || this.message.invalid) {
      this.type.markAsTouched();
      this.message.markAsTouched();
      return;
    }

    this._dialogRef.close({
      type: this.type.value,
      message: this.message.value.trim(),
    } satisfies SpotWarningInput);
  }

  private _defaultType(reason: string): SpotWarningInput["type"] {
    const normalized = reason.toLowerCase();
    if (normalized.includes("torn") || normalized.includes("destroy")) {
      return "destroyed";
    }
    if (normalized.includes("private") || normalized.includes("access")) {
      return "access_concern";
    }
    if (normalized.includes("closed")) {
      return "temporarily_closed";
    }
    if (normalized.includes("exist") || normalized.includes("inaccessible")) {
      return "inaccessible";
    }
    return "other";
  }
}
