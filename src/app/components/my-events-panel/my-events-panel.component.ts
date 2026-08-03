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
  readonly selectedEvents = computed(
    () =>
      ({
        going: this.goingEvents(),
        saved: this.upcomingSavedEvents(),
        past: this.pastSavedEvents(),
      })[this.selectedTab()],
  );
  readonly previewEvents = computed(() => this.selectedEvents().slice(0, 3));
  readonly hasMoreEvents = computed(() => this.selectedEvents().length > 3);

  openAllEvents(): void {
    this._dialog.open(MyEventsDialogComponent, {
      ...MY_EVENTS_DIALOG_CONFIG,
      data: {
        goingEvents: this.goingEvents(),
        savedEvents: this.upcomingSavedEvents(),
        pastEvents: this.pastSavedEvents(),
        initialTab: this.selectedTab(),
      },
    });
  }
}
