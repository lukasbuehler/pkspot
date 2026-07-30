import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import type { EventProgramSpotOccurrence } from "../../shared/event-program-spots";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";

@Component({
  selector: "app-event-program-occurrence-list",
  imports: [MatIconModule, SpotPreviewCardComponent],
  templateUrl: "./event-program-occurrence-list.component.html",
  styleUrl: "./event-program-occurrence-list.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventProgramOccurrenceListComponent {
  private readonly dateTime = inject(DateTimeFormatService);

  readonly occurrences = input.required<
    readonly EventProgramSpotOccurrence[]
  >();
  readonly timeZone = input<string>();
  readonly selectedItemId = input<string | null>(null);
  readonly showSpotCards = input(true);
  readonly occurrenceSelected = output<EventProgramSpotOccurrence>();

  time(occurrence: EventProgramSpotOccurrence): string {
    return this.dateTime.format(occurrence.start, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: this.timeZone(),
    });
  }

  select(occurrence: EventProgramSpotOccurrence): void {
    this.occurrenceSelected.emit(occurrence);
  }
}
