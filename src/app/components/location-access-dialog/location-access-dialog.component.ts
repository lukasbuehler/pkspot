import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { LocationAccessService } from "../../services/location-access.service";

@Component({
  selector: "app-location-access-dialog",
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIcon,
  ],
  templateUrl: "./location-access-dialog.component.html",
  styleUrl: "./location-access-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationAccessDialogComponent {
  private readonly locationAccess = inject(LocationAccessService);
  private readonly dialogRef = inject<MatDialogRef<LocationAccessDialogComponent, boolean>>(MatDialogRef);

  readonly enabling = signal(false);

  async enable(kind: "persistent" | "temporary"): Promise<void> {
    if (this.enabling()) return;
    this.enabling.set(true);
    try {
      if (kind === "persistent") await this.locationAccess.enablePersistent();
      else await this.locationAccess.enableTemporarily();
      this.dialogRef.close(true);
    } finally {
      this.enabling.set(false);
    }
  }
}
