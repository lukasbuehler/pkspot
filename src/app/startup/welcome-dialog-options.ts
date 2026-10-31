import type { MatDialogConfig } from "@angular/material/dialog";

/** Keep both entry points visually and accessibly identical. */
export const WELCOME_DIALOG_OPTIONS = {
  width: "680px",
  maxWidth: "min(680px, calc(100vw - 2rem))",
  maxHeight: "calc(100dvh - 2rem)",
  hasBackdrop: true,
  disableClose: true,
  autoFocus: "dialog",
  enterAnimationDuration: "0ms",
} satisfies MatDialogConfig;
