import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatSlideToggleModule, type MatSlideToggleChange } from "@angular/material/slide-toggle";
import { MatSnackBar } from "@angular/material/snack-bar";
import { LocalLegendService } from "../../services/local-legend.service";
import { LocalLegendDataDialogComponent } from "../local-legend-data-dialog/local-legend-data-dialog.component";

@Component({
  selector: "app-local-legend-settings",
  imports: [MatButtonModule, MatSlideToggleModule],
  templateUrl: "./local-legend-settings.component.html",
  styleUrl: "./local-legend-settings.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalLegendSettingsComponent {
  readonly localLegend = inject(LocalLegendService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);

  manage(withdraw = false): void {
    this.dialog.open(LocalLegendDataDialogComponent, {
      role: "dialog", ariaModal: true,
      width: "560px", maxWidth: "calc(100vw - 32px)", data: {withdraw},
    });
  }

  async toggle(event: MatSlideToggleChange): Promise<void> {
    const enabled = event.checked;
    event.source.checked = this.localLegend.enabled();
    if (!enabled) {
      this.manage(true);
      return;
    }
    try {
      await this.localLegend.setEnabled(true);
    } catch {
      this.snackbar.open($localize`:@@localLegend.saveFailed:Couldn't save your choice. Please try again.`, undefined, {duration: 5_000});
    }
  }
}
