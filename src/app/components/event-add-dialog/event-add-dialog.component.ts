import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { Event as PkEvent } from "../../../db/models/Event";
import { AnalyticsService } from "../../services/analytics.service";
import {
  MyEventRelationship,
  MyEventsService,
} from "../../services/my-events.service";

export interface EventAddDialogData {
  event: PkEvent;
  returnUrl: string;
  source: "event_page" | "event_qr";
}

@Component({
  selector: "app-event-add-dialog",
  imports: [MatButtonModule, MatDialogModule, MatIconModule, RouterLink],
  templateUrl: "./event-add-dialog.component.html",
  styleUrl: "./event-add-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventAddDialogComponent {
  private readonly _dialogRef = inject(
    MatDialogRef<EventAddDialogComponent, MyEventRelationship>,
  );
  private readonly _myEvents = inject(MyEventsService);
  private readonly _analytics = inject(AnalyticsService);

  readonly data = inject<EventAddDialogData>(MAT_DIALOG_DATA);
  readonly saving = signal<MyEventRelationship>(null);
  readonly error = signal("");
  readonly signedIn = computed(() => !!this._myEvents.userId());
  readonly relationship = computed(() =>
    this._myEvents.relationshipFor(String(this.data.event.id)),
  );

  constructor() {
    this._analytics.trackEvent("event_add_dialog_shown", {
      event_id: this.data.event.id,
      event_slug: this.data.event.slug ?? null,
      source: this.data.source,
      signed_in: this.signedIn(),
    });
  }

  async choose(relationship: Exclude<MyEventRelationship, null>): Promise<void> {
    if (this.saving()) return;
    this.saving.set(relationship);
    this.error.set("");
    try {
      if (relationship === "going") {
        await this._myEvents.markGoing(
          String(this.data.event.id),
          this.data.event.notificationPolicy,
        );
      } else {
        await this._myEvents.saveEvent(
          String(this.data.event.id),
          this.data.event.notificationPolicy,
        );
      }
      this._analytics.trackEvent("event_added_to_my_events", {
        event_id: this.data.event.id,
        event_slug: this.data.event.slug ?? null,
        relationship,
        source: this.data.source,
        signed_in: this.signedIn(),
      });
      this._dialogRef.close(relationship);
    } catch (error) {
      console.error("Could not add event to My Events", error);
      this.error.set(
        $localize`:@@event_add.save_failed:Couldn't save this event. Try again in a moment.`,
      );
    } finally {
      this.saving.set(null);
    }
  }
}
