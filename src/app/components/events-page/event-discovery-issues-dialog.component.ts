import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from "@angular/material/dialog";
import type { SeriesDocument } from "../../services/firebase/firestore/series.service";
import type { EventSearchPreview } from "../../services/search.service";
import { EventDiscoveryCardComponent } from "./event-discovery-card.component";

export interface EventDiscoveryIssuesDialogData {
  events: readonly EventSearchPreview[];
  seriesById: Record<string, SeriesDocument>;
}

@Component({
  selector: "app-event-discovery-issues-dialog",
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    EventDiscoveryCardComponent,
  ],
  templateUrl: "./event-discovery-issues-dialog.component.html",
  styleUrl: "./event-discovery-issues-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDiscoveryIssuesDialogComponent {
  readonly data = inject<EventDiscoveryIssuesDialogData>(MAT_DIALOG_DATA);
}
