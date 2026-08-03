import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import type { EventDiscoveryItem } from "../../services/search.service";
import type { SeriesDocument } from "../../services/firebase/firestore/series.service";
import { EventDiscoveryCardComponent } from "./event-discovery-card.component";

@Component({
  selector: "app-event-discovery-list",
  imports: [MatButtonModule, EventDiscoveryCardComponent],
  templateUrl: "./event-discovery-list.component.html",
  styleUrl: "./event-discovery-list.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDiscoveryListComponent {
  readonly events = input.required<readonly EventDiscoveryItem[]>();
  readonly found = input(0);
  readonly loading = input(false);
  readonly seriesById = input<Record<string, SeriesDocument>>({});
  readonly loadMore = output<void>();
}
