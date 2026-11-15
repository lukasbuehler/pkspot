import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { firstValueFrom } from "rxjs";

/**
 * Asks before unsaved edits are thrown away. Closes with `true` to discard
 * and leave, or `false`/undefined to stay and keep editing.
 */
@Component({
  selector: "app-discard-changes-dialog",
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: "./discard-changes-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscardChangesDialogComponent {}

/** Opens the dialog and resolves to whether the edits may be discarded. */
export async function confirmDiscardChanges(dialog: MatDialog): Promise<boolean> {
  const ref = dialog.open<DiscardChangesDialogComponent, void, boolean>(
    DiscardChangesDialogComponent,
    { autoFocus: "dialog", restoreFocus: true },
  );
  return (await firstValueFrom(ref.afterClosed())) === true;
}

/** Implemented by pages that guard unsaved edits with `unsavedChangesGuard`. */
export interface HasUnsavedChanges {
  /** Resolves `true` when leaving is fine (no edits, or the person discarded them). */
  confirmLeave(): Promise<boolean> | boolean;
}
