import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from "@angular/core";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { Event as PkEvent } from "../../../db/models/Event";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  eventImageDisplaySrc,
  eventScheduleLabel,
} from "../event-display/event-display.helpers";

type MyEventsTab = "going" | "saved" | "past";

interface MyEventRow {
  event: PkEvent;
  logoBackgroundColor?: string;
  logoFit: "contain" | "cover";
  logoSrc?: string;
  route: readonly string[];
  schedule: string;
}

@Component({
  selector: "app-my-events-panel",
  imports: [MatButtonToggleModule, MatIconModule, RouterLink],
  templateUrl: "./my-events-panel.component.html",
  styleUrl: "./my-events-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyEventsPanelComponent {
  private readonly _dateTime = inject(DateTimeFormatService);

  readonly goingEvents = input<readonly PkEvent[]>([]);
  readonly savedEvents = input<readonly PkEvent[]>([]);
  readonly now = input(new Date());
  readonly signedIn = input(false);
  private readonly _savedEventGroups = computed(() => {
    const now = this.now();
    const upcoming: PkEvent[] = [];
    const past: PkEvent[] = [];
    for (const event of this.savedEvents()) {
      (event.isPast(now) ? past : upcoming).push(event);
    }
    return { upcoming, past };
  });
  readonly upcomingSavedEvents = computed(
    () => this._savedEventGroups().upcoming,
  );
  readonly pastSavedEvents = computed(() => this._savedEventGroups().past);
  readonly selectedTab = linkedSignal<
    { going: number; saved: number; past: number },
    MyEventsTab
  >({
    source: () => ({
      going: this.goingEvents().length,
      saved: this.upcomingSavedEvents().length,
      past: this.pastSavedEvents().length,
    }),
    computation: (source, previous) => {
      if (previous?.value && source[previous.value] > 0) {
        return previous.value;
      }
      if (source.going > 0) return "going";
      if (source.saved > 0) return "saved";
      return source.past > 0 ? "past" : "saved";
    },
  });
  readonly rows = computed<MyEventRow[]>(() => {
    const events = {
      going: this.goingEvents(),
      saved: this.upcomingSavedEvents(),
      past: this.pastSavedEvents(),
    }[this.selectedTab()];
    return events.map((event) => ({
      event,
      logoBackgroundColor: event.effectiveBadgeLogoBackgroundColor(),
      logoFit: event.effectiveBadgeLogoFit(),
      logoSrc: eventImageDisplaySrc(event.effectiveBadgeLogoSrc()),
      route: ["/events", event.slug ?? event.id],
      schedule: eventScheduleLabel(event, this._dateTime, "short"),
    }));
  });
}
