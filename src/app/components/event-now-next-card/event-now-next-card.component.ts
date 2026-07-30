import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import type { Event as PkEvent } from "../../../db/models/Event";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  activeEventProgramItems,
  eventProgramMoment,
} from "../../shared/event-program-now";

@Component({
  selector: "app-event-now-next-card",
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: "./event-now-next-card.component.html",
  styleUrl: "./event-now-next-card.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventNowNextCardComponent {
  private readonly _dateTime = inject(DateTimeFormatService);

  readonly event = input.required<PkEvent>();
  readonly now = input(new Date());
  readonly showEventName = input(false);
  readonly itemSelected = output<string>();

  readonly moment = computed(() =>
    eventProgramMoment(activeEventProgramItems(this.event()), this.now()),
  );
  readonly current = computed(() => this.moment().current[0]);
  readonly next = computed(() => this.moment().next[0]);
  readonly focusItemId = computed(
    () => this.current()?.item.id ?? this.next()?.item.id ?? null,
  );
  readonly eventRoute = computed(() => [
    "/events",
    this.event().slug ?? this.event().id,
  ]);

  time(value: Date): string {
    return this._dateTime.format(value, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: this.event().timeZone,
    });
  }

  timeRange(start: Date, end?: Date): string {
    return end ? `${this.time(start)}–${this.time(end)}` : this.time(start);
  }
}
