import { DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import {
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import { RouterLink } from "@angular/router";
import { from, switchMap } from "rxjs";
import type { Event as PkEvent } from "../../../db/models/Event";
import type { EventId } from "../../../db/schemas/EventSchema";
import type { EventNotificationLevel } from "../../../db/schemas/EventLiveUpdateSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import {
  EventLiveUpdatesService,
  type EventNotificationSubscription,
} from "../../services/firebase/firestore/event-live-updates.service";

interface EventSubscriptionRow {
  event: PkEvent;
  level: Exclude<EventNotificationLevel, "none">;
}

@Component({
  selector: "app-event-notification-subscriptions-dialog",
  imports: [
    DatePipe,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    RouterLink,
  ],
  templateUrl: "./event-notification-subscriptions-dialog.component.html",
  styleUrl: "./event-notification-subscriptions-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventNotificationSubscriptionsDialogComponent {
  private readonly liveUpdates = inject(EventLiveUpdatesService);
  private readonly events = inject(EventsService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject(
    MatDialogRef<EventNotificationSubscriptionsDialogComponent>,
  );

  readonly rows = signal<EventSubscriptionRow[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly savingEventIds = signal<ReadonlySet<string>>(new Set());

  constructor() {
    this.liveUpdates
      .observeCurrentUserSubscriptions()
      .pipe(
        switchMap((subscriptions) =>
          from(this._resolveEvents(subscriptions)),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
          this.failed.set(false);
        },
        error: (error) => {
          console.error(
            "Could not load event notification subscriptions",
            error,
          );
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  async notificationLevelChanged(
    eventId: string,
    level: EventNotificationLevel,
  ): Promise<void> {
    if (this.savingEventIds().has(eventId)) return;
    this.savingEventIds.update((ids) => new Set(ids).add(eventId));
    try {
      await this.liveUpdates.setNotificationLevel(eventId, level);
    } catch (error) {
      console.error("Could not update event notifications", error);
      this.snackbar.open(
        $localize`:@@event_subscriptions.save_error:Could not update event notifications.`,
        $localize`:@@event_subscriptions.dismiss:Dismiss`,
        { duration: 5000 },
      );
    } finally {
      this.savingEventIds.update((ids) => {
        const next = new Set(ids);
        next.delete(eventId);
        return next;
      });
    }
  }

  private async _resolveEvents(
    subscriptions: EventNotificationSubscription[],
  ): Promise<EventSubscriptionRow[]> {
    const rows = await Promise.all(
      subscriptions.map(async ({ eventId, level }) => {
        try {
          const event = await this.events.getEventById(eventId as EventId);
          return event ? { event, level } : null;
        } catch (error) {
          console.warn(
            "Skipping an unavailable event notification subscription",
            { eventId, error },
          );
          return null;
        }
      }),
    );

    return rows
      .filter((row): row is EventSubscriptionRow => row !== null)
      .sort((a, b) => a.event.start.getTime() - b.event.start.getTime());
  }
}
