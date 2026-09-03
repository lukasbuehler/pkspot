import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import {
  RECOVERY_PAUSE_REASONS,
  type RecoveryPauseDocument,
  type RecoveryPauseReason,
} from "../../../db/schemas/RecoveryPauseSchema";
import {
  RECOVERY_PAUSE_NOTE_MAX_LENGTH,
  RecoveryPausesService,
  localDateKey,
} from "../../services/firebase/firestore/recovery-pauses.service";

export interface RecoveryPauseDialogData {
  pause?: RecoveryPauseDocument;
}

export interface RecoveryPauseDialogResult {
  changed: true;
}

@Component({
  selector: "app-recovery-pause-dialog",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: "./recovery-pause-dialog.component.html",
  styleUrl: "./recovery-pause-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecoveryPauseDialogComponent {
  readonly data = inject<RecoveryPauseDialogData>(MAT_DIALOG_DATA);
  private readonly pauses = inject(RecoveryPausesService);
  private readonly dialogRef = inject<
    MatDialogRef<RecoveryPauseDialogComponent, RecoveryPauseDialogResult>
  >(MatDialogRef);

  readonly saving = signal(false);
  readonly error = signal("");
  readonly today = localDateKey(new Date());
  readonly isEditing = !!this.data.pause;
  readonly noteMaxLength = RECOVERY_PAUSE_NOTE_MAX_LENGTH;
  readonly reasons = RECOVERY_PAUSE_REASONS;
  readonly form = new FormGroup({
    startedOn: new FormControl(this.data.pause?.started_on ?? this.today, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    endedOn: new FormControl(this.data.pause?.ended_on ?? "", {
      nonNullable: true,
    }),
    reason: new FormControl<RecoveryPauseReason>(
      this.data.pause?.reason ?? "injury",
      { nonNullable: true, validators: [Validators.required] },
    ),
    note: new FormControl(this.data.pause?.note ?? "", {
      nonNullable: true,
      validators: [Validators.maxLength(RECOVERY_PAUSE_NOTE_MAX_LENGTH)],
    }),
  });
  readonly noteLength = computed(() => this.form.controls.note.value.length);

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set("");
    try {
      const input = {
        startedOn: this.form.controls.startedOn.value,
        ...(this.form.controls.endedOn.value
          ? { endedOn: this.form.controls.endedOn.value }
          : {}),
        reason: this.form.controls.reason.value,
        ...(this.form.controls.note.value.trim()
          ? { note: this.form.controls.note.value }
          : {}),
      };
      if (this.data.pause) await this.pauses.update(this.data.pause.id, input);
      else await this.pauses.create(input);
      this.dialogRef.close({ changed: true });
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : $localize`:@@recoveryPause.saveError:Could not save this recovery pause.`,
      );
    } finally {
      this.saving.set(false);
    }
  }

  async delete(): Promise<void> {
    if (!this.data.pause || this.saving()) return;
    if (!confirm($localize`:@@recoveryPause.deleteConfirm:Delete this recovery pause?`)) return;
    this.saving.set(true);
    this.error.set("");
    try {
      await this.pauses.delete(this.data.pause.id);
      this.dialogRef.close({ changed: true });
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : $localize`:@@recoveryPause.deleteError:Could not delete this recovery pause.`,
      );
    } finally {
      this.saving.set(false);
    }
  }

  reasonLabel(reason: RecoveryPauseReason): string {
    switch (reason) {
      case "illness":
        return $localize`:@@recoveryPause.reason.illness:Illness`;
      case "personal_break":
        return $localize`:@@recoveryPause.reason.personalBreak:Personal break`;
      case "other":
        return $localize`:@@recoveryPause.reason.other:Other`;
      default:
        return $localize`:@@recoveryPause.reason.injury:Injury`;
    }
  }
}
