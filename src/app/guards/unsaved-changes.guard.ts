import { CanDeactivateFn } from "@angular/router";
import type { HasUnsavedChanges } from "../components/discard-changes-dialog/discard-changes-dialog.component";

/** Asks the page whether it may be left, so unsaved edits are never lost silently. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (
  component,
) => component?.confirmLeave?.() ?? true;
