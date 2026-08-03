import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatIcon } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { Event as PkEvent } from "../../../db/models/Event";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  eventImageDisplaySrc,
  eventScheduleLabel,
} from "../event-display/event-display.helpers";
import type { MyEventsTab } from "./my-events.types";

interface MyEventRow {
  event: PkEvent;
  logoBackgroundColor?: string;
  logoFit: "contain" | "cover";
  logoSrc?: string;
  route: readonly string[];
  schedule: string;
}

@Component({
  selector: "app-my-event-list",
  imports: [MatIcon, RouterLink],
  templateUrl: "./my-event-list.component.html",
  styleUrl: "./my-event-list.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyEventListComponent {
  private readonly _dateTime = inject(DateTimeFormatService);

  readonly events = input<readonly PkEvent[]>([]);
  readonly emptyTab = input.required<MyEventsTab>();
  readonly singleColumn = input(false);
  readonly eventSelected = output<void>();

  readonly rows = computed<MyEventRow[]>(() =>
    this.events().map((event) => ({
      event,
      logoBackgroundColor: event.effectiveBadgeLogoBackgroundColor(),
      logoFit: event.effectiveBadgeLogoFit(),
      logoSrc: eventImageDisplaySrc(event.effectiveBadgeLogoSrc()),
      route: ["/events", event.slug ?? event.id],
      schedule: eventScheduleLabel(event, this._dateTime, "short"),
    })),
  );
}
