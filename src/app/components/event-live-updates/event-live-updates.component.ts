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

const STANDARD_UPDATE_TITLES: Readonly<
  Partial<Record<EventLiveUpdateType, string>>
> = {
  event_cancelled: "Event cancelled",
  event_restored: "Event restored",
  event_rescheduled: "Event rescheduled",
  program_item_update: "Program item updated",
  program_plan_activated: "Event plan changed",
  meet_up_time: "Meet-up time",
  location_spot_change: "Location/Spot change",
  schedule_change: "Schedule change",
  weather_update: "Weather update",
  session_starting_soon: "Session starting soon",
  general_update: "General event update",
};

interface LiveUpdateViewModel {
  update: EventLiveUpdate;
  displayTitle?: string;
  timingChange?: string;
}

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
  readonly updateItems = computed<LiveUpdateViewModel[]>(() =>
    this.updates().map((update) => ({
      update,
      displayTitle:
        STANDARD_UPDATE_TITLES[update.type] === update.title
          ? undefined
          : update.title,
      timingChange: this.rescheduleTimingChange(update),
    })),
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

  private rescheduleTimingChange(update: EventLiveUpdate): string | undefined {
    if (update.type !== "event_rescheduled") return undefined;
    const changedPair = changedTimingPair(
      update.previousScheduledFor,
      update.scheduledFor,
      update.previousScheduledUntil,
      update.scheduledUntil,
    );
    if (!changedPair) return undefined;

    const timeZone = this.event().timeZone;
    const dateKey = (date: Date): string =>
      this.dateTime.format(date, {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    const delta = formatTimingDelta(
      changedPair[1].getTime() - changedPair[0].getTime(),
    );
    if (dateKey(changedPair[0]) === dateKey(changedPair[1])) {
      const date = this.dateTime.format(changedPair[0], {
        timeZone,
        dateStyle: "medium",
      });
      const previousTime = this.dateTime.format(changedPair[0], {
        timeZone,
        timeStyle: "short",
      });
      const nextTime = this.dateTime.format(changedPair[1], {
        timeZone,
        timeStyle: "short",
      });
      return `${date}, ${previousTime} → ${nextTime} (${delta})`;
    }
    const previous = this.dateTime.format(changedPair[0], {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    });
    const next = this.dateTime.format(changedPair[1], {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    });
    return `${previous} → ${next} (${delta})`;
  }
}

function changedTimingPair(
  previousStart: Date | undefined,
  nextStart: Date | undefined,
  previousEnd: Date | undefined,
  nextEnd: Date | undefined,
): readonly [Date, Date] | undefined {
  if (previousStart && nextStart && previousStart.getTime() !== nextStart.getTime()) {
    return [previousStart, nextStart];
  }
  if (previousEnd && nextEnd && previousEnd.getTime() !== nextEnd.getTime()) {
    return [previousEnd, nextEnd];
  }
  return undefined;
}

function formatTimingDelta(milliseconds: number): string {
  const sign = milliseconds >= 0 ? "+" : "-";
  let minutes = Math.round(Math.abs(milliseconds) / 60_000);
  const days = Math.floor(minutes / (24 * 60));
  minutes -= days * 24 * 60;
  const hours = Math.floor(minutes / 60);
  minutes -= hours * 60;
  const parts = [
    ...(days ? [`${days} d`] : []),
    ...(hours ? [`${hours} h`] : []),
    ...(minutes || (!days && !hours) ? [`${minutes} min`] : []),
  ];
  return `${sign}${parts.join(" ")}`;
}
