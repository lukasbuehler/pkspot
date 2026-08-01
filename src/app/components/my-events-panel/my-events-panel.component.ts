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

type MyEventsTab = "going" | "saved";

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
  readonly signedIn = input(false);
  readonly selectedTab = linkedSignal<
    { going: number; saved: number },
    MyEventsTab
  >({
    source: () => ({
      going: this.goingEvents().length,
      saved: this.savedEvents().length,
    }),
    computation: (source, previous) => {
      if (
        (previous?.value === "going" && source.going > 0) ||
        (previous?.value === "saved" && source.saved > 0)
      ) {
        return previous.value;
      }
      return source.going > 0 ? "going" : "saved";
    },
  });
  readonly rows = computed<MyEventRow[]>(() =>
    (this.selectedTab() === "going"
      ? this.goingEvents()
      : this.savedEvents()
    ).map((event) => ({
      event,
      logoBackgroundColor: event.effectiveBadgeLogoBackgroundColor(),
      logoFit: event.effectiveBadgeLogoFit(),
      logoSrc: eventImageDisplaySrc(event.effectiveBadgeLogoSrc()),
      route: ["/events", event.slug ?? event.id],
      schedule: eventScheduleLabel(event, this._dateTime, "short"),
    })),
  );
}
