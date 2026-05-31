import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { Event as PkEvent } from "../../../../db/models/Event";
import { SeriesDocument } from "../../../services/firebase/firestore/series.service";
import { EventCardComponent } from "../../event-card/event-card.component";

@Component({
  selector: "app-map-event-list",
  imports: [EventCardComponent, MatIconModule],
  templateUrl: "./map-event-list.component.html",
  styleUrl: "./map-event-list.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapEventListComponent {
  events = input<readonly PkEvent[]>([]);
  seriesById = input<Record<string, SeriesDocument>>({});
  selectEvent = output<PkEvent>();

  onSelect(event: PkEvent): void {
    this.selectEvent.emit(event);
  }
}
