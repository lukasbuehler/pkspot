import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import type { EventProgramOccurrence } from "../../shared/event-program-spots";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";

interface EventProgramOccurrenceRow {
  occurrence: EventProgramOccurrence;
  date: string;
  time: string;
}

@Component({
  selector: "app-event-program-occurrence-list",
  imports: [MatIconModule, SpotPreviewCardComponent],
  templateUrl: "./event-program-occurrence-list.component.html",
  styleUrl: "./event-program-occurrence-list.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventProgramOccurrenceListComponent {
  private readonly dateTime = inject(DateTimeFormatService);

  readonly occurrences = input.required<readonly EventProgramOccurrence[]>();
  readonly timeZone = input<string>();
  readonly selectedItemId = input<string | null>(null);
  readonly showSpotCards = input(true);
  readonly occurrenceSelected = output<EventProgramOccurrence>();

  readonly rows = computed<EventProgramOccurrenceRow[]>(() => {
    const timeZone = this.timeZone();
    return this.occurrences().map((occurrence) => ({
      occurrence,
      date: this.dateTime.format(occurrence.start, {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone,
      }),
      time: this.dateTime.format(occurrence.start, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      }),
    }));
  });

  select(occurrence: EventProgramOccurrence): void {
    this.occurrenceSelected.emit(occurrence);
  }

  operationalStatusLabel(status: EventProgramOccurrence["status"]): string {
    if (status === "delayed") return $localize`Delayed`;
    if (status === "moved") return $localize`Moved`;
    return "";
  }
}
