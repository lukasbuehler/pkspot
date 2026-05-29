import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { Event as PkEvent } from "../../../db/models/Event";
import { LocaleCode } from "../../../db/models/Interfaces";
import { formatDateRange } from "../../../scripts/Helpers";
import {
  eventStatusLabel,
  eventVenueLine,
  type EventStatus,
} from "./event-display.helpers";

@Component({
  selector: "app-event-summary-meta",
  imports: [MatIconModule],
  templateUrl: "./event-summary-meta.component.html",
  styleUrl: "./event-summary-meta.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventSummaryMetaComponent {
  private readonly _locale = inject<LocaleCode>(LOCALE_ID);

  event = input.required<PkEvent>();
  dateStyle = input<"short" | "long">("long");
  showVenue = input(true);

  readonly status = computed<EventStatus>(() => this.event().status());
  readonly dateRange = computed(() =>
    formatDateRange(
      this.event().start,
      this.event().end,
      this._locale,
      this.dateStyle(),
    ),
  );
  readonly statusLabel = computed(() =>
    eventStatusLabel(this.event(), this.status(), this._locale),
  );
  readonly venueLine = computed(() => eventVenueLine(this.event()));
}
