import {ChangeDetectionStrategy, Component, inject, signal} from "@angular/core";
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from "@angular/material/dialog";
import {MatButtonModule} from "@angular/material/button";
import {SpotPickerComponent} from "../spot-picker/spot-picker.component";

export interface SharedPhotoTargetResult { spotId?: string; discard?: boolean; retry?: boolean; }

@Component({
  selector: "app-shared-photo-target-dialog",
  imports: [MatDialogModule, MatButtonModule, SpotPickerComponent],
  templateUrl: "./shared-photo-target-dialog.component.html",
  styleUrl: "./shared-photo-target-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedPhotoTargetDialogComponent {
  readonly data = inject<{failed?: boolean}>(MAT_DIALOG_DATA, {optional: true});
  readonly selected = signal<string[]>([]);
  readonly dialog = inject(MatDialogRef<SharedPhotoTargetDialogComponent, SharedPhotoTargetResult>);
}
