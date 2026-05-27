import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { Event as PkEvent } from "../../../../db/models/Event";
import { EventPreviewComponent } from "../../event-preview/event-preview.component";

interface PendingEventPanel {
  idOrSlug: string;
}

@Component({
  selector: "app-map-event-preview-panel",
  imports: [EventPreviewComponent],
  templateUrl: "./map-event-preview-panel.component.html",
  styleUrl: "./map-event-preview-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapEventPreviewPanelComponent {
  event = input<PkEvent | null>(null);
  pendingEvent = input<PendingEventPanel | null>(null);
  openProgress = input(1);
  backLabel = input<string | null>(null);
  backTypeLabel = input<string | null>(null);

  back = output<void>();
  dismiss = output<void>();
}
