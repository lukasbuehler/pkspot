import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventLiveUpdate } from "../../../db/models/EventLiveUpdate";
import type { EventLiveUpdateType } from "../../../db/schemas/EventLiveUpdateSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";

const UPDATE_TYPE_LABELS: Readonly<Record<EventLiveUpdateType, string>> = {
  event_cancelled: $localize`Event cancelled`,
  event_restored: $localize`Event restored`,
  event_rescheduled: $localize`Event rescheduled`,
  program_item_update: $localize`Program item updated`,
  program_plan_activated: $localize`Program plan changed`,
  meet_up_time: $localize`Meet-up time`,
  location_spot_change: $localize`Location/Spot change`,
  schedule_change: $localize`Schedule change`,
  weather_update: $localize`Weather update`,
  session_starting_soon: $localize`Session starting soon`,
  general_update: $localize`General event update`,
};

@Component({
  selector: "app-event-live-updates",
  host: {
    "[hidden]": "isEmpty()",
  },
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: "./event-live-updates.component.html",
  styleUrl: "./event-live-updates.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventLiveUpdatesComponent {
  private readonly liveUpdates = inject(EventLiveUpdatesService);
  private readonly analytics = inject(AnalyticsService);
  private readonly dateTime = inject(DateTimeFormatService);
  private readonly viewedUpdateIds = new Set<string>();

  readonly event = input.required<PkEvent>();
  readonly updates = signal<EventLiveUpdate[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly isEmpty = computed(
    () => !this.loading() && !this.failed() && this.updates().length === 0,
  );

  constructor() {
    effect((onCleanup) => {
      const eventId = this.event().id;
      this.loading.set(true);
      this.failed.set(false);
      const subscription = this.liveUpdates.observeUpdates(eventId).subscribe({
        next: (updates) => {
          this.updates.set(updates);
          this.loading.set(false);
          for (const update of updates) {
            if (this.viewedUpdateIds.has(update.id)) continue;
            this.viewedUpdateIds.add(update.id);
            this.analytics.trackEvent("live_update_viewed", {
              event_id: eventId,
              update_type: update.type,
            });
          }
        },
        error: (error) => {
          console.warn("Failed to observe event live updates", error);
          this.loading.set(false);
          this.failed.set(true);
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  updateTypeLabel(type: EventLiveUpdateType): string {
    return UPDATE_TYPE_LABELS[type];
  }

  formatTimestamp(date: Date): string {
    return this.dateTime.formatPreset(date, "short");
  }

  linkedSpotName(spotId: string | undefined): string {
    if (!spotId) return "";
    return (
      this.event().inlineSpots.find((spot) => spot.id === spotId)?.name ?? spotId
    );
  }
}
