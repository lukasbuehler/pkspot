import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from "@angular/core";
import { MatButton } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { Event as PkEvent } from "../../../db/models/Event";
import { MyEventListComponent } from "./my-event-list.component";
import {
  MY_EVENTS_DIALOG_CONFIG,
  MyEventsDialogComponent,
} from "./my-events-dialog.component";
import type { MyEventsTab } from "./my-events.types";

@Component({
  selector: "app-my-events-panel",
  imports: [
    MatButton,
    MatButtonToggleModule,
    MatIconModule,
    MyEventListComponent,
  ],
  templateUrl: "./my-events-panel.component.html",
  styleUrl: "./my-events-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyEventsPanelComponent {
  private readonly _dialog = inject(MatDialog);

  readonly goingEvents = input<readonly PkEvent[]>([]);
  readonly savedEvents = input<readonly PkEvent[]>([]);
  readonly now = input(new Date());
  readonly signedIn = input(false);
  private readonly _eventGroups = computed(() => {
    const now = this.now();
    const going: PkEvent[] = [];
    const saved: PkEvent[] = [];
    const past: PkEvent[] = [];
    const pastIds = new Set<string>();
    for (const event of this.goingEvents()) {
      if (event.isPast(now)) {
        past.push(event);
        pastIds.add(event.id);
      } else {
        going.push(event);
      }
    }
    for (const event of this.savedEvents()) {
      if (event.isPast(now)) {
        if (!pastIds.has(event.id)) past.push(event);
      } else {
        saved.push(event);
      }
    }
    return { going, saved, past };
  });
  readonly upcomingGoingEvents = computed(() => this._eventGroups().going);
  readonly upcomingSavedEvents = computed(() => this._eventGroups().saved);
  readonly pastEvents = computed(() => this._eventGroups().past);
  readonly selectedTab = linkedSignal<
    { going: number; saved: number; past: number },
    MyEventsTab
  >({
    source: () => ({
      going: this.upcomingGoingEvents().length,
      saved: this.upcomingSavedEvents().length,
      past: this.pastEvents().length,
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
  readonly selectedEvents = computed(
    () =>
      ({
        going: this.upcomingGoingEvents(),
        saved: this.upcomingSavedEvents(),
        past: this.pastEvents(),
      })[this.selectedTab()],
  );
  readonly previewEvents = computed(() => this.selectedEvents().slice(0, 3));
  readonly hasMoreEvents = computed(() => this.selectedEvents().length > 3);

  openAllEvents(): void {
    this._dialog.open(MyEventsDialogComponent, {
      ...MY_EVENTS_DIALOG_CONFIG,
      data: {
        goingEvents: this.upcomingGoingEvents(),
        savedEvents: this.upcomingSavedEvents(),
        pastEvents: this.pastEvents(),
        initialTab: this.selectedTab(),
      },
    });
  }
}
