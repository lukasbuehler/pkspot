import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import type { EventProgramOccurrence } from "../../shared/event-program-spots";
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
    readonly EventProgramOccurrence[]
  >();
  readonly timeZone = input<string>();
  readonly selectedItemId = input<string | null>(null);
  readonly showSpotCards = input(true);
  readonly occurrenceSelected = output<EventProgramOccurrence>();

  time(occurrence: EventProgramOccurrence): string {
    return this.dateTime.format(occurrence.start, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: this.timeZone(),
    });
  }

  select(occurrence: EventProgramOccurrence): void {
    this.occurrenceSelected.emit(occurrence);
  }
}
