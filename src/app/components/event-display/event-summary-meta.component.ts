import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Event as PkEvent } from "../../../db/models/Event";
import { LocaleCode } from "../../../db/models/Interfaces";
import {
  eventStatusLabel,
  eventScheduleLabel,
  eventVenueLine,
  type EventStatus,
} from "./event-display.helpers";
import { DateTimeFormatService } from "../../services/date-time-format.service";

@Component({
  selector: "app-event-summary-meta",
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: "./event-summary-meta.component.html",
  styleUrl: "./event-summary-meta.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventSummaryMetaComponent {
  private readonly _locale = inject<LocaleCode>(LOCALE_ID);
  private readonly _dateTime = inject(DateTimeFormatService);

  event = input.required<PkEvent>();
  dateStyle = input<"short" | "long">("long");
  showVenue = input(true);
  /** Shows a directions button beside the venue; the host opens the maps app. */
  showDirections = input(false);
  readonly directionsRequested = output<void>();
  readonly directionsLabel = $localize`:@@event.venue.directions:Directions to the venue`;

  readonly status = computed<EventStatus>(() => this.event().status());
  readonly dateRange = computed(() =>
    eventScheduleLabel(this.event(), this._dateTime, this.dateStyle()),
  );
  readonly statusLabel = computed(() =>
    eventStatusLabel(this.event(), this.status(), this._locale),
  );
  readonly venueLine = computed(() => eventVenueLine(this.event()));
  readonly attendanceRestriction = computed<
    "organization_members" | "invited" | null
  >(() => {
    const type = this.event().attendance.eligibility?.type;
    return type === "organization_members" || type === "invited" ? type : null;
  });
}
