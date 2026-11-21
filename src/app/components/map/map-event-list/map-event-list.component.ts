import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { Event as PkEvent } from "../../../../db/models/Event";
import { SeriesDocument } from "../../../services/firebase/firestore/series.service";
import { EventDiscoveryCardComponent } from "../../events-page/event-discovery-card.component";
import { eventSearchPreviewFromEvent } from "../../events-page/event-search-preview-from-event";

@Component({
  selector: "app-map-event-list",
  imports: [EventDiscoveryCardComponent, MatIconModule],
  templateUrl: "./map-event-list.component.html",
  styleUrl: "./map-event-list.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapEventListComponent {
  events = input<readonly PkEvent[]>([]);
  seriesById = input<Record<string, SeriesDocument>>({});
  selectEvent = output<PkEvent>();

  /** The map holds Event models; the shared Events page card reads previews. */
  readonly previews = computed(() =>
    this.events().map((event) => eventSearchPreviewFromEvent(event)),
  );

  onSelect(event: PkEvent): void {
    this.selectEvent.emit(event);
  }
}
