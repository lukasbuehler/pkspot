import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import type { CommunitySearchPreview } from "../../services/search.service";
import type { SearchSelection } from "../search-field/search-field.component";
import { SearchFieldComponent } from "../search-field/search-field.component";

export interface TrainContextDialogData {
  area: CommunitySearchPreview | null;
  weather: {
    icon: string;
    summary: string;
    temperature: string | null;
  } | null;
}

export type TrainContextDialogAction =
  | { kind: "use-location" }
  | { kind: "choose-area"; area: CommunitySearchPreview }
  | { kind: "clear-area" }
  | { kind: "show-weather" };

@Component({
  selector: "app-train-context-dialog",
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIconModule,
    SearchFieldComponent,
  ],
  templateUrl: "./train-context-dialog.component.html",
  styleUrl: "./train-context-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainContextDialogComponent {
  readonly data = inject<TrainContextDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<
    MatDialogRef<TrainContextDialogComponent, TrainContextDialogAction>
  >(MatDialogRef);

  selectArea(selection: SearchSelection): void {
    if (!selection.community) return;
    this.dialogRef.close({ kind: "choose-area", area: selection.community });
  }

  clearArea(): void {
    this.dialogRef.close({ kind: "clear-area" });
  }

  useLocation(): void {
    this.dialogRef.close({ kind: "use-location" });
  }

  showWeather(): void {
    this.dialogRef.close({ kind: "show-weather" });
  }
}
