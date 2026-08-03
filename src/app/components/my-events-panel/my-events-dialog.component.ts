import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { MatIconButton } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import {
  MAT_DIALOG_DATA,
  MatDialogClose,
  type MatDialogConfig,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import { MyEventListComponent } from "./my-event-list.component";
import type { MyEventsDialogData, MyEventsTab } from "./my-events.types";

export const MY_EVENTS_DIALOG_CONFIG = {
  width: "760px",
  maxWidth: "calc(100vw - 24px)",
  maxHeight: "calc(100dvh - 24px)",
  autoFocus: "dialog",
  restoreFocus: true,
} satisfies MatDialogConfig<MyEventsDialogData>;

@Component({
  selector: "app-my-events-dialog",
  imports: [
    MatButtonToggleModule,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIcon,
    MatIconButton,
    MyEventListComponent,
  ],
  templateUrl: "./my-events-dialog.component.html",
  styleUrl: "./my-events-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyEventsDialogComponent {
  private readonly _dialogRef = inject(MatDialogRef<MyEventsDialogComponent>);
  readonly data = inject<MyEventsDialogData>(MAT_DIALOG_DATA);
  readonly selectedTab = signal<MyEventsTab>(this.data.initialTab);
  readonly selectedEvents = computed(
    () =>
      ({
        going: this.data.goingEvents,
        saved: this.data.savedEvents,
        past: this.data.pastEvents,
      })[this.selectedTab()],
  );

  closeAfterSelection(): void {
    this._dialogRef.close();
  }
}
