import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import { LocalLegendService } from "../../services/local-legend.service";

/**
 * The invitation to join Local Legend. Joining is a real choice: "Not now"
 * records "off" so the invitation is not repeated, and closing the dialog
 * any other way leaves Local Legend off. It can be changed in Settings.
 */
@Component({
  selector: "app-local-legend-join-dialog",
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: "./local-legend-join-dialog.component.html",
  styleUrl: "./local-legend-join-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalLegendJoinDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<LocalLegendJoinDialogComponent>);
  private readonly snackbar = inject(MatSnackBar);
  readonly localLegend = inject(LocalLegendService);
  readonly choosing = signal<boolean | null>(null);

  static open(dialog: MatDialog): MatDialogRef<LocalLegendJoinDialogComponent, boolean> {
    return dialog.open(LocalLegendJoinDialogComponent, {
      width: "480px",
      maxWidth: "calc(100vw - 2rem)",
      maxHeight: "calc(100dvh - 2rem)",
      autoFocus: "dialog",
    });
  }

  async choose(enabled: boolean): Promise<void> {
    this.choosing.set(enabled);
    try {
      await this.localLegend.setEnabled(enabled);
      this.dialogRef.close(enabled);
    } catch {
      this.snackbar.open(
        $localize`:@@localLegend.saveFailed:Couldn't save your choice. Please try again.`,
        undefined,
        { duration: 5_000 },
      );
    } finally {
      this.choosing.set(null);
    }
  }
}
