import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";

export type EventsDiscoveryView = "list" | "calendar";

@Component({
  selector: "app-event-discovery-view-toggle",
  imports: [MatButtonToggleModule, MatIconModule],
  templateUrl: "./event-discovery-view-toggle.component.html",
  styleUrl: "./event-discovery-view-toggle.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDiscoveryViewToggleComponent {
  readonly view = input.required<EventsDiscoveryView>();
  readonly viewChange = output<EventsDiscoveryView>();
}
