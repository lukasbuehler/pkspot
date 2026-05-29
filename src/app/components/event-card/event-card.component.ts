import { NgOptimizedImage, NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { LocaleCode } from "../../../db/models/Interfaces";
import { Event as PkEvent } from "../../../db/models/Event";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";
import { EventRsvpComponent } from "../event-rsvp/event-rsvp.component";
import { MatTooltip } from "@angular/material/tooltip";
import { formatDateRange } from "../../../scripts/Helpers";

type EventStatus = "upcoming" | "live" | "past";

@Component({
  selector: "app-event-card",
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    MatCardModule,
    MatIconModule,
    RouterLink,
    MediaPlaceholderComponent,
    EventRsvpComponent,
    MatTooltip,
  ],
  templateUrl: "./event-card.component.html",
  styleUrl: "./event-card.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCardComponent {
  private _locale = inject<LocaleCode>(LOCALE_ID);

  event = input.required<PkEvent>();
  selectMode = input(false);
  select = output<PkEvent>();

  readonly status = computed<EventStatus>(() => this.event().status());
  readonly dateRange = computed(() => {
    const event = this.event();
    return formatDateRange(event.start, event.end, this._locale, "long");
  });
  readonly route = computed(() => [
    "/events",
    this.event().slug ?? this.event().id,
  ]);
  readonly statusLabel = computed(() => {
    const event = this.event();
    const status = this.status();
    if (status === "past") {
      return $localize`:@@events.status.past:Past event`;
    }

    const target = status === "live" ? event.end : event.start;
    const relative = this._relativeFromNow(target);
    if (status === "live") {
      return $localize`:@@events.status.live_with_end:Ongoing — ends ${relative}`;
    }
    return $localize`:@@events.status.upcoming_starts:Starts ${relative}`;
  });

  onSelect(): void {
    this.select.emit(this.event());
  }

  private _relativeFromNow(target: Date): string {
    const diffMs = target.getTime() - Date.now();
    if (diffMs <= 0) {
      return $localize`:@@events.now_or_past:now`;
    }
    const formatter = new Intl.RelativeTimeFormat(this._locale, {
      numeric: "always",
    });

    const hours = Math.round(diffMs / 3_600_000);
    if (hours < 48) {
      return hours >= 2
        ? formatter.format(hours, "hour")
        : formatter.format(1, "hour");
    }

    const days = Math.max(1, Math.round(diffMs / 86_400_000));
    if (days < 14) return formatter.format(days, "day");

    const weeks = Math.round(days / 7);
    if (weeks < 8) return formatter.format(weeks, "week");

    const months = Math.round(days / 30);
    return formatter.format(months, "month");
  }
}
